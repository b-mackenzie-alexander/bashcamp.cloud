# Bashcamp Deployment Runbook

Milestones 6 and 7 add deployment artifacts plus a lightweight SQLite-backed
auth/data foundation. **No live deployment** should happen until the branch is
reviewed and the operator explicitly approves running commands on the VPS.

## Target

- Host: Hetzner CX32
- OS: Ubuntu 22.04
- Domain: `bashcamp.cloud`
- DNS: Porkbun `A` record pointing `bashcamp.cloud` to the VPS IPv4 address
- App directory: `/opt/bashcamp`
- Frontend web root: `/var/www/bashcamp`
- SQLite database: `/opt/bashcamp/data/bashcamp.sqlite`

## Topology

- The API runs in Docker Compose and listens on `127.0.0.1:3000`.
- Caddy runs as a host systemd service and terminates HTTPS for `bashcamp.cloud`.
- Caddy serves `frontend/` from `/var/www/bashcamp`.
- Caddy proxies `/api/*` to the API and `/t/{port}/` to host-side ttyd ports.
- Student lab containers attach to the `bashcamp-net` Docker bridge network.
- The API stores users and session metadata in SQLite at `data/bashcamp.sqlite`.
- `config/users.json` is a first-run seed/import file, not the long-term active
  credential database.

## Operator Prerequisites

1. Point Porkbun DNS at the VPS:

   ```text
   A    bashcamp.cloud    <VPS IPv4>    TTL 300
   ```

2. Clone or fetch this repository on the VPS.

3. Create `deploy/.env` from the example and replace the secret:

   ```bash
   cp deploy/.env.example deploy/.env
   openssl rand -hex 32
   ```

4. Generate `config/users.json` offline with bcrypt password hashes. Do not commit
   `config/users.json`; it is intentionally gitignored. On first API startup,
   Bashcamp imports this file into SQLite if the database has no users yet.

   ```json
   {
     "users": [
       {
         "username": "student01",
         "password_hash": "$2b$12$replace_with_real_bcrypt_hash"
       }
     ]
   }
   ```

## Safe Setup

Run setup only after `deploy/.env` and `config/users.json` exist on the host:

```bash
sudo APP_DIR=/opt/bashcamp BRANCH=develop ./deploy/setup.sh
```

The script is idempotent. It installs Docker, Caddy, Git, curl, and UFW; syncs
`/opt/bashcamp`; creates `/opt/bashcamp/data`; builds base images; creates
`bashcamp-net`; installs the frontend and Caddyfile; starts the API with Compose;
reloads Caddy; and allows only SSH, HTTP, and HTTPS through UFW.

## User Operations

After the API has started once, create additional closed-test users from the API
container. The generated plaintext password is printed once and is never stored.

```bash
cd /opt/bashcamp
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  npm run user:create -- --username student04 --role student
```

To re-import a bcrypt-hashed JSON file into SQLite:

```bash
cd /opt/bashcamp
docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec api \
  npm run users:import -- --file /config/users.json
```

Keep registration closed for MVP testing. There is no public signup endpoint.

## Database Backup

Back up the SQLite database before deployment changes or destructive testing:

```bash
sudo cp /opt/bashcamp/data/bashcamp.sqlite \
  "/opt/bashcamp/data/bashcamp.sqlite.$(date +%Y%m%d%H%M%S).bak"
```

The database stores users, bcrypt hashes, and session metadata. It does not store
plaintext passwords or long-lived terminal secrets.

## Validation

Run these checks after setup:

```bash
docker compose -f /opt/bashcamp/deploy/docker-compose.yml --env-file /opt/bashcamp/deploy/.env ps
systemctl status caddy --no-pager
caddy validate --config /etc/caddy/Caddyfile
curl -I https://bashcamp.cloud
curl -sS https://bashcamp.cloud/api/health
curl -sS https://bashcamp.cloud/api/scenarios
docker network inspect bashcamp-net
```

Expected behavior:

- `https://bashcamp.cloud` serves the frontend.
- `/api/health` returns `{"status":"ok","database":"ok","users":"ok"}`.
- `/api/scenarios` returns `401` without a JWT.
- ttyd ports `9000-9099` are not reachable directly from the internet.
- Login, scenario start, terminal attach, reset, and reconnect work in the browser.
- Restarting the API container cleans up stale session metadata and orphaned lab
  containers instead of preserving terminal access across restart.

## Rollback

To roll back the API and frontend to the previous Git revision:

```bash
cd /opt/bashcamp
git log --oneline -5
git checkout <previous-good-commit>
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build api
cp -R frontend/. /var/www/bashcamp/
systemctl reload caddy
```

To stop the API without removing data:

```bash
cd /opt/bashcamp
docker compose -f deploy/docker-compose.yml --env-file deploy/.env down
```

## Accepted Risks

- The API container mounts `/var/run/docker.sock` so it can create and destroy lab
  containers. This is the highest-risk deployment boundary and should not be
  expanded without review.
- The API image runs as root for MVP because access to the mounted Docker socket
  is already root-equivalent and the process must launch Docker/ttyd operations.
  Post-MVP, evaluate a Docker socket proxy or fixed host Docker group mapping.
- Lab containers run real Linux with systemd and the minimum capabilities needed
  for `sudo`, `su`, and realistic Linux+ scenarios.
- `config/users.json` and `data/bashcamp.sqlite` are deployment secrets even
  though they contain bcrypt hashes rather than plaintext passwords. They must
  stay local to the VPS.
- Public signup is intentionally absent for MVP testing because authenticated
  accounts can create Docker-backed lab containers.

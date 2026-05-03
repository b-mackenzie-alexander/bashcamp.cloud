# Bashcamp Deployment Runbook

Milestone 6 adds deployment artifacts only. **No live deployment** should happen
until the branch is reviewed and the operator explicitly approves running the
commands on the VPS.

## Target

- Host: Hetzner CX32
- OS: Ubuntu 22.04
- Domain: `bashcamp.cloud`
- DNS: Porkbun `A` record pointing `bashcamp.cloud` to the VPS IPv4 address
- App directory: `/opt/bashcamp`
- Frontend web root: `/var/www/bashcamp`

## Topology

- The API runs in Docker Compose and listens on `127.0.0.1:3000`.
- Caddy runs as a host systemd service and terminates HTTPS for `bashcamp.cloud`.
- Caddy serves `frontend/` from `/var/www/bashcamp`.
- Caddy proxies `/api/*` to the API and `/t/{port}/` to host-side ttyd ports.
- Student lab containers attach to the `bashcamp-net` Docker bridge network.

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
   `config/users.json`; it is intentionally gitignored.

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
`/opt/bashcamp`; builds base images; creates `bashcamp-net`; installs the frontend
and Caddyfile; starts the API with Compose; reloads Caddy; and allows only SSH,
HTTP, and HTTPS through UFW.

## Validation

Run these checks after setup:

```bash
docker compose -f /opt/bashcamp/deploy/docker-compose.yml --env-file /opt/bashcamp/deploy/.env ps
systemctl status caddy --no-pager
caddy validate --config /etc/caddy/Caddyfile
curl -I https://bashcamp.cloud
curl -sS https://bashcamp.cloud/api/scenarios
docker network inspect bashcamp-net
```

Expected behavior:

- `https://bashcamp.cloud` serves the frontend.
- `/api/scenarios` returns `401` without a JWT.
- ttyd ports `9000-9099` are not reachable directly from the internet.
- Login, scenario start, terminal attach, reset, and reconnect work in the browser.

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
- `config/users.json` is a deployment secret even though it contains bcrypt hashes.
  It must stay local to the VPS.

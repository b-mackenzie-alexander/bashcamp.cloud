# Bashcamp — Architecture

**Version:** 0.1 (MVP)

---

## Overview

Bashcamp is a single-VM containerized lab platform. Each student session gets an
isolated Docker container running a real Linux distribution, accessed via a
browser-based terminal proxied through Caddy. A lightweight session management API
handles container lifecycle. All components run on one Hetzner CX32 VPS.

```
Student browser
      │
      │ HTTPS (443)
      ▼
┌─────────────────────────────────────────────────────┐
│  Caddy (reverse proxy + automatic TLS)              │
│                                                     │
│  bashcamp.cloud/          → frontend (static HTML)  │
│  bashcamp.cloud/api/*     → session API             │
│  bashcamp.cloud/t/:port/* → ttyd (terminal proxy)  │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
           ▼                          ▼
    ┌─────────────┐          ┌────────────────┐
    │ Session API │          │ ttyd processes │
    │ (Node.js / │          │ (one per active│
    │  Express)  │◄────────►│  session)      │
    └──────┬──────┘          └───────┬────────┘
           │                         │
           ▼                         ▼
    ┌─────────────────────────────────────────┐
    │           Docker Engine                 │
    │                                         │
    │  ┌──────────┐  ┌──────────┐            │
    │  │ session  │  │ session  │  ...        │
    │  │ abc123   │  │ def456   │            │
    │  │(ubuntu)  │  │(ubuntu)  │            │
    │  └──────────┘  └──────────┘            │
    └─────────────────────────────────────────┘
```

---

## Components

### Caddy

**Role:** Reverse proxy, TLS termination, request routing.

**Why Caddy:** Automatic certificate provisioning and renewal via Let's Encrypt
with zero configuration. A single Caddyfile block handles the entire routing layer.
No manual certificate management, no nginx ssl_certificate directives. The frontend
is served by Caddy's built-in `file_server` — no nginx service needed.

**Configuration (`Caddyfile`):**
```
bashcamp.cloud {
    handle /api/* {
        reverse_proxy localhost:3000
    }

    @terminal {
        path_regexp terminal ^/t/([0-9]+)/
    }
    handle @terminal {
        forward_auth localhost:3000 {
            uri /api/session/terminal-auth
            header_up X-Forwarded-Port {http.regexp.terminal.1}
            copy_headers X-Ttyd-Authorization
        }

        reverse_proxy localhost:{http.regexp.terminal.1} {
            header_up Authorization {http.request.header.X-Ttyd-Authorization}
        }
    }

    handle {
        root * /var/www/bashcamp
        file_server
    }
}
```

The `@terminal` named matcher captures the ttyd port number from the path using a
regex capture group. `{http.regexp.terminal.1}` resolves to that captured value at
request time, so `/t/9001/` proxies to `localhost:9001`. No `args.id` placeholder —
that does not exist in Caddy v2. Before proxying terminal traffic, Caddy calls
`/api/session/terminal-auth`; the API validates the student's HttpOnly terminal
cookie and returns the Basic Auth header that ttyd expects.

TLS is automatic. Caddy provisions a certificate on first request to the domain
and renews it transparently. Requires port 80 and 443 open on the VPS firewall
and the domain A record pointing at the VPS IP.

---

### Session API

**Role:** Container lifecycle management — create, destroy, status. Auth token
validation. Idle timeout enforcement.

**Responsibilities:**
- Authenticate users against the local SQLite credential store
- Issue session tokens (JWT or signed random token)
- Spawn Docker container for a scenario on session create
- Start a ttyd process attached to that container, on an assigned port
- Register the port mapping so Caddy can route `/t/:port/` to it
- Destroy container + ttyd process on reset, logout, or idle timeout
- Enforce one active session per user

**Endpoints:**
```
POST /api/auth/login              { username, password } → { token }
POST /api/auth/logout             header: Authorization  → 200
GET  /api/health                  unauthenticated        → { status, database, users }
GET  /api/session                 header: Authorization  → { status, scenario_id, terminal_url, disconnected_at, expires_at }
POST /api/session/start           { scenario_id }        → { session_id, terminal_url } + terminal cookie
POST /api/session/reconnect       header: Authorization  → { terminal_url } + terminal cookie | 410 Gone
POST /api/session/reset           header: Authorization  → { session_id, terminal_url } + terminal cookie
GET  /api/scenarios               header: Authorization  → [ scenario meta list ]
GET  /api/scenarios/:id/readme    header: Authorization  → { scenario_id, markdown }
GET  /api/session/terminal-auth   Caddy forward_auth only → 204 + X-Ttyd-Authorization | 401
```

`/api/session/reconnect` returns the new terminal URL if the container is still
alive within the 15-minute reconnect window. Returns `410 Gone` if the window has
closed and the container was destroyed. The frontend should call `GET /api/session`
on page load to determine whether to offer reconnect or start-fresh.

**Session lifecycle:**

```
[active] ──── browser terminal disconnects ───► [disconnected] ──── 15 min ───► [destroyed]
                                                     │
                                              user reconnects
                                                     │
                                                     ▼
                                                 [active]
```

- **Active:** ttyd process running, WebSocket connection open, container live.
- **Disconnected:** ttyd exits or is terminated. Container remains alive. Session
  is marked `disconnected` with a timestamp.
- **Reconnect window:** 15 minutes from disconnect. If the user hits
  `POST /api/session/reconnect` within this window, the API spawns a new ttyd
  process against the same live container and returns a new `terminal_url`.
  The container state (including any in-progress work) is fully preserved.
- **Destroyed:** After the 15-minute reconnect window closes, the container and all
  state are destroyed.

A background process polls session state every 60 seconds. Current MVP behavior
tracks disconnect time by recording when ttyd exits. Exact terminal-input idle
detection is deferred until the platform has a terminal activity tracker or
WebSocket-aware proxy layer.

**Post-MVP:** A store function — persisting container state to a snapshot and
resuming it later — is architecturally feasible but out of scope for MVP. Sessions
are ephemeral; no state survives beyond the reconnect window after disconnect.

**Credential store (MVP):**
```json
{
  "users": [
    { "username": "student01", "password_hash": "$2b$10$..." },
    { "username": "student02", "password_hash": "$2b$10$..." }
  ]
}
```
Hashed with bcrypt. Instructor generates credentials offline and distributes
them out of band. `config/users.json` is imported into the local SQLite database
on first API startup if no users exist yet. After import, SQLite is the runtime
credential store. No self-registration in MVP.

**SQLite data foundation (MVP testing):**
- Database path: `DATABASE_PATH`, defaulting to `data/bashcamp.sqlite` locally and
  `/data/bashcamp.sqlite` in production Compose.
- Tables: `users`, `sessions`, and `session_events`.
- Session rows store lifecycle metadata only. Terminal secrets and ttyd process
  IDs remain process-local and are not written to disk.
- On API startup, stale `active` or `disconnected` session rows from a prior
  process are reconciled by destroying their containers if present and marking
  the rows `destroyed`. API restarts therefore clean up safely, but do not yet
  provide terminal reconnect across process restarts.

---

### Docker container layer

**Role:** Isolated Linux environment per user session.

**Base images:**

`bashcamp/ubuntu-22.04-base` — built from `docker/base-ubuntu/Dockerfile`

What the base image includes beyond stock Ubuntu 22.04:
- Common sysadmin tools: `vim`, `nano`, `less`, `curl`, `wget`, `net-tools`,
  `iproute2`, `man-db`, `bash-completion`
- User management tools: `passwd`, `shadow`, `sudo`
- Service infrastructure: `systemd` (in compatible mode), `cron`, `rsyslog`
- No scenario personas; scenario users such as `kgarcia` and `jdeng` are created
  by `provision.sh`
- A realistic `/etc/` structure — not minimal
- `ttyd` is NOT in the container — it runs on the host, attached to the container
  via `docker exec`

**Container launch pattern:**
```bash
docker run -d \
  --name session-${SESSION_ID} \
  --hostname bashcamp-lab \
  --memory 512m \
  --cpus 1.0 \
  --network bashcamp-net \              # isolated network, no inter-container routing
  --cap-drop ALL \                      # drop all capabilities
  --cap-add CHOWN \                     # restore only what sysadmin scenarios need
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --cap-add KILL \
  --cap-add SETUID \
  --cap-add SETGID \
  --cap-add SYS_ADMIN \                 # required for su, sudo, user switching
  --security-opt no-new-privileges:false \   # scenarios require SUID/privilege escalation
  --tmpfs /run \                        # systemd requires a writable /run at startup
  --tmpfs /run/lock \
  --cgroupns=host \                     # allow systemd cgroup management on cgroup v2 hosts
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \             # systemd reads cgroup state from the host hierarchy
  bashcamp/ubuntu-22.04-base \
  /sbin/init                                        # systemd as PID 1 — required for services to work
```

Student lab containers do not mount the scenario repository. The API container
mounts `../scenarios:/scenarios:ro` for metadata, README, provision, and objective
check files, then copies the specific script it needs into `/tmp` inside the lab
container before execution. This prevents students from listing scenario packages
or platform internals from the terminal.

Rocky Linux containers use `/usr/lib/systemd/systemd` rather than `/sbin/init` as
the entrypoint — the symlink target differs between distros. The API selects the
correct entrypoint based on the distro declared in `meta.json`.

The container image must set `ENTRYPOINT ["/sbin/init"]` (or `/lib/systemd/systemd`).
Without systemd as PID 1, `systemctl`, `journalctl`, `polkit`, and `pkexec` do not
function — which breaks core scenario objectives. The `--tmpfs` mounts and cgroup
flags are required for systemd to initialize inside a container.

`--security-opt no-new-privileges:false` is the default Docker behavior (privilege
escalation via SUID binaries is permitted). The flag is included explicitly to document
intent: containers are allowed to escalate privileges because scenarios require it.

After container start, `provision.sh` is copied from the API container into the
lab container and executed as root:
```bash
docker cp /scenarios/${SCENARIO_ID}/provision.sh session-${SESSION_ID}:/tmp/provision.sh
docker exec session-${SESSION_ID} bash /tmp/provision.sh
```

**ttyd attachment (host-side):**
```bash
ttyd --port ${ASSIGNED_PORT} \
     --writable \                                          # allow keyboard input in the browser terminal
     --credential ${SESSION_ID}:${TERMINAL_SECRET} \      # HTTP Basic Auth — see note below
     docker exec -it --user sr_sysadmin session-${SESSION_ID} /bin/bash -l
```

Caddy proxies `/t/${ASSIGNED_PORT}/` to `localhost:${ASSIGNED_PORT}`.

**Auth rationale — HttpOnly cookie plus Caddy-injected Basic Auth:**
`--credential` instructs ttyd to require an HTTP Basic Auth header on the WebSocket
upgrade request. The API issues a per-session terminal secret and stores it in an
HttpOnly cookie scoped to `/t/`; terminal URLs returned to the frontend contain
only the ttyd port path, never credentials. Caddy calls the API's
`/api/session/terminal-auth` endpoint before proxying terminal traffic. If the
cookie matches an active session and the requested port, the API returns
`X-Ttyd-Authorization`; Caddy copies that value into the upstream `Authorization`
header for ttyd. This keeps secrets out of URLs, browser history, and proxy logs
while preserving ttyd's native Basic Auth gate.

`--token` does not exist in ttyd. Do not use it.

**Port allocation:** API maintains an in-memory pool for live ttyd processes.
Ports 9000-9099 are reserved for ttyd instances (supports 100 concurrent sessions,
well above our needs). Session metadata is persisted in SQLite for audit and
cleanup, but live terminal routing still depends on process-local ttyd state.

**Known limitation — restart reconnect is not implemented.** If the API process
restarts, active terminal cookies and ttyd process tracking are lost. On startup,
the API marks prior open sessions destroyed and force-removes their containers to
avoid stale state blocking students. For MVP testing this is safer than attempting
to preserve terminal access with stale secrets. Post-MVP: rebuild terminal access
after restart by rotating terminal secrets and respawning ttyd for still-valid
containers, or move to a richer session coordinator.

---

### Scenario system

**Structure:**
```
scenarios/
└── privilege-escalation-01/
    ├── meta.json        # machine-readable metadata
    ├── provision.sh     # executed inside container at session start
    └── README.md        # student-facing instructions
```

**meta.json schema:**
```json
{
  "id": "privilege-escalation-01",
  "title": "Broken Sudoers",
  "distro": "ubuntu-22.04",
  "difficulty": "beginner",
  "duration_minutes": 20,
  "objectives": ["3.1", "3.3", "3.4"],
  "requires_cap_sys_admin": true,
  "description": "A syntax error in /etc/sudoers has locked out privilege escalation. Restore sudo access without logging in as root."
}
```

**provision.sh contract:**
- Runs as root inside the container
- Must be idempotent (safe to run multiple times without side effects)
- Must exit 0 on success
- Must complete within 30 seconds — this is a hard ceiling, not a guideline
- **No package installation.** `apt install` and `dnf install` are forbidden in
  `provision.sh`. A cold package install takes 30–90 seconds over the network and
  blows the startup budget. Base images must pre-install everything a scenario
  family needs. If a scenario requires a tool that is not in the base image, the
  answer is a plugin — a Dockerfile that extends the base image — not a runtime
  install. CI enforces shellcheck on provision.sh; contributors who try to use
  `apt` will see the violation immediately.
- Scope: user and group creation, file content modification, log seeding,
  configuration corruption — everything a scenario needs to establish its
  broken initial state. Nothing else.

**Scenario zero — "Broken Sudoers" (MVP):**

Maps to Linux+ objectives 1.5, 3.1, 3.3, 3.4 (the privilege escalation chapter).

```bash
#!/bin/bash
set -euo pipefail

# Create student user
useradd -m -s /bin/bash kgarcia
echo "kgarcia:linux+practice" | chpasswd

# Add kgarcia to sudo group (correct)
usermod -aG sudo kgarcia

# Corrupt the sudoers file with a syntax error
# Student must use pkexec visudo or recovery technique to fix it
echo "kgarcia ALL=(ALL:ALL) ALL BADSYNTAX" >> /etc/sudoers

# Add some realistic system state
useradd -m -s /bin/bash jdeng
echo "jdeng:changeme" | chpasswd

# Seed some log entries
logger "Failed password for root from 192.168.1.105"
logger "sudo: pam_unix(sudo:auth): authentication failure"
```

Student objective: fix `/etc/sudoers` so that `kgarcia` can use `sudo` correctly.
They must figure out that direct editing is dangerous and that `visudo` is the tool,
or use `pkexec visudo` if sudo is already broken.

---

### Frontend (MVP)

Single `index.html`. No framework. No build step.

**Screens:**
1. **Login** — username + password form → POST `/api/auth/login`
2. **Scenario select** — list from GET `/api/scenarios` → POST `/api/session/start`
3. **Lab** — scenario README rendered as markdown, embedded ttyd terminal iframe,
   reset button → POST `/api/session/reset`
4. **Reconnect** — on page load, GET `/api/session`; active or disconnected sessions
   call POST `/api/session/reconnect` to refresh terminal auth and iframe URL

The terminal is an `<iframe>` pointing at the Caddy-proxied ttyd URL. This is
intentionally minimal — the terminal is the product, not the UI around it.

Markdown rendering uses `marked.js` via CDN — no build step, one script tag. The
README markdown is loaded through `GET /api/scenarios/:id/readme`, so the frontend
does not need direct filesystem access. No framework is introduced for MVP. If the
frontend grows beyond one HTML file, that decision gets made then.

---

## Deployment

**Target:** Hetzner CX32 (4 vCPU / 8GB RAM / 80GB SSD) running Ubuntu 22.04

**Bootstrap (`deploy/setup.sh`):**
```
1. apt update + install Docker, Caddy
2. Clone bashcamp repo to /opt/bashcamp
3. Build base Docker images (ubuntu-22.04-base, rocky-9-base)
4. Create Docker network: docker network create --driver bridge bashcamp-net
5. Copy Caddyfile to /etc/caddy/Caddyfile
6. Copy frontend/ to /var/www/bashcamp
7. Start session API (systemd service or docker compose up -d)
8. Start Caddy (systemd service)
9. Configure UFW: allow 22 (SSH), 80 (HTTP), 443 (HTTPS), deny all else
```

`bashcamp-net` must exist before any user container starts — the API's `docker run`
command references it by name. `deploy/setup.sh` is the single place to create it.
The script is idempotent: `docker network create` is safe to re-run if the network
already exists (`|| true` on the create command handles the "already exists" error).

**DNS setup (Porkbun):**
```
A    bashcamp.cloud    →    [VPS IP]    TTL 300
```

Caddy handles everything after DNS propagates. No additional configuration.

**docker-compose.yml (production):**
```yaml
services:
  api:
    build:
      context: ..
      dockerfile: api/Dockerfile
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # API controls Docker
      - ../scenarios:/scenarios:ro
      - ../config/users.json:/config/users.json:ro
      - ../data:/data
    ports:
      - "127.0.0.1:3000:3000"   # localhost only — Caddy proxies externally
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - USERS_FILE=/config/users.json
      - DATABASE_PATH=/data/bashcamp.sqlite
      - SCENARIOS_PATH=/scenarios
      - SESSION_TIMEOUT_MINUTES=30
      - RECONNECT_WINDOW_MINUTES=15
```

The frontend is served directly by Caddy's built-in `file_server` from
`/var/www/bashcamp` — no nginx service required. This eliminates one dependency and
one port mapping. If serving requirements grow beyond what Caddy's file server
handles (unlikely for MVP), nginx can be added back without architectural change.

Note: Caddy and user session containers run directly on the host (not in compose).
Caddy owns ports 80/443 as a systemd service. The API runs in Compose with the
host Docker socket mounted and starts ttyd processes from inside the API container;
those ttyd processes bind host ports 9000-9099 and are reachable only through Caddy.

Milestone 6 deployment artifacts live in `deploy/`. They are runbook-first: the
repository provides an idempotent setup script and Compose file, but live VPS,
DNS, and firewall changes require explicit operator approval.

---

## Security model

### What is isolated
- Each container has its own network namespace — no inter-container routing
- Each container has its own filesystem — bind mounts are read-only where possible
- ttyd instances require HTTP Basic Auth (per-session credential) to connect
- ttyd ports (9000-9099) are not exposed externally — Caddy proxies them

### What is intentionally permissive (and why)
- Containers have `SYS_ADMIN` capability — required for `sudo`, `su`, `useradd`
  to work correctly inside the container. This is the core product requirement.
  Mitigated by user namespace remapping and network isolation.
- Containers have network access — preserved so `systemd` services and realistic
  network tooling work as expected in a real server environment. Not used for
  package installation (which is forbidden in `provision.sh`). Mitigated by the
  `bashcamp-net` bridge network blocking inter-container routing.

### What is deferred to post-MVP
- User namespace remapping (`userns-remap`) for defense-in-depth
- Per-container network egress filtering (allow apt repos only)
- Rate limiting on session creation
- Audit logging of terminal sessions

### Threat model (MVP)
Primary risk: a student escapes their container and affects the host or another
student's container. Mitigated by: capability restrictions, network namespace
isolation, no shared volumes between user containers. The platform is not exposed
to anonymous internet users — credentials are distributed by the instructor.

---

## Scaling path (post-MVP, not now)

This architecture supports the MVP cohort (10 users, 4-5 concurrent) on a single
VM with comfortable headroom. If Bashcamp grows:

**Dual-distro scenarios (near-term)**
Rocky Linux 9 base image is already planned. The `distro_pair` field in `meta.json`
links sister scenarios across distro families. The session API selects the correct
base image at container launch. No architectural change required — this is a data
change (new base image + new scenarios) on top of existing infrastructure.

**Timed mode (near-term)**
The `timed` field in `meta.json` is already in the schema. Implementation: the
session API records `session_start_time`, the frontend polls for elapsed time and
renders a countdown. No container changes required.

**Narrative and dynamic scenarios (medium-term)**
The `dynamic` field in `meta.json` flags scenarios with cascading state. A watcher
process monitors container state against checkpoints registered by `provision.sh`
and triggers follow-on scripts when conditions are met or missed. The container
model supports this without change — it's a layer on top of the session API.

**Plugin system (medium-term)**
A plugin is a Dockerfile extending a base image. Scenarios declare plugin
dependencies in `meta.json`. The session API resolves the correct image (e.g.
`bashcamp/ubuntu-22.04-nginx`) at container launch. Contributors add plugins via
PR; CI builds and pushes to GitHub Container Registry.

**Multiple VMs (longer-term)**
Add Nomad (simpler than Kubernetes for this use case) to schedule containers across
VMs. The session API becomes a scheduler client. The external session contract
(create/destroy/status) does not change.

**Persistent progress (longer-term)**
Add Postgres for session history and scenario completion tracking. The session API
already has the right shape — add persistence without changing the external contract.

**This is Echo_Shell**
The architecture described here is a direct precursor to Echo_Shell's "danger room"
design — isolated environments, scenario state management, session lifecycle,
community-contributed content. Build Bashcamp's foundations well and the hard
architectural problems of Echo_Shell are already solved.

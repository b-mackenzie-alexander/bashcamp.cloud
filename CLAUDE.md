# Bashcamp — CLAUDE.md

## Project identity

**Bashcamp** (`bashcamp.cloud`) is an open source, cloud-based Linux lab platform.
It gives sysadmin students browser-based access to isolated, authentic Linux server
environments pre-configured with realistic production state. Built initially to support
a cohort of 10 CompTIA Linux+ exam candidates, designed to scale to any group or
individual studying for Linux certification.

**Tagline:** Real Linux. Real commands. Real practice.

---

## Developer context

- Lead: Beatrice — cybersecurity practitioner, secure software developer, DevSecOps orientation
- Experience: Strong Python, TypeScript, Next.js, Supabase, Railway (Compindium project)
- Cloud deployment: intentionally learning through this project — avoid over-abstracting,
  explain infrastructure decisions inline as comments or companion notes
- Security posture: treat this as production from day one — no shortcuts on isolation,
  auth, or container security

---

## Absolute constraints

- Every scenario container must be a **real, full Linux distribution** — no mocked
  commands, no simulation layer. If `sudo`, `visudo`, `systemctl`, `journalctl`,
  `useradd`, `chmod` don't work exactly as they would on a production server,
  the platform has failed its core purpose.
- **Container isolation is non-negotiable.** Each user session gets its own container.
  No shared namespaces between user containers. Containers run as unprivileged where
  possible; any required privileges must be explicitly justified.
- **No vendor lock-in on the session layer.** The session management API must be
  deployable to any Linux VPS — Hetzner, DigitalOcean, Linode, OCI.
- **Scenario portability.** A scenario is a bash script + a markdown file. No DSL,
  no framework dependency. Anyone who knows bash can contribute one.
- **Dual-distro from the start.** Linux+ tests both Debian and Red Hat families.
  Both `ubuntu-22.04` and `rocky-9` are first-class base images built and CI-tested
  from day one. Every scenario declares its distro in `meta.json`. A scenario written
  for Ubuntu is not automatically portable to Rocky — contributors must declare and
  test their target. **The first scenario targets Ubuntu 22.04** — CompTIA CertMaster
  content is predominantly demonstrated on Debian-family systems, so Ubuntu is the
  right starting point for the cohort. Rocky Linux scenarios are the next contribution
  priority after the MVP ships.
- **DevSecOps is the development standard, not a phase.** Security is a baseline,
  not a tack-on. CI/CD pipelines, container isolation, image patching, and schema
  validation are in place from day one. No shortcuts deferred to "later."

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Container runtime | Docker | Universal, well-documented, Claude Code native |
| Reverse proxy / TLS | Caddy | Automatic Let's Encrypt, minimal config |
| Browser terminal | ttyd | Lightweight, no client install required |
| Session API | Node.js (Express) or Python (FastAPI) | Choose based on task; keep it small |
| Base OS images | Ubuntu 22.04 LTS + Rocky Linux 9 | Covers Debian and RHEL exam families |
| Domain | bashcamp.cloud (Porkbun) | Registered |
| Target host | Hetzner CX32 (4 vCPU / 8GB RAM) | ~$8/month, sufficient for 4-5 concurrent |

---

## Repository structure

```
bashcamp/
├── CLAUDE.md                  # this file
├── PRD.md                     # product requirements
├── ARCHITECTURE.md            # system design reference
├── GITHUB_WORKFLOWS.md        # CI/CD pipeline specification (before .yml files)
├── SECURITY.md                # security standards and vulnerability disclosure
├── AGENTS.md                  # guide for AI agents contributing to the project
├── README.md                  # public-facing OSS intro
├── CONTRIBUTING.md            # scenario contribution guide
├── .gitignore                 # excludes private docs, secrets, build artifacts
│
│   # Private — gitignored, not in public repo
├── ROADMAP.md                 # milestone checklist and build progress
├── NOTES.md                   # chronological decision and discovery log
├── KNOWLEDGE.md               # technical quirks and gotchas
├── CURRENT_WORK.md            # active session context
├── docker/
│   ├── base-ubuntu/           # Ubuntu 22.04 base image
│   │   └── Dockerfile
│   └── base-rocky/            # Rocky Linux 9 base image
│       └── Dockerfile
├── scenarios/
│   ├── _template/             # canonical scenario structure
│   │   ├── provision.sh       # applied to container at session start
│   │   ├── meta.json          # title, objective, distro, difficulty, exam objectives
│   │   └── README.md          # student-facing instructions + hints
│   └── privilege-escalation/  # first scenario (maps to Linux+ obj 3.1/3.3/3.4)
│       ├── provision.sh
│       ├── meta.json
│       └── README.md
├── api/
│   ├── index.js (or main.py)
│   ├── routes/
│   │   ├── sessions.js        # create / destroy / status
│   │   └── scenarios.js       # list available scenarios
│   └── lib/
│       └── docker.js          # Docker SDK wrapper
├── proxy/
│   └── Caddyfile
├── frontend/
│   └── index.html             # MVP: login + start lab + terminal iframe + reset
└── deploy/
    ├── setup.sh               # idempotent VPS bootstrap script
    └── docker-compose.yml     # production compose config
```

---

## MVP scope (Friday–Sunday)

The Sunday deliverable must have exactly these things working:

1. A user visits `bashcamp.cloud`, sees a login page
2. They authenticate (static user list is fine for MVP)
3. They select a scenario (one scenario is enough for day one)
4. A container spins up, provisioned with the scenario's `provision.sh`
5. They get a browser terminal (ttyd) pointing at that container
6. They can run real Linux commands
7. A reset button destroys and reprovisions the container
8. The container spins down after 30 minutes of inactivity

Nothing else is in scope for Sunday. No user management UI, no progress tracking,
no multiple scenario selection, no pretty design.

---

## Scenario format (canonical)

### meta.json
```json
{
  "id": "privilege-escalation-01",
  "title": "Broken Sudoers",
  "distro": "ubuntu-22.04",
  "distro_pair": "privilege-escalation-01-rocky",
  "difficulty": "beginner",
  "duration_minutes": 20,
  "timed": false,
  "dynamic": false,
  "objectives": ["3.1", "3.3", "3.4"],
  "description": "The sudoers file has a syntax error. Restore privilege escalation without locking yourself out."
}
```

**Field notes:**
- `distro` — required. `ubuntu-22.04` or `rocky-9`. A scenario is written for one distro.
- `distro_pair` — optional. ID of the sister scenario on the other distro family,
  if one exists. Allows the UI to offer "switch distro" without a code change.
- `timed` — optional, default false. When true, the platform starts a visible countdown
  at session start. Post-MVP feature; include the field now so the schema supports it.
- `dynamic` — optional, default false. When true, the scenario has cascading state
  (consequences appear based on student actions). Post-MVP feature; included for
  forward compatibility.

### provision.sh
A bash script that runs as root inside the container after base image startup.
It must be idempotent (safe to run multiple times) and exit 0 on success.
It must complete within 30 seconds.

**Hard rule: no package installation.** `apt install` and `dnf install` are
forbidden. Package installation at session time violates the 30-second startup
budget and makes the scenario non-deterministic (network conditions, mirror
availability). All packages must be pre-installed in the base image. If a scenario
needs a tool that the base image lacks, the answer is a plugin — a Dockerfile
extending the base image — not a runtime install. CI shellcheck will catch apt/dnf
usage and block the PR.

Scenario personas (`kgarcia`, `jdeng`, etc.) are **not** pre-created in the base
image. They are scenario-specific characters created by `provision.sh`. The base
image contains tools and structure, not scenario state.

```bash
#!/bin/bash
set -euo pipefail

# Create scenario user — NOT in the base image
useradd -m -s /bin/bash kgarcia
echo "kgarcia:linux+practice" | chpasswd
usermod -aG sudo kgarcia

# Corrupt the sudoers file to create the scenario condition
echo "kgarcia ALL=(ALL:ALL) ALL BADSYNTAX" >> /etc/sudoers

# Realistic system state
useradd -m -s /bin/bash jdeng
echo "jdeng:changeme" | chpasswd

# Seed log entries
logger "Failed password for root from 192.168.1.105"
logger "sudo: pam_unix(sudo:auth): authentication failure"
```

---

## Security ground rules

- Container user for student sessions: non-root by default, sudo available per scenario
- No container gets `--privileged` flag unless a specific scenario explicitly requires it
  and it is documented in meta.json with justification
- ttyd instances are not publicly exposed — all traffic routes through Caddy with
  session token validation
- Idle containers are destroyed, not paused — no persistent state between sessions
  unless a scenario explicitly requires it (none in MVP do)
- Base images are rebuilt weekly in CI to pick up OS security patches
- Docker socket access in the session API is the single highest-risk element in the
  architecture — treat it carefully, document it explicitly, never expand its scope

---

## CI/CD pipeline (from day one)

Security and quality are enforced structurally — in the pipeline and in pre-commit
hooks. The goal is discipline, not specific tool choices. Tools can be swapped;
the gates cannot be removed.

### Branch and merge discipline

```
feat/*, fix/*, doc/*, hotfix/* → develop → main
hotfix/* → main (emergency path only)
```

- Branch names must match `^(feat|fix|doc|hotfix)/.+` — enforced in CI on every PR
- Direct pushes to `develop` and `main` are warned on (non-blocking in MVP,
  blocking post-MVP when contributors are active)
- PRs to `main` must come from `develop` or `hotfix/*` — feature branches never
  go directly to `main`
- All PR workflows use `concurrency: cancel-in-progress: true` to avoid burning
  CI minutes on stale runs
- All workflows declare `permissions: contents: read` — principle of least privilege

### Workflow structure (3 files)

**`ci.yml` — runs on every PR to `develop`**
```
jobs:
  branch-guard:        Validate branch naming convention
  validate-scenarios:  meta.json schema check + shellcheck on provision.sh
                       + run provision.sh against declared distro only (not both)
  build-images:        docker build ubuntu-22.04-base + rocky-9-base
```

**`security.yml` — runs on every PR to `main` + weekly schedule**
```
jobs:
  secrets-scan:        TruffleHog (--only-verified) across full git history
  image-scan:          Trivy on both base images — fail on HIGH or CRITICAL
  dependency-audit:    Audit API package dependencies for known CVEs
```

**`weekly.yml` — scheduled, runs independently of PRs**
```
jobs:
  rebuild-images:      docker build both base images (pulls latest OS patches)
  rescan:              Trivy re-scan after rebuild
  notify:              Open automated PR or issue if new CVEs found
```

### The validate-scenarios job — distro targeting

`provision.sh` is tested against the distro declared in that scenario's `meta.json`,
not against both base images. A Ubuntu scenario using standard Linux tools will
likely run on Rocky too, but that is not guaranteed and is not the contract.
Testing against the wrong distro produces false confidence. The rule:

```
read distro from meta.json
if distro == "ubuntu-22.04": run provision.sh against bashcamp/ubuntu-22.04-base
if distro == "rocky-9":      run provision.sh against bashcamp/rocky-9-base
assert exit 0
```

If a contributor wants to claim cross-distro compatibility, they submit a sister
scenario (linked via `distro_pair`) that is independently tested against the other
image. There is no implicit portability.

### What shellcheck enforces in provision.sh

The shellcheck step treats any use of `apt`, `apt-get`, `dnf`, or `yum` as a
violation. This enforces the "no package installation at runtime" rule structurally.
Contributors who attempt a runtime install see a CI failure with a clear message
before reviewers ever look at the PR.

### Pre-commit hooks (local dev)

Contributors run these locally before pushing — CI is the backstop, not the first
line of defense:
- shellcheck on any modified `provision.sh`
- JSON schema validation on any modified `meta.json`
- TruffleHog secrets scan on staged files

This pipeline means: a contributor cannot merge a scenario with a malformed
`meta.json`, a broken `provision.sh`, a shell script that fails shellcheck, or
a runtime package install. Quality is structural, not dependent on reviewer attention.

---

## OSS contribution model

Scenarios live in `scenarios/`. Each is a self-contained directory following the
template. To contribute: fork, copy `_template`, fill in the three files, open a PR.
The `meta.json` schema is validated in CI. No other contribution pathway in MVP —
keep it simple so people actually contribute.

**Distro pairing:** Contributors are encouraged (not required) to submit sister
scenarios for the other distro family. The `distro_pair` field in `meta.json` links
them. Same broken condition, different package manager, different group conventions —
this is valuable exam prep and the community will build it out naturally.

**Plugin model (post-MVP):** A plugin is a base image layer — a Dockerfile that
extends `bashcamp/ubuntu-22.04-base` or `bashcamp/rocky-9-base` and adds a
third-party tool (Nginx, MySQL, HAProxy, Ansible, etc.). Scenarios declare their
plugin dependencies in `meta.json`. The platform pulls the right image. Contributors
can add real-world tooling to the scenario library without touching core platform
code.

---

## Product vision (north star)

> The closest thing to real sysadmin experience you can get without being on call.

The growth path beyond MVP, in order of priority:

1. **Dual-distro scenario pairs** — same scenario, Ubuntu and Rocky, linked via
   `distro_pair`. Covers both Linux+ exam families.
2. **Timed mode** — visible countdown, score based on time-to-resolution.
   Tests judgment under pressure, not just knowledge.
3. **Narrative scenarios** — a ticket appears at session start: "User jdeng called
   the helpdesk at 8:47am — can't sudo, getting permission denied. Server is
   running but the deployment pipeline failed overnight." Student triages, not
   just fixes. Multiple faults, realistic context.
4. **Dynamic/cascading state** — the environment responds to what the student does.
   Fix one thing incorrectly and a new symptom appears. Closer to a flight
   simulator than a textbook.
5. **Plugin system** — community-contributed base image layers for third-party tools.
   Core platform stays minimal; community adds everything else.

Do not build any of this during the MVP sprint. Document it so contributors
understand what they are building toward.

---

## What to build first (session order)

1. `docker/base-ubuntu/Dockerfile` — Ubuntu 22.04 base image with systemd as PID 1
2. `docker/base-rocky/Dockerfile` — Rocky Linux 9 base image (built and CI-tested
   alongside Ubuntu from day one; no scenarios target it in MVP)
3. `scenarios/privilege-escalation/` — first complete scenario, Ubuntu-targeted,
   maps to CompTIA CertMaster privilege escalation content
4. `api/` — session management (create/destroy/reconnect/status, ttyd lifecycle)
5. `proxy/Caddyfile` — route bashcamp.cloud → frontend (file_server), /api/* → API,
   /t/:id/* → ttyd via regex capture
6. `frontend/index.html` — login, scenario select, terminal iframe, reset button
7. `deploy/setup.sh` + `docker-compose.yml` — one-command VPS bootstrap

Build and test each layer before moving to the next.

---

## Definition of done (MVP)

A classmate with no technical setup can open `bashcamp.cloud` on their laptop,
log in, start the privilege escalation scenario, and run `sudo visudo` to fix a
broken sudoers file — using the same commands they'd use on a real Ubuntu server.

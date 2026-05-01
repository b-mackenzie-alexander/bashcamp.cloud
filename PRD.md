# Bashcamp — Product Requirements Document

**Version:** 0.1 (MVP)
**Status:** Pre-build
**Target:** bashcamp.cloud
**Timeline:** Friday–Sunday build, Monday delivery to cohort

---

## Problem

Sysadmin and Linux certification candidates have no accessible way to practice in
an environment that feels like a real production server. Local VMs require setup,
lack authentic pre-configured state, and don't replicate the friction of inheriting
a system someone else configured. Study guides give commands to memorize; no widely
available platform gives you a broken server and says "fix it."

CompTIA Linux+ specifically tests scenario-based competency — not command recall.
Candidates who can recite `visudo` syntax but have never debugged a broken sudoers
file under pressure are underprepared.

---

## Who this is for

**Primary:** Individuals and small cohorts (5-20 people) preparing for CompTIA
Linux+ (XK0-006) or similar certifications (LPIC-1, RHCSA).

**Secondary:** Self-directed learners who want hands-on Linux sysadmin practice
without managing their own lab infrastructure.

**Tertiary:** Instructors who want to assign specific scenarios to students without
building infrastructure themselves.

---

## Core value proposition

> A real Linux server, in your browser, already broken in exactly the way the exam
> will test you on. No setup. Reset when you're done. Try again.

The authenticity of the environment is the product. If a command works differently
here than it does on a real Ubuntu or Rocky Linux server, the platform has failed.

---

## User stories

### Must have (MVP — Sunday)

**As a student,** I can open bashcamp.cloud in a browser and log in without
installing anything on my machine.

**As a student,** I can start a lab scenario with one click and get a working
terminal within 30 seconds.

**As a student,** I can run any standard Linux command (`sudo`, `systemctl`,
`useradd`, `chmod`, `journalctl`, `visudo`, etc.) exactly as I would on a real server.

**As a student,** I can reset my environment to the original broken state when I
want to try again.

**As a student,** if I close my browser and return within 15 minutes, I can reconnect
to my existing session and pick up where I left off.

**As a student,** my session automatically cleans up after 45 minutes of total
inactivity (30 minutes idle + 15-minute reconnect window) so I don't have to think
about resource management.

**As an instructor,** I can give 10 students login credentials and have them all
working independently without any per-student infrastructure setup.

### Should have (post-MVP, next week)

**As a student,** I can choose from multiple scenarios mapped to specific Linux+
exam objectives.

**As a student,** I can practice the same scenario on either Ubuntu 22.04 or
Rocky Linux 9 — covering both Debian and RHEL exam families — and switch between
them to understand the differences (package managers, group conventions, config
paths).

**As a student,** I can see which exam objectives a scenario covers before starting.

**As a student,** I can see hints if I'm stuck, without seeing the full solution.

**As an instructor,** I can see which students have completed which scenarios.

### Could have (future)

**As a student,** I can attempt a timed scenario with a visible countdown, simulating
the pressure of real incident response work.

**As a student,** I receive a narrative context at session start — a ticket, a
manager message, a helpdesk call — so I have to triage and prioritize rather than
just fix a known fault.

**As a student,** the environment responds to my actions — fixing one thing
incorrectly causes a new symptom to appear, reflecting how real system faults
cascade.

**As a contributor,** I can submit a new scenario via pull request using a documented
template without needing to understand the platform infrastructure.

**As a contributor,** I can submit a base image plugin (Dockerfile extending the
base image) that adds a third-party tool — Nginx, MySQL, HAProxy, Ansible — making
it available to any scenario that declares a dependency on it.

**As a student,** I can attempt timed scenarios that simulate exam conditions.

---

## Functional requirements

### Session lifecycle

- Session creation must complete (container running + terminal accessible) within
  30 seconds of user request
- Each user gets exactly one active session at a time
- Sessions idle-timeout after 30 minutes with no terminal input — container enters
  a "disconnected" state but is not immediately destroyed
- **Reconnect window:** 15 minutes from disconnect. A user who returns within this
  window resumes the same container with all in-progress state intact
- **Maximum resource hold:** 45 minutes from last terminal input. After that the
  container is destroyed regardless of reconnect attempts
- On timeout or manual reset: container is destroyed and reprovisioned from scratch
- No session state persists between resets — each reset is a clean slate
- **Post-MVP — session store:** Persisting container snapshots to a database so users
  can resume work across days is architecturally feasible but explicitly out of scope
  for MVP. Containers are ephemeral; no state survives beyond 45 minutes.

### Terminal environment

- Browser-based terminal, no client-side install required
- Full PTY (pseudo-terminal) — interactive commands like `vim`, `nano`, `less`,
  `top` must work correctly
- Terminal must support standard keyboard shortcuts (Ctrl+C, Ctrl+Z, Tab completion)
- Color output must render correctly (bash PS1, ls --color, etc.)

### Scenario system

- A scenario is defined entirely by three files: `provision.sh`, `meta.json`, `README.md`
- `provision.sh` runs as root inside the container at session start
- Scenario state must be reproducible — the same `provision.sh` must produce the
  same environment every time
- Base images (Ubuntu 22.04, Rocky Linux 9) are pre-built and cached — provision
  scripts run against these, not from scratch

### Authentication (MVP)

- Static credential list (username + bcrypt hashed password) stored in a config file
- No self-registration in MVP — instructor creates accounts
- Session token (JWT) issued on login, required for all API calls
- Auth tokens expire after 4 hours of inactivity (distinct from the 30-minute
  container idle timeout — a user can hold an auth token without an active container)
- Terminal access (ttyd) is gated by HTTP Basic Auth: a per-session randomly
  generated credential (`session_id:terminal_secret`). This credential is issued by
  the API at session start and valid only for the lifetime of that session. It is
  never written to disk or logged.

### Routing and TLS

- All traffic over HTTPS — Caddy handles certificate provisioning automatically
- Terminal sessions proxied through Caddy — ttyd ports never directly exposed
- Single domain: `bashcamp.cloud` for frontend and API, `/session/:id` for terminals

---

## Non-functional requirements

### DevSecOps (non-negotiable from day one)

Security and quality are enforced structurally, not assumed. This is the development
standard for all Bashcamp work, not a phase to be added later.

- CI validates every scenario's `meta.json` against schema before merge
- CI lints every `provision.sh` with shellcheck before merge
- CI runs every `provision.sh` against both base images and confirms exit 0
- Trivy scans base images for CVEs on every build; HIGH/CRITICAL findings fail the build
- Base images rebuild weekly on a schedule to pull OS security patches
- Docker socket access in the session API is explicitly documented as the
  highest-risk element in the architecture and never expanded in scope without review
- No secrets in source — JWT secret, credentials, and any future API keys are
  environment variables, never committed

### Dual-distro

Linux+ tests both Debian-family and Red Hat-family distributions. Both are
first-class targets from day one:

- `bashcamp/ubuntu-22.04-base` — Debian family
- `bashcamp/rocky-9-base` — RHEL family

Every scenario declares its target distro in `meta.json`. Scenarios are not
assumed to be portable between families. Contributors are encouraged to submit
paired scenarios (same fault, both distros) linked via the `distro_pair` field.
The platform spins up the correct base image based on `meta.json`.

The Linux environment inside each container must be indistinguishable from a real
server for the purposes of certification exam preparation. This means:

- Full systemd (where the distro supports it)
- Real package manager (apt, dnf) with network access for package installation
- Standard user/group management (`useradd`, `groupadd`, `passwd`, `usermod`)
- Working privilege escalation (`su`, `sudo`, `polkit`)
- Real log infrastructure (`journalctl`, `/var/log/`)
- Authentic `/etc/` structure — not minimal/stripped

### Isolation

- No network path between user containers
- No shared filesystem between user containers
- Resource limits per container: 1 vCPU, 512MB RAM (adjustable per scenario)

### Availability

- MVP target: best-effort (this is a study aid, not production infrastructure)
- Single VM deployment — no redundancy in MVP
- Recovery from VM restart: containers do not persist, users re-start sessions

### Performance

- Container start time: under 30 seconds (target under 15)
- Terminal latency: imperceptible for standard commands
- Concurrent sessions: 4-5 on a Hetzner CX32 without degradation

---

## Out of scope (MVP)

- User self-registration
- Password reset flow
- Progress tracking or completion records
- Scenario time limits
- Multiple simultaneous sessions per user
- Mobile browser support (desktop only for MVP)
- Rocky Linux *scenarios* — the Rocky 9 base image is built and tested from day one,
  but no scenarios are written for it in MVP. The first scenario targets Ubuntu 22.04,
  consistent with CompTIA CertMaster content. Rocky scenarios ship post-MVP.
- Any form of scenario scoring or automated verification
- Admin dashboard
- Session store / snapshot-resume across sessions

---

## Success criteria for Monday

A classmate with no prior knowledge of the platform can:

1. Open `bashcamp.cloud` on their laptop
2. Log in with credentials provided by the instructor
3. Start the privilege escalation scenario
4. Complete the scenario using only real Linux commands
5. Reset and try again without instructor intervention

If all five steps work reliably for all 10 users, the MVP is successful.

---

## Open source model

Bashcamp is open source from day one. The scenario library is the community asset —
the platform is the vehicle. Contribution model:

- Fork the repo
- Copy `scenarios/_template/`
- Fill in `provision.sh`, `meta.json`, `README.md`
- Open a PR

CI validates `meta.json` schema and lints `provision.sh`. No platform knowledge
required to contribute a scenario.

**Distro pairing:** Contributors are encouraged to submit sister scenarios for the
other distro family, linked via `distro_pair` in `meta.json`. Same broken condition,
different distro conventions — exactly what the Linux+ exam tests.

**Plugin model (post-MVP):** Contributors can submit base image layers — Dockerfiles
that extend the base Ubuntu or Rocky image with third-party tools (Nginx, MySQL,
HAProxy, Ansible, etc.). Scenarios declare plugin dependencies in `meta.json`. Core
platform stays minimal; the community adds real-world tooling without touching
platform code.

**North star:** A scenario library covering every Linux+ exam objective across both
distro families — with real-world narrative context, timed pressure, and cascading
consequences — built by the community of people who studied with Bashcamp.

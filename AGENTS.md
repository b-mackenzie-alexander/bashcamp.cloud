# Bashcamp — AI Agent Guide

This file is for AI agents (Claude, Copilot, Gemini, GPT, etc.) assisting with
Bashcamp development or scenario contribution. Read this before taking any action.

---

## What this project is

Bashcamp is a cloud-based Linux lab platform. Students get isolated Docker containers
running real Linux distributions (Ubuntu 22.04, Rocky Linux 9), accessed via a
browser terminal. Scenarios are pre-broken server environments; students fix them.
The platform is built for CompTIA Linux+ exam preparation.

**The core constraint:** Every Linux command must work exactly as it would on a real
production server. No simulation. No mocked commands. If `sudo`, `systemctl`,
`visudo`, or `journalctl` behave differently here than on a real server, the
platform has failed its purpose.

---

## Files to read first

Before doing any work, read these in order:

1. `CLAUDE.md` — absolute constraints, tech stack, build order, security ground rules
2. `ARCHITECTURE.md` — system design, component details, known limitations
3. `PRD.md` — product requirements and MVP scope
4. `CONTRIBUTING.md` — contribution workflow and scenario format

For CI/CD work: also read `GITHUB_WORKFLOWS.md`.
For security work: also read `SECURITY.md`.

---

## What you can safely do

- Write or modify files in `scenarios/`, `docker/`, `api/`, `proxy/`, `frontend/`,
  `deploy/`, `scripts/`, `.github/workflows/`
- Run read-only commands: `ls`, `cat`, `grep`, `find`, `docker images`, `docker ps`
- Run `shellcheck` on provision.sh files
- Validate `meta.json` against the schema in `scripts/validate-meta.js`
- Run `docker build` for base images (read ARCHITECTURE.md first — specific flags required)

## What requires explicit human approval

- Pushing to any branch
- Creating or merging pull requests
- Running `docker run` with user session containers in production
- Modifying `.github/workflows/` files
- Changing anything under `deploy/` that affects the live VPS
- Modifying `config/users.json` (contains credential hashes)
- Any action that affects the host Docker daemon on a live server

---

## Hard constraints — do not violate these

**No simulation.** Every scenario container must be a real Linux distribution.
No fake command outputs, no shell function overrides, no mock layers.

**No privileged containers.** Never add `--privileged` to a docker run command.
Specific capabilities are granted individually and documented in meta.json.
See ARCHITECTURE.md for the approved capability set.

**No apt/dnf/yum in provision.sh.** Package installation at session start time
violates the 30-second startup budget. All packages must be pre-installed in the
base image. If a scenario needs a package not in the base image, the solution is a
plugin (Dockerfile extending the base image), not a runtime install.

**No scenario personas in base images.** Users like `kgarcia` and `jdeng` are
scenario characters. They are created by `provision.sh` and destroyed with the
container. They must not be pre-created in `docker/base-ubuntu/` or
`docker/base-rocky/`.

**No secrets in source.** JWT secrets, credentials, and API keys are environment
variables only. Never write them to files that could be committed.

**provision.sh must be idempotent.** Running it twice must produce the same result.
It must exit 0 on success. It must complete in under 30 seconds.

**Scenarios target one distro.** A scenario written for Ubuntu 22.04 is not
automatically portable to Rocky Linux 9. Each scenario declares its distro in
`meta.json`. Cross-distro coverage is achieved by submitting a sister scenario
linked via `distro_pair`.

---

## Scenario contribution format

A scenario is exactly three files:

```
scenarios/<scenario-id>/
├── meta.json       — machine-readable metadata (validated by CI)
├── provision.sh    — bash script run as root inside container at session start
└── README.md       — student-facing instructions and hints (no solution)
```

**meta.json required fields:**
```json
{
  "id": "string — matches directory name",
  "title": "string",
  "distro": "ubuntu-22.04 | rocky-9",
  "difficulty": "beginner | intermediate | advanced",
  "duration_minutes": "integer",
  "objectives": ["array of Linux+ objective codes"],
  "description": "string — one sentence describing the broken state"
}
```

**provision.sh rules:**
- `#!/bin/bash` + `set -euo pipefail`
- No `apt`, `apt-get`, `dnf`, or `yum`
- Must exit 0
- Must be idempotent
- Must complete in under 30 seconds
- Runs as root inside the container

**README.md format:**
- Describe the scenario context (a ticket, a symptom, a call from a user)
- List what the student needs to accomplish
- Provide hints — not solutions
- Do not include the answer or the exact commands that fix the problem

---

## Planned CI gates — what will block your PR after Milestone 7

Until workflow files are implemented, run the equivalent local checks before
opening or merging a PR.

- Branch name does not match `^(feat|fix|doc|hotfix)/.+`
- `meta.json` fails schema validation
- `provision.sh` fails shellcheck
- `provision.sh` contains `apt`, `apt-get`, `dnf`, or `yum`
- `provision.sh` does not exit 0 against the declared base image
- `provision.sh` exceeds 30 seconds against the declared base image
- Dockerfile build fails or produces warnings
- Trivy finds HIGH or CRITICAL CVEs in a base image you modified
- TruffleHog detects a verified secret in your commit history

---

## Architecture decisions that affect your work

**Caddy routing** uses `path_regexp` named matchers — not `:param` syntax.
See ARCHITECTURE.md (Caddy section) for the correct pattern.

**ttyd auth** uses `--credential session_id:secret` (HTTP Basic Auth).
There is no `--token` flag. Do not use it. Do not put terminal credentials in
URLs. The frontend receives `/t/<port>/`; Caddy uses `forward_auth` to validate
the HttpOnly terminal cookie and inject ttyd's Basic Auth header upstream.

**systemd as PID 1** in containers requires specific docker run flags.
Never start a user container without the flags documented in ARCHITECTURE.md.

**Docker volume paths** passed to `docker run` are resolved on the HOST filesystem,
not inside the API container. Use the `SCENARIOS_HOST_PATH` env var.

---

## Getting help

- Architecture questions: read `ARCHITECTURE.md`
- Contribution process: read `CONTRIBUTING.md`
- Security concerns: read `SECURITY.md` and open a security issue per the process
  described there
- Anything else: open a GitHub issue with the `question` label

Repository: https://github.com/b-mackenzie-alexander/bashcamp.cloud

# Bashcamp — Security

## Reporting a vulnerability

If you find a security vulnerability in Bashcamp, please do not open a public
GitHub issue. Email the maintainer directly:

**maestracreative@gmail.com**

Repository: https://github.com/b-mackenzie-alexander/bashcamp.cloud

Include:
- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Your suggested fix, if you have one

You will receive a response within 48 hours. We will keep you informed as we
investigate and remediate. We do not offer a bug bounty at this time, but we
will credit you in the release notes if you wish.

---

## What we protect against

### Container escape

The primary risk for a platform like Bashcamp is a student escaping their
container and affecting the host or another student's container.

**Mitigations in place:**
- Each container runs with capabilities dropped to the minimum required:
  `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `KILL`, `SETUID`, `SETGID`, `SYS_ADMIN`
  All other capabilities are dropped with `--cap-drop ALL`
- `--privileged` is never used unless a scenario explicitly requires it and
  documents the justification in `meta.json`. No current scenario requires it.
- Each container has its own network namespace — no inter-container routing
- Containers run on an isolated bridge network (`bashcamp-net`) that blocks
  traffic between user containers
- All filesystem mounts into containers are read-only (`scenarios` volume)

**Known accepted risk:** `SYS_ADMIN` capability is required for `sudo`, `su`,
and user switching to work correctly inside containers. This is the core product
requirement — without it, the platform cannot deliver its value. This is documented
explicitly and is a conscious tradeoff, not an oversight. Post-MVP, user namespace
remapping (`userns-remap`) will provide additional defense-in-depth.

### Credential exposure

- All student passwords are bcrypt-hashed before storage — never stored in plaintext
- JWT secrets and all credentials are environment variables, never in source code
- Terminal access is gated by per-session HTTP Basic Auth credentials generated
  at session start and never written to disk or logged
- Terminal credentials are not embedded in URLs. The API stores the terminal
  credential in an HttpOnly cookie scoped to `/t/`, and Caddy validates that cookie
  with `/api/session/terminal-auth` before injecting the upstream ttyd Basic Auth
  header.
- Terminal ports (9000-9099) are never directly exposed — all traffic routes
  through Caddy over HTTPS
- TruffleHog scans every PR and weekly for secrets committed to the repository

### Unauthenticated access

- The platform is not exposed to anonymous internet users — credentials are
  distributed by the instructor
- All API endpoints require a valid JWT in the `Authorization` header
- Terminal access requires both a valid Caddy-proxied URL (path includes the ttyd
  port) and a valid per-session terminal cookie
- Caddy enforces TLS on all connections — no plaintext HTTP accepted

### Dependency vulnerabilities

- Base images (Ubuntu 22.04, Rocky Linux 9) are rebuilt weekly on a CI schedule
  to pull the latest OS security patches
- Trivy scans both base images on every build and on the weekly schedule
- HIGH and CRITICAL CVE findings fail the CI build — no merge until resolved
- API dependencies are audited for known CVEs in the security workflow

---

## What we scan and when

These are the intended automated gates for Milestone 7. Until workflow files are
implemented, run the corresponding local checks before opening or merging PRs.

| What | Tool | When |
|---|---|---|
| Committed secrets | TruffleHog (--only-verified) | Every PR to main + weekly |
| OS package CVEs (base images) | Trivy | Every image build + weekly |
| API dependencies | Package audit (npm audit / pip-audit) | Every PR to main |
| Shell scripts (provision.sh) | shellcheck | Every PR (scenario changes) |
| Runtime package installs in provision.sh | grep / shellcheck custom rule | Every PR (scenario changes) |

---

## What is not in scope for MVP (and why)

**User namespace remapping (`userns-remap`):** Provides defense-in-depth against
container escape by mapping container root to an unprivileged host user. Deferred
because `SYS_ADMIN` interacts with userns-remap in ways that require careful testing
on the target kernel version. Will be addressed post-MVP.

**Per-container egress filtering:** Restricting containers to only reach known apt/dnf
mirrors. Deferred because `provision.sh` no longer does package installation (it is
forbidden), so network egress from containers is for realistic service behavior only.

**Rate limiting on session creation:** Not needed for a 10-student cohort with
instructor-controlled credentials. Will be added before any public-facing deployment.

**Audit logging of terminal sessions:** ttyd does not natively log terminal I/O.
Post-MVP: implement logging via a wrapper or a terminal recording tool (e.g., asciinema).

---

## Architecture decisions driven by security

**Docker socket access** in the session API is the single highest-risk element in
the architecture. The socket gives root-equivalent access to the host Docker daemon.
Mitigations:
- The socket is mounted only into the API container, not any other service
- The API's scope of Docker operations is documented and never expanded without review
- Post-MVP: consider replacing direct socket access with a Docker socket proxy
  (e.g., Tecnativa/docker-socket-proxy) to limit which API calls are permitted

**ttyd is not directly exposed.** All ttyd instances listen on localhost-only ports
(9000-9099). The VPS firewall (UFW) blocks all external access to these ports.
Students access terminals exclusively through Caddy's HTTPS proxy.

**Terminal credentials stay out of URLs.** The frontend receives clean terminal
URLs such as `/t/9001/`. Caddy uses `forward_auth` to ask the API whether the
student's HttpOnly terminal cookie is valid for that port, then forwards the
corresponding Basic Auth header only to ttyd.

**Static credentials for MVP.** The credential store is a local JSON file with
bcrypt-hashed passwords. No database, no network auth service, no attack surface
on the auth layer beyond the API endpoint itself. Post-MVP: evaluate moving to a
proper identity provider if the cohort grows.

---

## Security posture: DevSecOps from day one

Security is a baseline, not a phase. The Milestone 7 CI/CD pipeline is specified
to enforce security gates on every contribution. Until those workflow files land,
reviewers should require the same checks manually. The goal is to make insecure
contributions structurally impossible, not to rely on reviewer attention.

See `GITHUB_WORKFLOWS.md` for the full CI/CD pipeline specification.

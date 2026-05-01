# Contributing to Bashcamp

Bashcamp is open source. The scenario library is the community asset — the platform
is the vehicle. If you've studied with Bashcamp, you know what a good scenario feels
like. Build one.

---

## What you can contribute

**Scenarios** are the primary contribution path. A scenario is three files in a
directory. No platform knowledge required — just bash and Linux.

**Base image improvements** — additions to `docker/base-ubuntu/` or
`docker/base-rocky/` that make the environment more realistic. Open an issue
before making changes here so we can discuss scope.

**Bug fixes and platform improvements** — open an issue first for anything that
touches `api/`, `proxy/`, or `deploy/`.

**Documentation** — always welcome. Same PR process.

---

## Scenario format

A scenario lives at `scenarios/<your-scenario-id>/` and contains exactly three files:

```
scenarios/privilege-escalation-01/
├── meta.json       — machine-readable metadata
├── provision.sh    — bash script that creates the broken environment
└── README.md       — student-facing instructions and hints
```

Copy `scenarios/_template/` to get started:
```bash
cp -r scenarios/_template scenarios/your-scenario-id
```

### meta.json

```json
{
  "id": "your-scenario-id",
  "title": "Short, descriptive title",
  "distro": "ubuntu-22.04",
  "difficulty": "beginner",
  "duration_minutes": 20,
  "objectives": ["3.1", "3.3"],
  "description": "One sentence: what is broken and what does the student need to fix."
}
```

**`distro`** — required. `ubuntu-22.04` or `rocky-9`. Pick one. Your scenario is
written for one distro family. If you want to cover both, submit a sister scenario
and link them via `distro_pair`.

**`difficulty`** — `beginner`, `intermediate`, or `advanced`. Beginner means a
student who has read the study guide but hasn't practiced can solve it in under 30
minutes. Advanced means a working sysadmin would still have to think.

**`objectives`** — CompTIA Linux+ (XK0-006) objective codes. Look them up in the
exam objectives document. Map your scenario to what it actually tests.

**`distro_pair`** (optional) — the `id` of the sister scenario on the other distro
family. If you've written the same scenario for both Ubuntu and Rocky, link them:
```json
"distro_pair": "privilege-escalation-01-rocky"
```

### provision.sh

This script runs as root inside the container at session start. It must create the
broken state that defines the scenario.

```bash
#!/bin/bash
set -euo pipefail

# Create the student user for this scenario
useradd -m -s /bin/bash kgarcia
echo "kgarcia:linux+practice" | chpasswd
usermod -aG sudo kgarcia

# Create the broken condition
echo "kgarcia ALL=(ALL:ALL) ALL BADSYNTAX" >> /etc/sudoers
```

**Rules — CI will enforce these and fail your PR if violated:**

1. Must start with `#!/bin/bash` and `set -euo pipefail`
2. **No `apt`, `apt-get`, `dnf`, or `yum`.** Package installation at session start
   violates the 30-second startup budget. All packages must already be in the base
   image. If your scenario needs a tool that isn't there, open an issue — we'll
   discuss adding it to the base image or creating a plugin.
3. Must exit 0 on success
4. Must be idempotent — safe to run twice without breaking anything
5. Must complete in under 30 seconds
6. Must pass shellcheck with no warnings

### README.md

This is what the student reads. Write it like a ticket or a helpdesk call, not a
textbook exercise.

**Good:**
> **Ticket #1047 — kgarcia can't sudo**
>
> User kgarcia called at 9:14am. They're getting "sudo: parse error in
> /etc/sudoers" and can't run any administrative commands. The server is otherwise
> healthy. Fix the sudoers file and restore kgarcia's sudo access.
>
> **Hint:** `visudo` validates the file before saving. If sudo is already broken,
> there's another way in.

**Bad:**
> Exercise: The sudoers file has a syntax error on line 28. Use visudo to fix it.
> The correct syntax is: `kgarcia ALL=(ALL:ALL) ALL`

Don't include the answer or the exact fix. The point is for the student to figure
it out. Hints are good; solutions are not.

---

## Submitting a scenario

1. Fork https://github.com/b-mackenzie-alexander/bashcamp.cloud
2. Create a branch: `feat/your-scenario-id`
3. Copy `scenarios/_template/` and fill in all three files
4. Test locally (see below)
5. Open a pull request to `develop`

CI will automatically validate your `meta.json`, lint your `provision.sh`, check
for forbidden package installation commands, run the provision script against the
base image, and confirm it exits 0 in under 30 seconds. Fix any failures before
requesting review.

---

## Testing locally before pushing

You need Docker installed.

**Build the base image:**
```bash
docker build docker/base-ubuntu/ -t bashcamp/ubuntu-22.04-base
# or
docker build docker/base-rocky/ -t bashcamp/rocky-9-base
```

**Run your provision.sh:**
```bash
SCENARIO=your-scenario-id
DISTRO=ubuntu-22.04  # or rocky-9

docker run -d --name test-scenario \
  --tmpfs /run --tmpfs /run/lock \
  --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:ro \
  --cap-drop ALL \
  --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
  --cap-add KILL --cap-add SETUID --cap-add SETGID --cap-add SYS_ADMIN \
  --security-opt no-new-privileges:false \
  bashcamp/${DISTRO}-base /sbin/init

docker exec test-scenario bash /dev/stdin < scenarios/${SCENARIO}/provision.sh
echo "Exit code: $?"

# Verify the broken state is set up correctly:
docker exec -it test-scenario /bin/bash

# Clean up:
docker rm -f test-scenario
```

**Validate your meta.json:**
```bash
node scripts/validate-meta.js scenarios/your-scenario-id/meta.json
```

**Shellcheck your provision.sh:**
```bash
shellcheck scenarios/your-scenario-id/provision.sh
```

---

## Distro pairing

The Linux+ exam tests both Debian and Red Hat families. A scenario written for
Ubuntu covers `apt`, `/etc/default/grub`, the `sudo` group, and AppArmor. The same
scenario for Rocky Linux covers `dnf`, `grub2-mkconfig`, the `wheel` group, and
SELinux. These differences are exactly what the exam tests.

If you submit a scenario for one distro and want to cover the other:
1. Create a second directory: `scenarios/your-scenario-id-rocky/`
2. Write a new `provision.sh` for Rocky (different commands, same broken condition)
3. Link them via `distro_pair` in both `meta.json` files

The platform will offer students the option to switch distros within the same
scenario category. Both must be independently working and independently tested.

---

## Code of conduct

Be constructive. Scenarios should be educational, not humiliating. Treat other
contributors the way you'd want to be treated when you were learning.

Security issues: see `SECURITY.md` — do not open public issues for vulnerabilities.

Project: https://github.com/b-mackenzie-alexander/bashcamp.cloud

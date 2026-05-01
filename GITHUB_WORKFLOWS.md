# Bashcamp — GitHub Workflows

Specification for `.github/workflows/`. This document describes what each workflow
does and why before the actual YAML is written. Implement the `.yml` files against
this spec — if the spec and a workflow disagree, the spec wins until the spec is
deliberately updated.

---

## Branch and merge model

```
feat/*, fix/*, doc/*, hotfix/* ──► develop ──► main
                                               ▲
                               hotfix/* ───────┘ (emergency path only)
```

- Feature branches merge to `develop`
- `develop` merges to `main` (scheduled releases or milestone completions)
- `hotfix/*` branches may merge directly to `main` and back-merge to `develop`
- Direct pushes to `develop` or `main` are warned on (non-blocking for MVP)
- All PR workflows use `concurrency: cancel-in-progress: true`
- All workflows declare `permissions: contents: read`

---

## Workflow 1: `branch-check.yml`

**Trigger:** `pull_request` to any branch

**Purpose:** Enforce branch naming and warn on direct pushes.

### Jobs

**`validate-branch-name`**
```
Runs: always
Steps:
  - Check that head_ref matches ^(feat|fix|doc|hotfix)/.+
  - Fail with descriptive error if not
  - Print allowed patterns and examples
```

**`push-guard`** (on `push` to `develop` or `main`)
```
Runs: on push events only
Steps:
  - Check if commit message matches PR merge patterns
    (starts with "Merge pull request #" or ends with "(#NNN)")
  - If not a merge commit: emit ::warning:: (non-blocking in MVP)
  - Warning message: who pushed, to which branch, commit SHA
```

---

## Workflow 2: `ci.yml`

**Trigger:** `pull_request` to `develop`; `workflow_dispatch`

**Concurrency:** `ci-${{ github.head_ref }}`, cancel-in-progress

**Purpose:** Validate all contributions before they reach develop. No merge
without passing all jobs.

### Job dependency graph

```
branch-guard ──► validate-scenarios ──► build-images
```

### Jobs

**`branch-guard`**
```
Steps:
  - Validate source branch name (same check as branch-check.yml)
  - Fail if source is 'main' (PRs from main to develop are not allowed)
```

**`validate-scenarios`** (needs: branch-guard)
```
Steps:
  - Find all scenarios/*/meta.json files
  - Run scripts/validate-meta.js on each — fail on schema errors
  - Run shellcheck on each scenarios/*/provision.sh — fail on any warning
  - Run apt/dnf/yum grep check on each provision.sh:
      grep -rE '\b(apt|apt-get|dnf|yum)\b' scenarios/*/provision.sh
      Fail if any match found — print the offending file and line
  - For each scenario, read distro from meta.json
  - Spin up a throwaway container for that distro's base image
  - docker cp provision.sh into container; docker exec bash provision.sh
  - Assert exit 0
  - Assert completion under 30 seconds
  - docker rm -f the container
  Note: test against DECLARED distro only — not both base images
```

**`build-images`** (needs: branch-guard)
```
Steps:
  - docker build docker/base-ubuntu/ --tag bashcamp/ubuntu-22.04-base
  - docker build docker/base-rocky/ --tag bashcamp/rocky-9-base
  - Fail on any build error or warning
  Note: images are built but not pushed in this workflow — push happens
  on merge to main via the weekly workflow or a future deploy workflow
```

---

## Workflow 3: `security.yml`

**Trigger:** `pull_request` to `main`; `schedule: cron: "0 9 * * 1"` (Monday 9am UTC)

**Purpose:** Security gate on the path to main, plus regular scheduled audit.
Runs independently of ci.yml — security checks are not blocked by CI failures.

**Concurrency:** `security-${{ github.head_ref || 'scheduled' }}`, cancel-in-progress

### Jobs (all run in parallel — no dependencies between them)

**`secrets-scan`**
```
Tool: TruffleHog (trufflesecurity/trufflehog@main)
Args: --only-verified
Scope: full git history (fetch-depth: 0)
Fail: if any verified secret found
```

**`image-scan`**
```
Tool: Trivy
Scope: bashcamp/ubuntu-22.04-base, bashcamp/rocky-9-base
  (build both images first, then scan)
Severity: HIGH, CRITICAL
Exit code: 1 on findings
Fail: if any HIGH or CRITICAL CVE found in OS packages
```

**`dependency-audit`**
```
Tool: npm audit --audit-level=high (if Node.js API)
   or pip-audit (if Python API)
Scope: api/ directory
Fail: on HIGH or CRITICAL findings
```

---

## Workflow 4: `weekly.yml`

**Trigger:** `schedule: cron: "0 6 * * 1"` (Monday 6am UTC, before security.yml runs)

**Purpose:** Keep base images patched. Pull latest OS packages weekly, rebuild,
re-scan. If new CVEs are found that weren't there last week, open an issue.

### Jobs

**`rebuild-images`**
```
Steps:
  - docker build --no-cache docker/base-ubuntu/ --tag bashcamp/ubuntu-22.04-base
  - docker build --no-cache docker/base-rocky/ --tag bashcamp/rocky-9-base
  - Push both to GitHub Container Registry (ghcr.io/bashcamp/*)
  Note: --no-cache ensures fresh OS package pulls from upstream
```

**`rescan`** (needs: rebuild-images)
```
Steps:
  - Trivy scan both freshly built images
  - If HIGH/CRITICAL found:
      - Open GitHub issue titled "Weekly Trivy scan — new CVEs found YYYY-MM-DD"
      - List CVEs, affected packages, severity
      - Assign to maintainer
  - If clean: post summary to workflow run log only
```

---

## Supporting script: `scripts/validate-meta.js`

**Purpose:** Validate each scenario's `meta.json` against the canonical schema.
Called by `validate-scenarios` in `ci.yml`.

**Schema (what it validates):**
```
Required fields:
  id          — string, matches parent directory name
  title       — string, non-empty
  distro      — enum: "ubuntu-22.04" | "rocky-9"
  difficulty  — enum: "beginner" | "intermediate" | "advanced"
  duration_minutes — integer, 1-120
  objectives  — array of strings, non-empty
  description — string, non-empty

Optional fields:
  distro_pair  — string (id of sister scenario)
  timed        — boolean (default false)
  dynamic      — boolean (default false)
  requires_cap_sys_admin — boolean (default false, must be true if scenario
                           uses su/sudo in a way that needs explicit SYS_ADMIN)
  plugins      — array of strings (post-MVP: plugin image dependencies)
```

**Exit codes:**
- 0: all meta.json files valid
- 1: one or more files failed validation; print file path + error per failure

---

## Pre-commit hooks (local dev, not CI)

Document here so contributors can set up local gates. CI is the backstop — these
run locally before a push to avoid CI round-trips for trivial issues.

**Tools required:** shellcheck, Node.js (for validate-meta.js), TruffleHog

**Hooks:**
```
pre-commit:
  - shellcheck on any staged provision.sh files
  - scripts/validate-meta.js on any staged meta.json files
  - grep check for apt/dnf/yum in staged provision.sh files

pre-push:
  - TruffleHog --only-verified on commits being pushed
```

**Setup:**
```bash
# Install pre-commit (optional — manual hook files also work)
pip install pre-commit
pre-commit install
pre-commit install --hook-type pre-push
```

A `.pre-commit-config.yaml` will be provided when the API language is decided
(affects which language runtime is in the hook environment).

---

## Environment variables required by workflows

```
Secrets (set in GitHub repository settings):
  JWT_SECRET          — used by API in test runs (if integration tests are added)
  GHCR_TOKEN          — GitHub token for pushing to Container Registry (weekly.yml)

No other secrets required for MVP workflows. TruffleHog uses GITHUB_TOKEN
(automatically available) for its GitHub integration.
```

---

## What the pipeline guarantees

A contribution cannot merge to `develop` without:
- Valid branch name
- All meta.json files passing schema validation
- All provision.sh files passing shellcheck with no warnings
- No apt/dnf/yum usage in any provision.sh
- Every provision.sh exiting 0 against its declared distro within 30 seconds
- Both base Dockerfiles building cleanly

A contribution cannot merge to `main` without:
- Passing all CI gates (via develop)
- TruffleHog finding no verified secrets
- Trivy finding no HIGH or CRITICAL CVEs
- API dependencies having no HIGH or CRITICAL known CVEs

The weekly schedule guarantees:
- Base images are rebuilt with current OS patches every week
- Any new CVEs are surfaced as GitHub issues before the next business day

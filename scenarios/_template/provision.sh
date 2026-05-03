#!/bin/bash
set -euo pipefail
# Rules: no apt/dnf/yum, exit 0, idempotent, completes in < 30 seconds.
# Create users, corrupt files, seed logs — nothing else.

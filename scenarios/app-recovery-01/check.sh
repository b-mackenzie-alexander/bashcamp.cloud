#!/bin/bash
# Objective validation for app-recovery-01.
# Runs as root inside the container. Outputs a JSON array of {id, label, passed}.
set -uo pipefail

results=()

if [[ "$(readlink -f /opt/myapp/current 2>/dev/null)" == "/opt/myapp/releases/2026.05.06" ]]; then
  results+=('{"id":"active-release","label":"active release points to 2026.05.06","passed":true}')
else
  results+=('{"id":"active-release","label":"active release points to 2026.05.06","passed":false}')
fi

if sudo -u deploy test -r /etc/myapp/worker.env 2>/dev/null; then
  results+=('{"id":"config-readable","label":"deploy can read the worker configuration","passed":true}')
else
  results+=('{"id":"config-readable","label":"deploy can read the worker configuration","passed":false}')
fi

if sudo -u deploy test -w /opt/myapp/logs 2>/dev/null; then
  results+=('{"id":"logs-writable","label":"deploy can write worker logs","passed":true}')
else
  results+=('{"id":"logs-writable","label":"deploy can write worker logs","passed":false}')
fi

if systemctl is-active --quiet myapp-worker.service; then
  results+=('{"id":"worker-active","label":"myapp-worker.service is active","passed":true}')
else
  results+=('{"id":"worker-active","label":"myapp-worker.service is active","passed":false}')
fi

if [[ -f /opt/myapp/logs/worker.log ]] && grep -q 'release=2026.05.06' /opt/myapp/logs/worker.log; then
  results+=('{"id":"worker-log","label":"worker writes logs from the expected release","passed":true}')
else
  results+=('{"id":"worker-log","label":"worker writes logs from the expected release","passed":false}')
fi

printf '[%s]\n' "$(IFS=','; echo "${results[*]}")"

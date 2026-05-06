#!/bin/bash
# Objective validation for inventory-service-01.
# Runs as root inside the container. Outputs a JSON array of {id, label, passed}.
set -uo pipefail

results=()

if systemctl is-active --quiet inventory-sync.service; then
  results+=('{"id":"service-active","label":"inventory-sync.service is active","passed":true}')
else
  results+=('{"id":"service-active","label":"inventory-sync.service is active","passed":false}')
fi

if systemctl is-enabled --quiet inventory-sync.service; then
  results+=('{"id":"service-enabled","label":"inventory-sync.service is enabled","passed":true}')
else
  results+=('{"id":"service-enabled","label":"inventory-sync.service is enabled","passed":false}')
fi

if [[ -f /var/lib/inventory-sync/last-sync ]] && grep -q 'warehouse-east' /var/lib/inventory-sync/last-sync; then
  results+=('{"id":"sync-marker","label":"inventory sync writes a current status marker","passed":true}')
else
  results+=('{"id":"sync-marker","label":"inventory sync writes a current status marker","passed":false}')
fi

if systemctl show inventory-sync.service -p EnvironmentFiles --value | grep -q '/etc/inventory-sync.conf'; then
  results+=('{"id":"unit-config","label":"service unit references the available configuration file","passed":true}')
else
  results+=('{"id":"unit-config","label":"service unit references the available configuration file","passed":false}')
fi

printf '[%s]\n' "$(IFS=','; echo "${results[*]}")"

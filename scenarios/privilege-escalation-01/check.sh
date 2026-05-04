#!/bin/bash
# Objective validation for privilege-escalation-01.
# Runs as root inside the container. Outputs a JSON array of {id, label, passed}.
set -uo pipefail

results=()

# Objective 1: sudoers file has valid syntax
if visudo -c &>/dev/null; then
  results+=('{"id":"sudoers-valid","label":"Sudoers file syntax is valid","passed":true}')
else
  results+=('{"id":"sudoers-valid","label":"Sudoers file syntax is valid","passed":false}')
fi

# Objective 2: kgarcia can use sudo
if sudo -l -U kgarcia 2>/dev/null | grep -q "(ALL)"; then
  results+=('{"id":"kgarcia-sudo","label":"kgarcia has sudo privileges","passed":true}')
else
  results+=('{"id":"kgarcia-sudo","label":"kgarcia has sudo privileges","passed":false}')
fi

printf '[%s]\n' "$(IFS=','; echo "${results[*]}")"

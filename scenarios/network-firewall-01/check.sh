#!/bin/bash
# Objective validation for network-firewall-01.
# Runs as root inside the container. Outputs a JSON array of {id, label, passed}.
set -uo pipefail

results=()

# Objective 1: port 80 is no longer dropped by nftables
# Pass if the ruleset contains no drop rule for dport 80
if ! nft list ruleset 2>/dev/null | grep -q 'dport 80 drop'; then
  results+=('{"id":"no-drop-80","label":"No DROP rule blocking port 80","passed":true}')
else
  results+=('{"id":"no-drop-80","label":"No DROP rule blocking port 80","passed":false}')
fi

# Objective 2: port 80 is actually reachable (webapp service responds)
if curl -s --max-time 3 http://127.0.0.1:80 | grep -q "Hello"; then
  results+=('{"id":"port-80-reachable","label":"HTTP service responds on port 80","passed":true}')
else
  results+=('{"id":"port-80-reachable","label":"HTTP service responds on port 80","passed":false}')
fi

# Objective 3: SSH is still allowed (student did not break the allow-ssh rule)
if nft list ruleset 2>/dev/null | grep -q 'dport 22 accept'; then
  results+=('{"id":"ssh-allowed","label":"SSH access is still permitted","passed":true}')
else
  results+=('{"id":"ssh-allowed","label":"SSH access is still permitted","passed":false}')
fi

printf '[%s]\n' "$(IFS=','; echo "${results[*]}")"

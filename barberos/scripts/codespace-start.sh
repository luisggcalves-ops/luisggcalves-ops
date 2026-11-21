#!/usr/bin/env bash
# Starts BarberOS in the background each time you open the codespace.
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -n "${CODESPACE_NAME:-}" ]; then
  # The public address Codespaces gives port 3000. Sign-in only works from this exact address.
  export BETTER_AUTH_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi

if [ ! -d .next ]; then npm run build; fi

if ! (echo > /dev/tcp/127.0.0.1/3000) 2>/dev/null; then
  nohup npx next start -p 3000 > /tmp/barberos.log 2>&1 &
  sleep 3
fi

cat <<MSG

  BarberOS is running at ${BETTER_AUTH_URL:-http://localhost:3000}
  (it opens in a new tab; if not, open the "Ports" tab and click the globe next to 3000)

  Owner:  owner@demo.barberos.test  / barberos-demo
  Barber: barber@demo.barberos.test / barberos-demo

MSG

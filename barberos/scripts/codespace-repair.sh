#!/usr/bin/env bash
# Fixes a codespace in one go: latest code, database, demo data, fresh build, restart, self-test.
# Usage (in the codespace terminal):  bash barberos/scripts/codespace-repair.sh
set -uo pipefail
cd "$(dirname "$0")/.."

echo "→ Getting the latest code…"
git pull --ff-only || echo "  (couldn't pull; continuing with the current code)"

echo "→ Installing…"
npm ci --no-audit --no-fund > /tmp/barberos-install.log 2>&1 || { echo "❌ Install failed. See /tmp/barberos-install.log"; exit 1; }

echo "→ Database…"
npm run --silent db:migrate || { echo "❌ The database isn't reachable. Rebuild the codespace (Ctrl/Cmd+Shift+P → 'Rebuild Container')."; exit 1; }
npm run --silent seed:demo

echo "→ Building (about a minute)…"
npm run build > /tmp/barberos-build.log 2>&1 || { echo "❌ Build failed. See /tmp/barberos-build.log"; exit 1; }

echo "→ Restarting…"
pkill -f "next start" 2>/dev/null; pkill -f next-server 2>/dev/null; sleep 1
bash scripts/codespace-start.sh > /dev/null
sleep 3

URL="https://${CODESPACE_NAME:-localhost}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
code=$(curl -s -o /tmp/barberos-selftest.json -w "%{http_code}" -X POST http://localhost:3000/api/auth/sign-in/email \
  -H "Origin: ${URL}" -H "Content-Type: application/json" \
  -d '{"email":"owner@demo.barberos.test","password":"barberos-demo"}')
if [ "$code" = "200" ]; then
  echo ""
  echo "✅ All good. Open ${URL} and click “Demo owner” on the sign-in page."
else
  echo ""
  echo "❌ Sign-in self-test failed (HTTP ${code}): $(head -c 300 /tmp/barberos-selftest.json)"
  echo "   Copy this message to Claude."
fi

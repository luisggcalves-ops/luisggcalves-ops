#!/usr/bin/env bash
# One-time setup when a codespace is created: dependencies, database, demo data, production build.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp .env.example .env
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  sed -i "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=${secret}|" .env
fi

npm ci

echo "Waiting for the database…"
for i in $(seq 1 30); do
  if npm run --silent db:migrate; then break; fi
  if [ "$i" = 30 ]; then echo "Database did not start" >&2; exit 1; fi
  sleep 2
done

npm run seed:demo
npm run build
echo "Setup complete."

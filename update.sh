#!/usr/bin/env bash
set -euo pipefail

git pull
npm install

has_env_var() {
  local name="$1"
  grep -Eq "^${name}=.+" .env 2>/dev/null
}

if [ -f .env ] && has_env_var "DISCORD_TOKEN" && has_env_var "DISCORD_CLIENT_ID"; then
  npm run deploy-commands
else
  echo "Skipping command deployment because .env is missing DISCORD_TOKEN or DISCORD_CLIENT_ID."
fi

echo "Update complete. Restart the Driftwatch service or run ./start.sh."

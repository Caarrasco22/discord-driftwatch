#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 18 or newer, then run this script again."
  exit 1
fi

echo "Detected Node.js: $(node --version)"
npm install
mkdir -p data logs

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill in your Discord token and application IDs."
else
  echo ".env already exists; leaving it unchanged."
fi

echo "Next steps:"
echo "1. Edit .env"
echo "2. Run: npm run deploy-commands"
echo "3. Run: npm start"

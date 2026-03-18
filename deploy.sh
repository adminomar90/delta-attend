#!/bin/bash
# ── Delta Plus Deploy Script ──
# Usage: bash deploy.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "══════════════════════════════════════"
echo "  Delta Plus - Deploy"
echo "══════════════════════════════════════"

# 1. Pull latest code
echo ""
echo "► Pulling latest code..."
git pull origin "$(git branch --show-current)"

# 2. Install API dependencies (if package.json changed)
echo ""
echo "► Installing API dependencies..."
cd "$SCRIPT_DIR/apps/api"
npm install --omit=dev

# 3. Install Web dependencies (if package.json changed)
echo ""
echo "► Installing Web dependencies..."
cd "$SCRIPT_DIR/apps/web"
npm install --omit=dev

# 4. Ensure .env.local exists for web
if [ ! -f .env.local ]; then
  echo ""
  echo "⚠  No .env.local found in apps/web!"
  echo "   Creating from .env.local.example..."
  if [ -f .env.local.example ]; then
    cp .env.local.example .env.local
    echo "   ✓ Created .env.local — please verify NEXT_PUBLIC_API_URL is correct!"
  else
    echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" > .env.local
    echo "   ✓ Created .env.local with default localhost API URL"
  fi
  echo ""
  echo "   Current value:"
  cat .env.local
  echo ""
fi

# 5. Rebuild Next.js
echo ""
echo "► Rebuilding Next.js web app..."
rm -rf .next
npm run build

# 6. Restart PM2 processes
echo ""
echo "► Restarting PM2 processes..."
cd "$SCRIPT_DIR"
pm2 restart delta-api --update-env
pm2 restart delta-web --update-env

# 7. Verify
echo ""
echo "► Verifying..."
sleep 3
pm2 status

echo ""
echo "══════════════════════════════════════"
echo "  ✓ Deploy complete!"
echo "══════════════════════════════════════"
echo ""
echo "Check logs: pm2 logs --lines 20"

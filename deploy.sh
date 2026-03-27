#!/bin/bash
# ============================================================
# ReelMaker — Deploy Script
# Usage: bash deploy.sh "commit message"
# ============================================================

set -e

PROJECT_DIR="/Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app"
DOWNLOADS="$HOME/Downloads"

# Commit message from argument or default
MSG="${1:-deploy update}"

cd "$PROJECT_DIR"

# Copy any new files from Downloads (only if they exist)
[ -f "$DOWNLOADS/server.js" ] && cp "$DOWNLOADS/server.js" ./server.js && echo "✓ server.js"
[ -f "$DOWNLOADS/index.html" ] && cp "$DOWNLOADS/index.html" ./public/index.html && echo "✓ index.html"
[ -f "$DOWNLOADS/Dockerfile" ] && cp "$DOWNLOADS/Dockerfile" ./Dockerfile && echo "✓ Dockerfile"
[ -f "$DOWNLOADS/package.json" ] && cp "$DOWNLOADS/package.json" ./package.json && echo "✓ package.json"
[ -f "$DOWNLOADS/SESSION_CONTEXT.md" ] && cp "$DOWNLOADS/SESSION_CONTEXT.md" ./SESSION_CONTEXT.md && echo "✓ SESSION_CONTEXT.md"
[ -f "$DOWNLOADS/BRD.md" ] && cp "$DOWNLOADS/BRD.md" ./BRD.md && echo "✓ BRD.md"
[ -f "$DOWNLOADS/ARCHITECTURE.md" ] && cp "$DOWNLOADS/ARCHITECTURE.md" ./ARCHITECTURE.md && echo "✓ ARCHITECTURE.md"
[ -f "$DOWNLOADS/PRD.md" ] && cp "$DOWNLOADS/PRD.md" ./PRD.md && echo "✓ PRD.md"

echo ""
git add -A
git commit -m "$MSG"
git push

echo ""
echo "🚀 Deployed: $MSG"
echo "⏳ Railway will auto-deploy in ~2 min"
echo "🔍 Verify: curl https://reelmaker-production.up.railway.app/health"

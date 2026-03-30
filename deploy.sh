#!/bin/bash
# ============================================================
# ReelMaker — Deploy Script (v2)
# Usage: bash deploy.sh "commit message"
# Copies files → git push → waits for Railway → runs checks
# Compatible with macOS bash 3.2 (no declare -A)
# ============================================================

set -e

PROJECT_DIR="/Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app"
DOWNLOADS="$HOME/Downloads"
LIVE_URL="https://reelmaker-production.up.railway.app"
MSG="${1:-deploy update}"
COPIED=0

cd "$PROJECT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎬 ReelMaker Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── Step 1: Copy files from Downloads ──────────────────────
echo "📦 Checking Downloads for updated files..."

copy_if_exists() {
  local src="$1"
  local dest="$2"
  local label="$3"
  if [ -f "$src" ]; then
    cp "$src" "$dest"
    echo "  ✓ $label"
    COPIED=$((COPIED + 1))
  fi
}

copy_if_exists "$DOWNLOADS/server.js"         "./server.js"              "server.js"
copy_if_exists "$DOWNLOADS/index.html"        "./public/index.html"      "index.html"
copy_if_exists "$DOWNLOADS/Dockerfile"        "./Dockerfile"             "Dockerfile"
copy_if_exists "$DOWNLOADS/package.json"      "./package.json"           "package.json"
copy_if_exists "$DOWNLOADS/deploy.sh"         "./deploy.sh"              "deploy.sh"
copy_if_exists "$DOWNLOADS/SESSION_CONTEXT.md" "./SESSION_CONTEXT.md"    "SESSION_CONTEXT.md"

if [ "$COPIED" -eq 0 ]; then
  echo "  (no new files found in ~/Downloads)"
fi

# ─── Step 2: Git commit & push ──────────────────────────────
echo ""
echo "🚀 Deploying: $MSG"
git add -A

# Check if there are changes to commit
if git diff --cached --quiet; then
  echo "  ⚠️  No changes to commit. Aborting."
  exit 0
fi

git commit -m "$MSG"
git push

# ─── Step 3: Move deployed files to timestamped folder ──────
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEPLOYED_DIR="$DOWNLOADS/_deployed_${TIMESTAMP}"
mkdir -p "$DEPLOYED_DIR"

for f in server.js index.html Dockerfile package.json deploy.sh SESSION_CONTEXT.md; do
  if [ -f "$DOWNLOADS/$f" ]; then
    mv "$DOWNLOADS/$f" "$DEPLOYED_DIR/"
  fi
done

if [ "$(ls -A "$DEPLOYED_DIR" 2>/dev/null)" ]; then
  echo "  📁 Deployed files moved to: _deployed_${TIMESTAMP}/"
fi

# ─── Step 4: Wait for Railway deploy ────────────────────────
echo ""
echo "⏳ Waiting 90s for Railway to deploy..."
for i in $(seq 90 -10 10); do
  echo "  ${i}s remaining..."
  sleep 10
done
echo "  Checking now..."

# ─── Step 5: Health check ───────────────────────────────────
echo ""
echo "🔍 Running health check..."
HEALTH=$(curl -s --max-time 10 "$LIVE_URL/health" 2>/dev/null || echo "FAIL")

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "  ✅ Health: OK"

  # Parse key fields
  FFMPEG=$(echo "$HEALTH" | grep -o '"ffmpeg":true' | head -1)
  LIBX264=$(echo "$HEALTH" | grep -o '"libx264":true' | head -1)
  CAPTION_API=$(echo "$HEALTH" | grep -o '"captionApi":true' | head -1)
  VERSION=$(echo "$HEALTH" | grep -o '"version":"[^"]*"' | head -1)

  [ -n "$FFMPEG" ]      && echo "  ✅ FFmpeg: available"      || echo "  ❌ FFmpeg: missing"
  [ -n "$LIBX264" ]     && echo "  ✅ libx264: available"     || echo "  ❌ libx264: missing"
  [ -n "$CAPTION_API" ] && echo "  ✅ Captions: Gemini AI"    || echo "  ⚠️  Captions: demo mode (no GEMINI_API_KEY)"
  [ -n "$VERSION" ]     && echo "  📌 $VERSION"
else
  echo "  ❌ Health check failed"
  echo "  Response: $HEALTH"
fi

# ─── Step 6: Caption API check ──────────────────────────────
echo ""
echo "🔍 Testing caption API..."
CAPTION_BODY='{"items":[{"filename":"test_photo.jpg","mimeType":"image/jpeg"}],"platform":"reel"}'
CAPTION_RESULT=$(curl -s --max-time 15 -X POST "$LIVE_URL/api/captions" \
  -H "Content-Type: application/json" \
  -d "$CAPTION_BODY" 2>/dev/null || echo "FAIL")

if echo "$CAPTION_RESULT" | grep -q '"engaging"'; then
  SOURCE=$(echo "$CAPTION_RESULT" | grep -o '"source":"[^"]*"' | head -1)
  echo "  ✅ Captions working ($SOURCE)"
else
  echo "  ❌ Caption API failed"
  echo "  Response: $(echo "$CAPTION_RESULT" | head -c 200)"
fi

# ─── Done ───────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deploy complete: $MSG"
echo "🌐 $LIVE_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

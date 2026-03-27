#!/bin/bash
# ============================================================
# ReelMaker — Deploy Script v2
# Usage: bash deploy.sh "commit message"
#    or: bash deploy.sh  (uses default message)
# ============================================================

set -e

# ─── Config ──────────────────────────────────────────────────
PROJECT_DIR="/Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app"
DOWNLOADS="$HOME/Downloads"
LIVE_URL="https://reelmaker-production.up.railway.app"
MSG="${1:-deploy update}"

# ─── Colors ──────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}🎬 ReelMaker Deploy${NC}"
echo "───────────────────────────────────────"

# ─── Step 1: Copy files from Downloads ───────────────────────
cd "$PROJECT_DIR"
COPIED=0

copy_if_exists() {
  local src="$1"
  local dest="$2"
  if [ -f "$DOWNLOADS/$src" ]; then
    mkdir -p "$(dirname "$dest")"
    cp "$DOWNLOADS/$src" "$dest"
    echo -e "  ${GREEN}✓${NC} $src → $dest"
    COPIED=$((COPIED + 1))
  fi
}

copy_if_exists "server.js"                    "./server.js"
copy_if_exists "index.html"                   "./public/index.html"
copy_if_exists "Dockerfile"                   "./Dockerfile"
copy_if_exists "package.json"                 "./package.json"
copy_if_exists "deploy.sh"                    "./deploy.sh"
copy_if_exists ".dockerignore"                "./.dockerignore"
copy_if_exists ".gitignore"                   "./.gitignore"
copy_if_exists "SESSION_CONTEXT.md"           "./SESSION_CONTEXT.md"
copy_if_exists "REELMAKER_SESSION_CONTEXT.md" "./REELMAKER_SESSION_CONTEXT.md"
copy_if_exists "BRD.md"                       "./BRD.md"
copy_if_exists "ARCHITECTURE.md"              "./ARCHITECTURE.md"
copy_if_exists "PRD.md"                       "./PRD.md"

if [ "$COPIED" -eq 0 ]; then
  echo -e "  ${YELLOW}⚠ No new files found in ~/Downloads${NC}"
  echo ""
  if git diff --quiet && git diff --cached --quiet; then
    echo -e "${YELLOW}Nothing to deploy — no new files and no local changes.${NC}"
    exit 0
  else
    echo -e "  ${CYAN}ℹ Deploying existing local changes${NC}"
  fi
else
  echo -e "\n  ${GREEN}Copied $COPIED file(s)${NC}"
fi

# ─── Step 2: Show diff summary ──────────────────────────────
echo ""
echo "───────────────────────────────────────"
echo -e "${CYAN}Changes:${NC}"
git add -A
git diff --cached --stat 2>/dev/null || true

# ─── Step 3: Commit and push ────────────────────────────────
echo ""
git commit -m "$MSG"
git push

echo ""
echo -e "${GREEN}🚀 Deployed:${NC} $MSG"
echo -e "${YELLOW}⏳ Railway auto-deploys in ~2 min${NC}"

# ─── Step 4: Clean up Downloads ─────────────────────────────
CLEANUP_DIR="$DOWNLOADS/_deployed_$(date +%Y%m%d_%H%M%S)"
CLEANED=0

cleanup_if_exists() {
  local src="$1"
  if [ -f "$DOWNLOADS/$src" ]; then
    if [ "$CLEANED" -eq 0 ]; then
      mkdir -p "$CLEANUP_DIR"
    fi
    mv "$DOWNLOADS/$src" "$CLEANUP_DIR/$src"
    CLEANED=$((CLEANED + 1))
  fi
}

cleanup_if_exists "server.js"
cleanup_if_exists "index.html"
cleanup_if_exists "Dockerfile"
cleanup_if_exists "package.json"
cleanup_if_exists "deploy.sh"
cleanup_if_exists ".dockerignore"
cleanup_if_exists ".gitignore"
cleanup_if_exists "SESSION_CONTEXT.md"
cleanup_if_exists "REELMAKER_SESSION_CONTEXT.md"
cleanup_if_exists "BRD.md"
cleanup_if_exists "ARCHITECTURE.md"
cleanup_if_exists "PRD.md"

if [ "$CLEANED" -gt 0 ]; then
  echo -e "${CYAN}🧹 Moved $CLEANED file(s) to ${CLEANUP_DIR##*/}${NC}"
fi

# ─── Step 5: Wait and verify ────────────────────────────────
echo ""
echo "───────────────────────────────────────"
echo -e "${CYAN}Waiting 90s for Railway to build...${NC}"

for i in 90 80 70 60 50 40 30 20 10; do
  echo -ne "  ${i}s remaining...\r"
  sleep 10
done
echo ""

echo -e "${CYAN}🔍 Running health check...${NC}"
HEALTH=$(curl -s --max-time 10 "$LIVE_URL/health" 2>/dev/null || echo "FAILED")

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "  ${GREEN}✓ Server is healthy${NC}"

  echo "$HEALTH" | grep -q '"ffmpeg":true' && echo -e "  ${GREEN}✓${NC} FFmpeg: ready"
  echo "$HEALTH" | grep -q '"captionApi":"gemini"' && echo -e "  ${GREEN}✓${NC} Captions: Gemini AI"
  echo "$HEALTH" | grep -q '"captionApi":"demo"' && echo -e "  ${YELLOW}⚠${NC} Captions: demo mode (set GEMINI_API_KEY)"
  echo "$HEALTH" | grep -q '"oauth":true' && echo -e "  ${GREEN}✓${NC} OAuth: configured"
  echo "$HEALTH" | grep -q '"oauth":false' && echo -e "  ${YELLOW}⚠${NC} OAuth: demo mode"

  echo ""
  echo -e "${CYAN}🧪 Testing captions API...${NC}"
  CAP_TEST=$(curl -s --max-time 15 "$LIVE_URL/api/captions/test" 2>/dev/null || echo "FAILED")

  if echo "$CAP_TEST" | grep -q '"status":"ok"'; then
    echo -e "  ${GREEN}✓ Gemini captions working!${NC}"
  elif echo "$CAP_TEST" | grep -q '"status":"demo"'; then
    echo -e "  ${YELLOW}⚠ Captions in demo mode — set GEMINI_API_KEY in Railway${NC}"
  else
    echo -e "  ${RED}✗ Caption test: ${CAP_TEST}${NC}"
  fi
else
  echo -e "  ${RED}✗ Health check failed — may still be deploying${NC}"
  echo -e "  ${YELLOW}Try manually: curl $LIVE_URL/health${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC} 🎬"
echo "───────────────────────────────────────"

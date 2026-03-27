# ReelMaker — Project Context (Session Handoff)
## Last Updated: March 27, 2026 — Session 5

---

## PROJECT OVERVIEW

**ReelMaker** is a web app that connects to Google Photos and creates Instagram Reels (9:16, up to 90s) and YouTube Shorts (9:16, up to 60s) from selected photos/videos, with AI-generated post captions.

- **Live URL**: https://reelmaker-production.up.railway.app/
- **GitHub repo**: https://github.com/nrirealtyca-cmd/reelmaker
- **Local path**: /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
- **Hosting**: Railway (Dockerfile-based deploy, auto-deploys from GitHub `main` branch)
- **Stack**: React 18 (CDN, no build step) + Express.js (Node 20+) + FFmpeg + Claude API (Sonnet)

### Design System
| Token       | Value     | Usage               |
|-------------|-----------|---------------------|
| Deep Black  | `#0D0D0D` | Backgrounds         |
| Warm Cream  | `#F5F0EB` | Text, surfaces      |
| Sunset Coral| `#FF6B35` | CTAs, accents       |
| Fonts       | Sora (headings) + DM Sans (body) via Google Fonts CDN |

---

## ACCEPTANCE CRITERIA STATUS

| AC   | Description                              | Status |
|------|------------------------------------------|--------|
| AC-01| Connect Google Photos, thumbnails <5s     | ✅ Done (Session 1) |
| AC-02| Select max 10 items                       | ✅ Done (Session 1) |
| AC-03| FFmpeg video stitching (Reel + Short)     | ✅ Done (Session 2), Fixed Sessions 3 & 4 |
| AC-04| Validation — H.264, 1080×1920, 30fps     | ✅ Done (Session 2), Fixed Sessions 3 & 4 |
| AC-05| AI Post Captions                          | ✅ Done (Session 5) — debugging API connectivity |
| UC-05| Download & Share                          | ⚠️ Download works, Web Share API added, deep links not built |

---

## SESSION HISTORY

### Session 1 — Foundation
- Built React 18 frontend (CDN, no build step) with Babel in-browser transform
- Express.js backend with Google OAuth 2.0 and Photos Library API
- Photo browser with thumbnail grid, selection (max 10), pagination
- State machine: landing → connecting → browser → processing → preview
- Design system applied: Deep Black, Warm Cream, Sunset Coral

### Session 2 — Video Pipeline
- FFmpeg video stitching with xfade transitions
- Dual output: Instagram Reel (90s max) and YouTube Short (60s max)
- ffprobe validation: H.264, 1080×1920, 30fps, yuv420p
- Job tracking with polling status updates
- Download buttons on preview screen

### Session 3 — Railway Deploy Fixes
**5 bugs fixed:**
1. `exec()` shell escaping → `spawn()` with args array
2. Missing `maxBuffer` → streams via `spawn()`, 10MB for remaining `execSync`
3. Real photos never downloaded → `downloadRealMedia()` function
4. No access token passed to `/api/generate` → reads `x-session-id` header
5. Static file serving for `.mp4` → dedicated `/output` route with proper headers
**Bonus:** Replaced `nixpacks.toml` with `Dockerfile`

### Session 4 — FFmpeg OOM Fix
**Fixes:**
1. `JobQueue` class — max 1 concurrent FFmpeg encode
2. `settb=1/30` — normalized timebase before xfade
3. `ultrafast` preset + `-threads 1` + `ref=1:bframes=0` — minimized memory
4. Short stream-copied from Reel instead of re-encoding
5. Hardened `runFFmpegSpawn` — OOM, 0-byte, timeout detection

### Session 5 — AI Post Captions (Current)
**What was built:**
1. **`/api/captions` endpoint** — Calls Claude API (Sonnet) with photo metadata to generate 2 caption styles (Engaging + Professional). Falls back to template-based demo captions without `ANTHROPIC_API_KEY`.
2. **`/api/captions/test` diagnostic endpoint** — Tests Claude API connectivity and returns error details.
3. **`CaptionsScreen` component** — New screen between processing and preview. Two style tabs, editable textarea, copy button, character count, skip/use buttons.
4. **Caption on PreviewScreen** — Selected caption displayed with copy-to-clipboard.
5. **Parallel generation** — Captions fetched while video encodes (non-blocking).
6. **Updated state machine** — `processing → captions → preview`
7. **`fetchJSON` fix** — Added `Content-Length` header for POST bodies (required by Anthropic API).
8. **`deploy.sh` script** — Automates file copy + git commit + push workflow.

**Current status:** Debugging Claude API connectivity from Railway — API key is set (`captionApi: true` in health check), but calls may be failing. Diagnostic endpoint added at `/api/captions/test` to identify the error.

---

## CURRENT FILE STRUCTURE

```
reelmaker-app/
├── server.js              ← Express backend (934 lines) — Auth, Photos API, FFmpeg, AI Captions
├── Dockerfile             ← node:20-slim + FFmpeg + fonts-dejavu-core
├── .dockerignore
├── .gitignore
├── package.json           ← express, cors, dotenv
├── package-lock.json
├── deploy.sh              ← Deployment script (copies files from ~/Downloads + git push)
├── BRD.md                 ← Business Requirements Document v2.1
├── PRD.md                 ← Product Requirements Document v2.1
├── ARCHITECTURE.md        ← Architecture Document v2.1
├── SESSION_CONTEXT.md     ← This file — session handoff context
├── public/
│   ├── index.html         ← Full React 18 app via CDN + Babel (642 lines)
│   └── output/            ← Generated .mp4 files (auto-cleaned after 1 hour)
│       └── .gitkeep
└── tmp/                   ← Temp working directory (auto-cleaned per job)
```

---

## CURRENT API ENDPOINTS

| Method | Path                        | Auth     | Description                              |
|--------|-----------------------------|----------|------------------------------------------|
| GET    | `/health`                   | None     | FFmpeg, libx264, disk, queue, captionApi |
| GET    | `/auth/google/url`          | None     | Start OAuth flow → returns authUrl        |
| GET    | `/auth/google/callback`     | None     | OAuth callback → redirects with session   |
| GET    | `/api/profile`              | Session  | User name/email/picture                   |
| GET    | `/api/photos`               | Session  | Paginated media library (50/page)         |
| POST   | `/api/disconnect`           | Session  | Revoke token, clear session               |
| POST   | `/api/captions`             | None     | AI caption generation (2 styles)          |
| GET    | `/api/captions/test`        | None     | Diagnostic — test Claude API connectivity |
| POST   | `/api/generate`             | Session* | Start video generation job → returns jobId|
| GET    | `/api/generate/:jobId`      | None     | Poll job status/progress/urls             |
| GET    | `/output/:filename`         | None     | Serve .mp4 with proper Content-Type       |

*Session optional — works in demo mode without token.

---

## VIDEO GENERATION PIPELINE (server.js v2.3)

```
POST /api/generate { items, photoDuration }
  │
  ├─ Demo mode (isMock items OR no token):
  │   └─ generateDemoImages() → solid-color 1080×1920 JPGs via FFmpeg lavfi
  │
  ├─ Real mode (authenticated):
  │   └─ downloadRealMedia() → re-fetches baseUrls, downloads via Google Photos
  │       ├─ Photos: baseUrl=w1080-h1920 → .jpg
  │       └─ Videos: baseUrl=dv → .mp4 → trim to 3s at 1080×1920
  │
  ├─ buildStitchArgs() → FFmpeg filter_complex
  │   ├─ Each input: scale → pad → setsar → fps=30 → format=yuv420p → settb=1/30
  │   └─ Chain xfade=fade between consecutive items
  │
  ├─ ffmpegQueue.add() → max 1 concurrent job
  │   └─ runFFmpegSpawn('ffmpeg', args) — NO SHELL
  │       ├─ Reel: libx264 ultrafast, -threads 1, ref=1, bframes=0
  │       │        -t 90, -movflags +faststart → /public/output/reel_{jobId}.mp4
  │       └─ Short: stream copy from Reel, -t 60 → /public/output/short_{jobId}.mp4
  │
  └─ validateVideo() → ffprobe JSON → { codec, width, height, fps, duration, valid }
```

## AI CAPTION PIPELINE (server.js v2.3)

```
POST /api/captions { items }
  │
  ├─ No ANTHROPIC_API_KEY:
  │   └─ generateDemoCaptions() → template-based captions with photo filenames
  │
  └─ With ANTHROPIC_API_KEY:
      └─ Build prompt from photo metadata (filenames, dates, dimensions, camera)
      └─ POST api.anthropic.com/v1/messages (claude-sonnet-4-20250514, max_tokens 1024)
      └─ Parse JSON response → { engaging, professional }
      └─ On error: fallback to generateDemoCaptions() + error field in response
```

---

## FRONTEND STATE MACHINE (public/index.html)

```
landing → (Connect Google Photos) → connecting → browser
                                                    │
browser → (select 2-10 items) → (Generate Videos) → processing
                                                        │
                                          [captions fetched in parallel]
                                                        │
processing → (video done) → captions → (Use Caption / Skip) → preview
                                                                   │
preview → (Download Reel / Download Short / Copy Caption)
        → (Share via Web Share API)
        → (Start Over → browser)
```

### Screens
| Screen      | Component            | Key Features                        |
|-------------|----------------------|-------------------------------------|
| landing     | `LandingScreen`      | Hero CTA, floating emoji animation  |
| connecting  | `ConnectingScreen`   | Spinner, redirect to Google OAuth   |
| browser     | `BrowserScreen`      | Photo grid, selection badges, demo mode banner |
| processing  | `ProcessingScreen`   | Progress bar, status text, error + retry |
| captions    | `CaptionsScreen`     | 🔥 Engaging / 💼 Professional tabs, editable textarea, copy, skip/use |
| preview     | `PreviewScreen`      | Caption card + video players, download, Web Share API |

---

## RAILWAY ENVIRONMENT VARIABLES

| Variable              | Required | Description                        |
|-----------------------|----------|------------------------------------|
| `GOOGLE_CLIENT_ID`    | For real photos | Google OAuth 2.0 client ID  |
| `GOOGLE_CLIENT_SECRET`| For real photos | Google OAuth 2.0 secret     |
| `ANTHROPIC_API_KEY`   | For AI captions | Claude API key (sk-ant-...) — get from console.anthropic.com |
| `RAILWAY_PUBLIC_DOMAIN`| Auto-set by Railway | Used to build BASE_URL |

---

## DEPLOY INSTRUCTIONS

### Using deploy.sh (recommended)

```bash
# First time: copy deploy.sh to project and make executable
cp ~/Downloads/deploy.sh /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app/deploy.sh
chmod +x /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app/deploy.sh

# Deploy (picks up files from ~/Downloads automatically)
cd /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
bash deploy.sh "commit message here"
```

The script automatically copies any of these files from `~/Downloads/` if they exist:
`server.js`, `index.html`, `Dockerfile`, `package.json`, `SESSION_CONTEXT.md`, `BRD.md`, `ARCHITECTURE.md`, `PRD.md`

### Manual deploy

```bash
cd /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
cp ~/Downloads/server.js ./server.js
# ... copy other changed files ...
git add -A
git commit -m "description"
git push
```

### Full clean deploy (nuclear option)

```bash
cd /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
ls -A | grep -v '^\\.git$' | xargs rm -rf
# ... copy all files from tar/downloads ...
npm install  # if package-lock.json was deleted
git add -A
git commit -m "description"
git push --force
```

**Note:** If `.git` gets deleted, reinitialize:
```bash
git init
git remote add origin https://github.com/nrirealtyca-cmd/reelmaker.git
git add -A
git commit -m "description"
git branch -M main
git push --force origin main
git push --set-upstream origin main
```

### Post-deploy verification

```bash
curl https://reelmaker-production.up.railway.app/health
# Expect: ffmpeg: true, libx264: true, captionApi: true, queuedJobs: 0
```

---

## WHAT'S NEXT (Priority Order)

### 1. Debug Caption API Connectivity
- `ANTHROPIC_API_KEY` is set (`captionApi: true` in health)
- API calls falling back to demo captions — diagnostic endpoint added
- Test with: `curl https://reelmaker-production.up.railway.app/api/captions/test`

### 2. UC-05: Share Enhancement
- Download works, Web Share API works on supported devices
- TODO: Deep link share buttons for Instagram and YouTube

### 3. Production Hardening
- Session store is in-memory `Map()` — resets on every Railway deploy. Consider Redis
- Output files on Railway's ephemeral filesystem — lost on redeploy. Consider cloud storage (GCS/S3)
- No rate limiting on `/api/generate` or `/api/captions`

### 4. UX Improvements
- Photo duration slider (currently hardcoded at 3s per photo)
- Transition style picker (currently only fade; FFmpeg xfade supports ~40 transitions)
- Background music upload or selection
- Caption regeneration button
- Mobile responsiveness improvements

---

## KNOWN ISSUES / WATCH ITEMS

1. **Railway ephemeral disk**: Generated .mp4 files survive during container lifetime (auto-cleaned after 1hr) but lost on redeploy
2. **In-memory session store**: All sessions lost on redeploy — users must re-authenticate
3. **Caption API debugging**: API key configured but calls may fail — `/api/captions/test` endpoint will reveal the error
4. **Single-item generation**: Duplicates the item so xfade has a pair — works but untested in production
5. **Video input handling**: Video clips trimmed to 3s to match photo duration — no user control
6. **Short is stream-copied from Reel**: If Reel is <60s, Short is identical to Reel
7. **Railway memory**: Container must have enough RAM for 1080×1920 x264 ultrafast single-thread encode

---

## COMPLETE CODEBASE REFERENCE

### server.js (v2.3 — 934 lines)
**Role**: Express backend — OAuth, Google Photos API, FFmpeg pipeline, job queue, AI captions

**Key modules:**
- `JobQueue` class — concurrency-limited async job queue (max 1 FFmpeg process)
- `GET /api/captions/test` — diagnostic endpoint for Claude API connectivity
- `POST /api/captions` — Claude API integration for AI post caption generation (2 styles)
- `generateDemoCaptions()` — template fallback when no API key or on error
- `runGenerationPipeline()` — orchestrates download → encode → validate → serve
- `downloadRealMedia()` — fetches fresh baseUrls via batchGet, downloads photos/videos
- `generateDemoImages()` — creates colored rectangle JPGs for demo mode
- `buildStitchArgs()` — constructs FFmpeg filter_complex with normalize + xfade chain
- `runFFmpegSpawn()` — spawns FFmpeg with timeout, OOM detection, 0-byte detection
- `validateVideo()` — ffprobe validation of output specs
- `fetchJSON()` — HTTPS client with Content-Length for POST bodies

**Encoding config:**
```
libx264 | ultrafast | -tune stillimage | -crf 28 | yuv420p | 30fps
-threads 1 | ref=1 | bframes=0 | rc-lookahead=10
```

### public/index.html (v2.3 — 642 lines)
**Role**: Full React 18 SPA via CDN (no build step)

**Components:**
- `App` — root state machine, session management, job polling, caption fetching
- `LandingScreen` — hero page with connect CTA
- `ConnectingScreen` — loading spinner during OAuth redirect
- `BrowserScreen` — photo grid with selection (max 10), demo mode support
- `ProcessingScreen` — progress bar, status text, error display, retry button
- `CaptionsScreen` — AI caption editor (2 styles: engaging/professional), copy, skip/use
- `PreviewScreen` — caption card + dual video players, download buttons, Web Share API

### deploy.sh
**Role**: Deployment automation — copies files from `~/Downloads/` into project, commits, pushes
**Usage**: `bash deploy.sh "commit message"`

### Dockerfile
```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
RUN ffmpeg -version && ffmpeg -codecs 2>/dev/null | grep libx264
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p public/output tmp
EXPOSE 3000
CMD ["node", "server.js"]
```

### package.json
```json
{
  "name": "reelmaker-app",
  "version": "2.2.0",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "cors": "^2.8.5", "dotenv": "^16.4.5", "express": "^4.21.0" },
  "engines": { "node": ">=20.0.0" }
}
```

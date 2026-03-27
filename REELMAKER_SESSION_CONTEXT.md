# ReelMaker — Project Context (Session Handoff)
## Last Updated: March 26, 2026 — Session 3

---

## PROJECT OVERVIEW

**ReelMaker** is a web app that connects to Google Photos and creates Instagram Reels (9:16, up to 90s) and YouTube Shorts (9:16, up to 60s) from selected photos/videos, with AI captions.

- **Live URL**: https://reelmaker-production.up.railway.app/
- **GitHub repo**: /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
- **Hosting**: Railway (Dockerfile-based deploy)
- **Stack**: React 18 (CDN, no build step) + Express.js (Node 20+) + FFmpeg

### Design System
| Token       | Value     | Usage               |
|-------------|-----------|---------------------|
| Deep Black  | `#0D0D0D` | Backgrounds         |
| Warm Cream  | `#F5F0EB` | Text, surfaces      |
| Sunset Coral| `#FF6B35` | CTAs, accents       |
| Fonts       | Sora (headings) + DM Sans (body) |

---

## ACCEPTANCE CRITERIA STATUS

| AC   | Description                              | Status |
|------|------------------------------------------|--------|
| AC-01| Connect Google Photos, thumbnails <5s     | ✅ Done (Session 1) |
| AC-02| Select max 10 items                       | ✅ Done (Session 1) |
| AC-03| FFmpeg video stitching (Reel + Short)     | ✅ Done (Session 2), **Fixed Session 3** |
| AC-04| Validation — H.264, 1080×1920, 30fps     | ✅ Done (Session 2), **Fixed Session 3** |
| AC-05| AI Captioning                             | ❌ Not started |
| UC-05| Download & Share                          | ⚠️ Download works, share buttons not built |

---

## SESSION 3 SUMMARY (March 26, 2026)

### Problem
AC-03/AC-04 were built in Session 2 but video generation was failing on the Railway deployment. The app would start processing but never produce output files.

### Root Causes Found (5 issues)

1. **`exec()` shell escaping** — FFmpeg commands were passed through `exec()` which runs via `/bin/sh`. The `filter_complex` string contains `[]`, `;`, and `:` characters that get misinterpreted by the shell. **Fix**: Switched to `spawn()` with args array (no shell involved).

2. **Missing `maxBuffer`** — FFmpeg writes verbose progress to stderr. Node's default `exec` maxBuffer is 1MB, easily exceeded during encoding, causing silent `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` crashes. **Fix**: `spawn()` uses streams (no buffer limit); remaining `execSync` calls got `maxBuffer: 10MB`.

3. **Real photos never downloaded** — The old code always called `generateDemoImages()` (colored rectangles) regardless of whether the user was authenticated with real Google Photos. **Fix**: Added `downloadRealMedia()` function that detects `isMock` flag vs real items and downloads actual media via `baseUrl=w1080-h1920` (photos) and `baseUrl=dv` (videos).

4. **No access token passed to `/api/generate`** — The generate endpoint never extracted the session token, so even if download code existed it couldn't authenticate with Google Photos API. **Fix**: `/api/generate` now reads `x-session-id` header, refreshes token if expired, and passes it into the pipeline.

5. **Static file serving for `.mp4`** — `express.static` served output files but without explicit `Content-Type: video/mp4` and `Accept-Ranges: bytes` headers, causing browser video players to fail or hang. **Fix**: Dedicated `/output` route with proper headers.

### Bonus: Dockerfile replaces nixpacks.toml
`nixpacks.toml` with `aptPkgs = ["ffmpeg"]` was unreliable for FFmpeg on Railway. Replaced with a `Dockerfile` using `node:20-slim` + `apt-get install ffmpeg` with a build-time verification step (`ffmpeg -version` and `grep libx264`).

### Files Changed
- **`server.js`** — Major rewrite of video generation pipeline (v2.0 → v2.1, 557 lines)
- **`public/index.html`** — Updated processing screen: better error display, retry button, video preload/type attributes (296 lines)
- **`Dockerfile`** — NEW: replaces nixpacks.toml for reliable FFmpeg on Railway (27 lines)
- **`.dockerignore`** — NEW: keeps Docker image small
- **`nixpacks.toml`** — DELETED

---

## CURRENT FILE STRUCTURE

```
reelmaker-app/
├── server.js              ← Express backend (557 lines) — Auth, Photos API, FFmpeg pipeline
├── Dockerfile             ← node:20-slim + FFmpeg install
├── .dockerignore
├── package.json           ← express, cors, dotenv only
├── public/
│   ├── index.html         ← Full React 18 app via CDN + Babel (296 lines)
│   └── output/            ← Generated .mp4 files (auto-cleaned after 1 hour)
└── tmp/                   ← Temp working directory (auto-cleaned per job)
```

## CURRENT API ENDPOINTS

| Method | Path                        | Auth     | Description                              |
|--------|-----------------------------|----------|------------------------------------------|
| GET    | `/health`                   | None     | FFmpeg status, libx264, disk writability  |
| GET    | `/auth/google/url`          | None     | Start OAuth flow → returns authUrl        |
| GET    | `/auth/google/callback`     | None     | OAuth callback → redirects with session   |
| GET    | `/api/profile`              | Session  | User name/email/picture                   |
| GET    | `/api/photos`               | Session  | Paginated media library (50/page)         |
| POST   | `/api/disconnect`           | Session  | Revoke token, clear session               |
| POST   | `/api/generate`             | Session* | Start video generation job → returns jobId|
| GET    | `/api/generate/:jobId`      | None     | Poll job status/progress/urls             |

*Session optional — works in demo mode without token (generates colored placeholders).

## VIDEO GENERATION PIPELINE (server.js)

```
POST /api/generate { items, photoDuration }
  │
  ├─ Demo mode (isMock items OR no token):
  │   └─ generateDemoImages() → solid-color 1080×1920 PNGs via FFmpeg lavfi
  │
  ├─ Real mode (authenticated):
  │   └─ downloadRealMedia() → downloads via Google Photos baseUrl
  │       ├─ Photos: baseUrl=w1080-h1920 → .jpg
  │       └─ Videos: baseUrl=dv → .mp4 → trim to 3s clip at 1080×1920
  │
  ├─ buildStitchArgs() → FFmpeg filter_complex with xfade transitions
  │   ├─ Scale each input to 1080×1920, fps=30, yuv420p
  │   └─ Chain xfade=fade between consecutive items
  │
  ├─ runFFmpegArgs() → spawn('ffmpeg', args) — NO SHELL
  │   ├─ Reel: libx264, -t 90, -movflags +faststart → /public/output/reel_{jobId}.mp4
  │   └─ Short: libx264, -t 60, -movflags +faststart → /public/output/short_{jobId}.mp4
  │
  └─ validateVideo() → ffprobe JSON → { codec, width, height, fps, duration, valid }
```

## FRONTEND STATE MACHINE (public/index.html)

```
landing → (Connect Google Photos) → connecting → browser
                                                    │
browser → (select 2-10 items) → (Generate Videos) → processing
                                                        │
processing → (poll /api/generate/:jobId every 1s) → preview
                                                        │
preview → (Download Reel / Download Short)
        → (Start Over → browser)
        → (Back to Library → browser)
```

## RAILWAY ENVIRONMENT VARIABLES

| Variable              | Required | Description                        |
|-----------------------|----------|------------------------------------|
| `GOOGLE_CLIENT_ID`    | For real photos | Google OAuth 2.0 client ID  |
| `GOOGLE_CLIENT_SECRET`| For real photos | Google OAuth 2.0 secret     |
| `RAILWAY_PUBLIC_DOMAIN`| Auto-set by Railway | Used to build BASE_URL |

No `NIXPACKS_PKGS` needed — the Dockerfile handles FFmpeg installation.

## DEPLOY INSTRUCTIONS

```bash
cd /Users/chandniroy/Documents/ReelMaker/files_ReelMaker_10_45/reelmaker-app
# (replace files as needed)
git add -A
git commit -m "description"
git push
```

Railway auto-deploys from GitHub. After deploy, verify:
```bash
curl https://reelmaker-production.up.railway.app/health
# Should show: ffmpeg: true, libx264: true, tmpWritable: true, outWritable: true
```

---

## WHAT'S NEXT (Priority Order)

### 1. UC-05: Download & Share (Partially done)
- Download buttons work on the preview screen
- **TODO**: Add share-to-Instagram and share-to-YouTube buttons (deep links or Web Share API)

### 2. AC-05 / UC-04: AI Captioning
- Not started. The BRD specifies AI-generated captions overlaid on videos
- Options: OpenAI Whisper for speech-to-text, or GPT for generating captions from photo metadata
- FFmpeg `drawtext` filter for burning captions into video
- Font rendering on Railway requires installing fonts in the Dockerfile (e.g., `fonts-dejavu-core`)

### 3. Production Hardening
- Session store is in-memory `Map()` — resets on every Railway deploy. Consider Redis or Railway's built-in Redis add-on
- Output files are stored on disk — Railway's ephemeral filesystem means they're lost on redeploy. Consider cloud storage (GCS/S3) for generated videos
- No rate limiting on `/api/generate` — a user could spam expensive FFmpeg jobs
- Google Photos `baseUrl` values expire after ~60 minutes. If a user selects photos and waits too long before generating, downloads will fail. Could re-fetch baseUrls at generation time using the media item IDs

### 4. UX Improvements
- Photo duration slider (currently hardcoded at 3s per photo)
- Transition style picker (currently only fade; FFmpeg xfade supports ~40 transitions)
- Background music upload or selection
- Preview thumbnails in the processing screen
- Mobile responsiveness improvements (mostly done but video preview grid could be better)

---

## KNOWN ISSUES / WATCH ITEMS

1. **Railway ephemeral disk**: Generated .mp4 files are in `/app/public/output/` — they survive during the container's lifetime (auto-cleaned after 1 hour by the app) but are lost on redeploy
2. **In-memory session store**: All sessions lost on redeploy — users must re-authenticate
3. **Google Photos baseUrl expiration**: URLs expire after ~1 hour; currently no re-fetch mechanism
4. **Single-item generation**: The pipeline requires 2+ items (xfade needs pairs); single-item support is coded but untested
5. **Video input handling**: Video clips are trimmed to 3s to match photo duration — no user control over this yet

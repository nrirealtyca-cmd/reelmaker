# ReelMaker — Architecture Document
## Version 2.1 | March 26, 2026

---

## 1. System Overview

ReelMaker is a monolithic web application with a React frontend and Express.js backend, deployed as a Docker container on Railway. The system integrates with Google Photos via OAuth 2.0, uses FFmpeg for server-side video generation, and calls the Anthropic Claude API for AI-generated post captions.

```
┌─────────────────────────────────────────────────────────────────┐
│                        RAILWAY CONTAINER                         │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │   React 18 SPA   │    │       Express.js Server           │   │
│  │   (CDN, no build)│◄──►│                                    │   │
│  │                  │    │  ┌────────────┐  ┌─────────────┐  │   │
│  │  • Landing       │    │  │  OAuth 2.0 │  │  Photos API │  │   │
│  │  • Browser       │    │  │  Handler   │  │  Client     │  │   │
│  │  • Processing    │    │  └─────┬──────┘  └──────┬──────┘  │   │
│  │  • Captions      │    │        │                 │         │   │
│  │  • Preview       │    │  ┌─────▼─────────────────▼──────┐ │   │
│  └──────────────────┘    │  │     Generation Pipeline        │ │   │
│                          │  │  JobQueue ──► FFmpeg Spawn     │ │   │
│                          │  │  (max 1)     (no shell)        │ │   │
│                          │  │  Download ─► Stitch ─► Validate│ │   │
│                          │  └────────────────────────────────┘ │   │
│                          │                                      │   │
│                          │  ┌────────────────────────────────┐ │   │
│                          │  │     Caption Pipeline            │ │   │
│                          │  │  Photo metadata ──► Claude API  │ │   │
│                          │  │  → { engaging, professional }   │ │   │
│                          │  └────────────────────────────────┘ │   │
│                          └──────────────────────────────────────┘   │
│                                                                     │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐      │
│  │ /tmp/reel  │  │ /public/     │  │ FFmpeg + libx264       │      │
│  │ maker/     │  │ output/      │  │ (Dockerfile installed) │      │
│  │ (temp)     │  │ (served)     │  └────────────────────────┘      │
│  └────────────┘  └──────────────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
         │                     │                          │
         │ OAuth 2.0           │ HTTPS                    │ HTTPS
         ▼                     ▼                          ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Google OAuth    │  │ Google Photos    │  │ Anthropic API    │
│ accounts.google │  │ Library API      │  │ api.anthropic.com│
│ .com            │  │                  │  │ (Claude Sonnet)  │
└─────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Frontend | React | 18.2.0 (CDN) | No build step needed, Babel in-browser |
| Backend | Express.js | 4.21.x | Lightweight, familiar Node.js framework |
| Runtime | Node.js | 20+ (slim) | LTS, native fetch, modern APIs |
| Video | FFmpeg | 5.1.x | Industry-standard, xfade transitions, libx264 |
| AI | Claude API | Sonnet | Post caption generation from photo metadata |
| Container | Docker | node:20-slim | Consistent FFmpeg installation |
| Hosting | Railway | - | Docker deploy, auto-scaling, GitHub integration |
| Auth | Google OAuth 2.0 | - | Required for Google Photos API access |
| API | Google Photos Library API | v1 | Media browsing and download |

---

## 3. Component Architecture

### 3.1 Frontend (public/index.html)

Single HTML file containing a complete React 18 SPA, loaded via CDN with Babel in-browser JSX transform.

```
App (root)
├── State: screen, sessionId, profile, photos, selected, jobId, jobStatus,
│          captions, selectedCaption, error
├── Effects: session restore, profile fetch, photo load, job polling
│
├── LandingScreen
│   └── "Connect Google Photos" CTA
│
├── ConnectingScreen
│   └── Spinner during OAuth redirect
│
├── BrowserScreen
│   ├── Demo mode banner (when no OAuth)
│   ├── Selection toolbar (count, generate button)
│   ├── Photo grid (auto-fill, 150px min, 9:16 aspect)
│   └── Load More button (pagination)
│
├── ProcessingScreen
│   ├── Progress bar (0-100%)
│   ├── Status text (from job polling)
│   └── Error display + retry button
│
├── CaptionsScreen
│   ├── Style tabs (🔥 Engaging / 💼 Professional)
│   ├── Editable textarea with character count
│   ├── Copy button
│   └── Skip / Use This Caption buttons
│
└── PreviewScreen
    ├── Caption card (if selected) with copy button
    ├── Reel card (video player, duration, download, share)
    ├── Short card (video player, duration, download, share)
    └── Start Over button
```

### 3.2 Backend (server.js)

Express.js server handling auth, API proxying, video generation, and AI captions.

```
server.js
├── Config
│   ├── PORT, BASE_URL, REDIRECT_URI
│   ├── TMP_DIR, OUT_DIR
│   ├── Google OAuth credentials (env vars)
│   └── ANTHROPIC_API_KEY (env var)
│
├── Session Store
│   └── Map<sessionId, { accessToken, refreshToken, expiresAt }>
│
├── Job Queue
│   └── JobQueue class (concurrency: 1)
│
├── Job Tracker
│   └── Map<jobId, { status, progress, reelUrl, shortUrl, error, createdAt }>
│   └── Cleanup interval: every 10 min, removes jobs >1 hour old
│
├── Routes
│   ├── GET  /health — system status (incl captionApi flag)
│   ├── GET  /auth/google/url — initiate OAuth
│   ├── GET  /auth/google/callback — handle OAuth callback
│   ├── GET  /api/profile — user info
│   ├── GET  /api/photos — media library (paginated)
│   ├── POST /api/disconnect — revoke + clear session
│   ├── POST /api/captions — AI caption generation
│   ├── POST /api/generate — start video job (async)
│   ├── GET  /api/generate/:jobId — poll status
│   └── GET  /output/:filename — serve video files
│
├── Caption Functions
│   ├── POST /api/captions handler — Claude API call with metadata prompt
│   └── generateDemoCaptions() — template fallback
│
├── Pipeline Functions
│   ├── runGenerationPipeline() — orchestrator
│   ├── downloadRealMedia() — Google Photos download with baseUrl refresh
│   ├── generateDemoImages() — colored rectangles via FFmpeg lavfi
│   ├── buildStitchArgs() — filter_complex construction
│   ├── runFFmpegSpawn() — spawn with timeout/OOM/0-byte detection
│   └── validateVideo() — ffprobe validation
│
└── HTTP Helpers
    ├── fetchJSON() — generic HTTPS JSON client
    └── downloadFile() — file download with redirect following
```

---

## 4. Data Flow

### 4.1 Authentication Flow

```
Browser                    Server                    Google
  │                          │                          │
  ├─ GET /auth/google/url ──►│                          │
  │◄─ { authUrl } ──────────┤                          │
  │                          │                          │
  ├─ Redirect to authUrl ───────────────────────────────►│
  │◄─ Redirect with ?code= ─────────────────────────────┤
  │                          │                          │
  ├─ GET /auth/google/callback?code= ─►│                │
  │                          ├─ POST token exchange ────►│
  │                          │◄─ { access_token, refresh_token }
  │                          ├─ Store in sessions Map    │
  │◄─ Redirect /?session=UUID┤                          │
```

### 4.2 Video Generation + Caption Flow

```
Browser                    Server                    FFmpeg / Claude
  │                          │                          │
  ├─ POST /api/generate ────►│                          │
  │◄─ { jobId } ────────────┤                          │
  │                          │                          │
  │─ POST /api/captions ────►│                          │
  │  (parallel, non-blocking)│─ Claude API call ────────►│ (Anthropic)
  │                          │◄─ { engaging, prof. } ───┤
  │◄─ { captions } ─────────┤                          │
  │                          │                          │
  │  [video pipeline runs]   │                          │
  │                          ├─ Download media ──────────│
  │                          ├─ buildStitchArgs() ───────│
  │                          ├─ ffmpegQueue.add() ──────►│ (FFmpeg)
  │                          │◄─ Reel .mp4 ─────────────┤
  │                          ├─ Stream copy Short ──────►│
  │                          │◄─ Short .mp4 ────────────┤
  │                          ├─ validateVideo() × 2      │
  │                          ├─ Update job: done         │
  │                          │                          │
  ├─ GET /api/generate/:id ─►│                          │
  │◄─ { status: done, urls } ┤                          │
  │                          │                          │
  │─ [CaptionsScreen] ──────│                          │
  │  user picks/edits caption│                          │
  │                          │                          │
  │─ [PreviewScreen] ────────│                          │
  │  download/share/copy     │                          │
```

---

## 5. FFmpeg Filter Chain

### Per-Input Normalize Chain
```
[N:v] → scale=1080:1920 (fit within, maintain aspect ratio)
      → pad=1080:1920 (center with black letterbox)
      → setsar=1 (square pixels)
      → fps=30 (consistent frame rate)
      → format=yuv420p (H.264 compatible)
      → settb=1/30 (normalize timebase for xfade)
      → [vN]
```

### Xfade Transition Chain
```
[v0][v1] → xfade=fade:duration=0.5:offset=2.5 → [xf1]
[xf1][v2] → xfade=fade:duration=0.5:offset=5.0 → [outv]
```

### Encoder Settings (Memory-Optimized)
```
-c:v libx264           # H.264 codec
-preset ultrafast       # Minimum memory footprint
-tune stillimage        # Optimized for slideshow content
-crf 28                 # Quality (lower = better, 28 = good enough)
-threads 1              # Single thread = ~50% less RAM
-x264-params rc-lookahead=10:ref=1:bframes=0  # Minimize buffers
-movflags +faststart    # Web-optimized MP4
-an                     # No audio track
```

---

## 6. AI Caption Architecture

### Caption Generation Flow
```
POST /api/captions { items }
  │
  ├─ Extract metadata per item:
  │   filename, mimeType, creationTime, dimensions, camera info
  │
  ├─ No ANTHROPIC_API_KEY:
  │   └─ generateDemoCaptions() → template with item count + filenames
  │
  └─ With ANTHROPIC_API_KEY:
      ├─ Build prompt with photo metadata context
      ├─ Call: POST api.anthropic.com/v1/messages
      │   model: claude-sonnet-4-20250514
      │   max_tokens: 1024
      │   Response format: JSON { engaging, professional }
      ├─ Parse JSON from response content
      └─ On error: fallback to generateDemoCaptions()
```

### Caption Styles
| Style | Target | Tone | Hashtags | Emojis |
|-------|--------|------|----------|--------|
| Engaging | Instagram/TikTok | Fun, attention-grabbing | 3-5 | Sparingly |
| Professional | LinkedIn/YouTube | Clean, business-appropriate | 2-3 | None |

---

## 7. Deployment Architecture

### Railway Configuration
```
GitHub (main branch)
       │
       │ push
       ▼
Railway (auto-deploy)
       │
       │ Docker build
       ▼
┌─────────────────────────────┐
│  node:20-slim               │
│  + ffmpeg (apt-get)         │
│  + fonts-dejavu-core        │
│  + npm ci --omit=dev        │
│                             │
│  EXPOSE 3000                │
│  CMD ["node", "server.js"]  │
└─────────────────────────────┘
```

### Environment Variables
| Variable | Source | Purpose |
|----------|--------|---------|
| `PORT` | Railway (auto) | Server listen port |
| `RAILWAY_PUBLIC_DOMAIN` | Railway (auto) | Public URL for OAuth redirect |
| `GOOGLE_CLIENT_ID` | Manual | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Manual | OAuth client secret |
| `ANTHROPIC_API_KEY` | Manual | Claude API for AI captions |

---

## 8. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| OAuth token exposure | Stored server-side in session Map, never sent to browser |
| Session hijacking | UUID-based session IDs, HTTPS-only in production |
| FFmpeg injection | Arguments passed as array via `spawn()`, no shell interpolation |
| File system abuse | Temp dirs cleaned per job, outputs cleaned every 10 min |
| Resource exhaustion | Job queue limits to 1 concurrent FFmpeg process |
| API key exposure | `ANTHROPIC_API_KEY` stored in env vars, never sent to browser |
| API abuse | No rate limiting yet — identified as future hardening item |

---

## 9. Known Limitations

| Limitation | Impact | Mitigation Path |
|-----------|--------|-----------------|
| In-memory session store | Sessions lost on redeploy | Redis add-on on Railway |
| Ephemeral filesystem | Videos lost on redeploy | Cloud storage (GCS/S3) |
| No rate limiting | Users can spam FFmpeg/caption endpoints | Express rate limiter middleware |
| Single server | No horizontal scaling | Stateless design ready for multi-instance with Redis |
| baseUrl expiration | Google Photos URLs expire ~1hr | Re-fetched at generation time via batchGet |
| No CDN for outputs | Videos served from container | Cloud storage + CDN |
| Caption quality without metadata | Demo photos have no real metadata | Best with real Google Photos (filenames, dates, camera info) |

---

## 10. Future Architecture Considerations

### Persistent Storage
- Replace in-memory Maps with Redis for sessions and job tracking
- Move video output to cloud storage (GCS signed URLs or S3 presigned URLs)

### Background Music
- Accept uploaded audio file or provide pre-licensed tracks
- FFmpeg `-i audio.mp3 -shortest` flag to mix audio with video
- Audio normalization with `loudnorm` filter

### Caption Enhancements
- Regenerate button to get new caption suggestions
- Caption history / favorites
- Custom style presets (casual, formal, funny, inspirational)
- Multi-language caption generation

---

## 11. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | March 23, 2026 | Initial architecture |
| 2.0 | March 26, 2026 | Added job queue, memory-optimized encoding, stream-copy Short, deployment architecture, security section |
| 2.1 | March 26, 2026 | Added AI caption architecture (Claude API integration), caption pipeline diagram, updated system overview, added ANTHROPIC_API_KEY to env vars |

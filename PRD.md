# ReelMaker — Product Requirements Document (PRD)
## Version 2.1 | March 26, 2026

---

## 1. Product Vision

**ReelMaker** transforms Google Photos into scroll-stopping short-form videos with AI-powered captions. Connect your library, pick your favorites, and get Instagram Reels and YouTube Shorts — plus ready-to-post captions — generated in seconds, no editing skills required.

### Problem Statement
Creating short-form video content (Reels, Shorts) from existing photos requires downloading media, learning video editing software, understanding platform specs, exporting correctly, and then writing an engaging caption. Most casual creators and small businesses skip this entirely because it's too complex.

### Solution
ReelMaker eliminates every friction point. One click connects Google Photos. Tap to select. One button generates platform-ready videos with transitions. AI writes your post caption in two styles. Download, copy your caption, and share instantly.

---

## 2. Target Audience

### Primary: Social Media Creators (Casual)
- Have photos on Google Photos, want to post Reels/Shorts
- Limited or no video editing experience
- Value speed over control
- Typically 18-45, mobile-first

### Secondary: Small Business Owners
- Need promotional video content from product photos
- Don't have budget for video editing software or freelancers
- Want professional-looking output quickly
- Realtors, restaurant owners, small e-commerce shops

### Tertiary: Memory Sharers
- Want to turn vacation/event photos into video slideshows
- Share with family and friends
- Less concerned about platform optimization

---

## 3. Product Requirements

### 3.1 Core Workflow

The product follows a linear 5-step workflow:

```
CONNECT → SELECT → GENERATE → CAPTION → DOWNLOAD/SHARE
```

Each step maps to a screen in the application. Users cannot skip steps (except captions can be skipped). The entire flow should take under 2 minutes for a typical 5-photo video.

### 3.2 Feature Matrix

| Feature | Priority | Status | Release |
|---------|----------|--------|---------|
| Google Photos OAuth connection | P0 | ✅ Shipped | v1.0 |
| Photo/video browser with grid UI | P0 | ✅ Shipped | v1.0 |
| Multi-select with order badges | P0 | ✅ Shipped | v1.0 |
| Instagram Reel generation (9:16, 90s) | P0 | ✅ Shipped | v2.0 |
| YouTube Short generation (9:16, 60s) | P0 | ✅ Shipped | v2.0 |
| Fade transitions between items | P0 | ✅ Shipped | v2.0 |
| Real-time progress tracking | P0 | ✅ Shipped | v2.0 |
| Download as .mp4 | P0 | ✅ Shipped | v2.0 |
| Demo mode (no Google account needed) | P1 | ✅ Shipped | v1.0 |
| Web Share API integration | P1 | ✅ Shipped | v2.2 |
| Error handling with retry | P1 | ✅ Shipped | v2.2 |
| AI post captions (2 styles) | P0 | ✅ Shipped | v2.3 |
| Editable caption with copy | P0 | ✅ Shipped | v2.3 |
| Caption on preview screen | P1 | ✅ Shipped | v2.3 |
| Photo duration slider | P2 | ❌ Not started | v3.x |
| Transition style picker | P2 | ❌ Not started | v3.x |
| Background music | P2 | ❌ Not started | v3.x |
| Instagram deep link share | P2 | ❌ Not started | v3.x |
| YouTube deep link share | P2 | ❌ Not started | v3.x |

### 3.3 Feature Specifications

#### 3.3.1 Connect (Screen: Landing → Connecting)

**What it does**: Authenticates user with Google Photos via OAuth 2.0 and establishes a session.

**User experience**:
- Landing page shows hero CTA: "Connect Google Photos"
- Clicking redirects to Google's consent screen
- After granting access, user returns to the app with their profile visible
- If OAuth is not configured, demo mode loads automatically with colored placeholder images
- User can disconnect at any time (revokes Google access)

**Technical specs**:
- Scopes: `photoslibrary.readonly`, `userinfo.profile`, `userinfo.email`
- Token refresh: automatic when access token is within 60s of expiry
- Session stored server-side (in-memory Map, keyed by UUID)

#### 3.3.2 Select (Screen: Browser)

**What it does**: Displays the user's Google Photos library and allows multi-selection.

**User experience**:
- Photos displayed in a responsive grid (auto-fill, 150px minimum, 9:16 aspect ratio cards)
- Clicking a photo toggles selection on/off
- Selected photos show a numbered badge (1, 2, 3...) indicating order
- Video items show a "▶ Video" badge
- Toolbar shows selection count ("3/10 selected") and generates button
- "Generate Videos" button is disabled until 2+ items are selected
- "Load More" pagination button at bottom

#### 3.3.3 Generate (Screen: Processing)

**What it does**: Server-side FFmpeg pipeline creates two videos. Caption generation runs in parallel.

**User experience**:
- Progress bar fills from 0% to 100%
- Status text updates: "Downloading media..." → "Queued..." → "Encoding Reel..." → "Creating Short..." → "Validating..."
- If generation fails, error message displayed with "Try Again" button
- Captions are generated in parallel (non-blocking) — ready by the time video completes

**Output specs**:
| Property | Instagram Reel | YouTube Short |
|----------|---------------|---------------|
| Aspect ratio | 9:16 | 9:16 |
| Resolution | 1080×1920 | 1080×1920 |
| Codec | H.264 (libx264) | H.264 (libx264) |
| Frame rate | 30fps | 30fps |
| Pixel format | yuv420p | yuv420p |
| Max duration | 90 seconds | 60 seconds |
| Container | MP4 (faststart) | MP4 (faststart) |

#### 3.3.4 Caption (Screen: Captions) — NEW in v2.3

**What it does**: Presents AI-generated post captions in two styles for the user to choose and edit.

**User experience**:
- Two style tabs: 🔥 Engaging (social media with hashtags) and 💼 Professional (clean, business)
- Each tab shows an editable textarea with the AI-generated caption
- Character count displayed below textarea
- Copy button to copy caption to clipboard
- "Use This Caption →" proceeds to preview with selected caption
- "Skip Caption →" proceeds to preview without a caption

**Caption generation**:
- Triggered in parallel with video generation (no extra wait time)
- Uses Claude API (Sonnet) with photo metadata as context
- Falls back to template-based demo captions when `ANTHROPIC_API_KEY` is not set
- Non-blocking — if caption API fails, user can still proceed

#### 3.3.5 Preview & Download (Screen: Preview)

**What it does**: Shows generated videos with download, share, and caption copy options.

**User experience**:
- If a caption was selected, it appears at the top in a card with a "Copy Caption" button
- Two cards below: "📱 Instagram Reel" and "▶️ YouTube Short"
- Each card has: video player, duration/resolution label, download button, share button
- Download triggers browser's native file save dialog
- Share uses Web Share API (available on mobile browsers)
- "Start Over" returns to the browser screen

---

## 4. Design System

### 4.1 Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Deep Black | `#0D0D0D` | Page backgrounds |
| Warm Cream | `#F5F0EB` | Primary text, surfaces |
| Sunset Coral | `#FF6B35` | CTAs, accents, selection badges |
| Coral Hover | `#E85A28` | Button hover state |
| Surface | `#1A1A1A` | Cards, panels |
| Surface 2 | `#242424` | Secondary surfaces |
| Border | `#333333` | Dividers, card borders |
| Text Muted | `#999999` | Secondary text, labels |
| Success | `#2A9D8F` | Success states, copied confirmation |
| Error | `#E63946` | Error states, toasts |

### 4.2 Typography
| Role | Font | Weight | Size |
|------|------|--------|------|
| Headings | Sora | 600-700 | 16-40px |
| Body | DM Sans | 400-600 | 13-18px |
| Buttons | DM Sans | 600 | 13-16px |
| Caption editor | DM Sans | 400 | 15px |

### 4.3 Components
| Component | Style |
|-----------|-------|
| Primary button | Sunset Coral bg, white text, 12px radius, hover glow |
| Secondary button | Surface bg, cream text, border, 12px radius |
| Cards | Surface bg, border, 16px radius |
| Toast (error) | Error bg, white text, fixed top-center, 12px radius |
| Progress bar | 6px height, Surface 2 track, Coral fill |
| Photo card | 9:16 aspect, 12px radius, 3px border on selection |
| Badge | 28px circle, Coral bg, white number, absolute top-right |
| Style tab | Surface bg, Coral border when active, 12px radius |
| Caption textarea | Transparent bg, Cream text, no border, 20px padding |

---

## 5. User Stories

### Shipped (v1.0 – v2.3)

| ID | Story | Status |
|----|-------|--------|
| US-01 | As a user, I want to connect my Google Photos so I can use my existing media | ✅ |
| US-02 | As a user, I want to browse my photos in a visual grid so I can pick the best ones | ✅ |
| US-03 | As a user, I want to select photos in a specific order so the video follows my narrative | ✅ |
| US-04 | As a user, I want to generate an Instagram Reel from my selected photos | ✅ |
| US-05 | As a user, I want to generate a YouTube Short from my selected photos | ✅ |
| US-06 | As a user, I want to see progress while my video generates so I know it's working | ✅ |
| US-07 | As a user, I want to download my generated videos as .mp4 files | ✅ |
| US-08 | As a user, I want to try the app without connecting Google Photos (demo mode) | ✅ |
| US-09 | As a user, I want to retry if generation fails without losing my selection | ✅ |
| US-10 | As a user, I want to share my video directly from the app on mobile | ✅ |
| US-11 | As a user, I want to disconnect my Google account when done | ✅ |
| US-12 | As a user, I want AI-generated post captions so I don't have to write them myself | ✅ |
| US-13 | As a user, I want to choose between engaging and professional caption styles | ✅ |
| US-14 | As a user, I want to edit the AI caption before using it | ✅ |
| US-15 | As a user, I want to copy my caption to clipboard for pasting into Instagram/YouTube | ✅ |
| US-16 | As a user, I want to skip captions if I prefer to write my own later | ✅ |

### Backlog (v3.0+)

| ID | Story | Priority |
|----|-------|----------|
| US-17 | As a user, I want to choose how long each photo appears in the video | P2 |
| US-18 | As a user, I want to pick different transition styles (wipe, slide, dissolve) | P2 |
| US-19 | As a user, I want to add background music to my video | P2 |
| US-20 | As a user, I want to share directly to Instagram with one tap | P2 |
| US-21 | As a user, I want to share directly to YouTube with one tap | P2 |
| US-22 | As a user, I want to preview individual photos before generating | P3 |
| US-23 | As a user, I want to reorder selected photos by drag-and-drop | P3 |
| US-24 | As a user, I want to regenerate captions with a different style | P3 |

---

## 6. Release Plan

### v1.0 — Foundation ✅ (Session 1)
- Google Photos OAuth connection
- Photo browser with selection
- Demo mode
- Design system implementation

### v2.0 — Video Pipeline ✅ (Sessions 2-3)
- FFmpeg video stitching with xfade transitions
- Dual output (Reel + Short)
- ffprobe validation
- Download functionality
- Railway deployment with Dockerfile

### v2.2 — Stability ✅ (Session 4)
- FFmpeg OOM fix (job queue, memory-optimized encoding)
- Stream-copy Short from Reel
- Web Share API
- Hardened error handling with real error messages

### v2.3 — AI Captions ✅ (Session 5)
- AI post caption generation via Claude API
- Two styles: Engaging (social) + Professional (business)
- Editable caption with copy-to-clipboard
- New CaptionsScreen between processing and preview
- Parallel caption + video generation

### v3.x — Enhancement Pack (Future)
- Photo duration slider
- Transition style picker (40+ FFmpeg xfade options)
- Background music upload
- Instagram/YouTube deep link sharing
- Caption regeneration
- Mobile UX improvements

---

## 7. Metrics & Success Criteria

### Launch Metrics (v2.3)
| Metric | Target | Actual |
|--------|--------|--------|
| Video generation success rate | >95% | Measuring |
| Time to generate (5 photos) | <60s | ~15s |
| Caption generation time | <10s | ~3s |
| Health check uptime | >99% | Active |
| Output validation pass rate | 100% | 100% |

### Product Metrics (Future)
| Metric | Target |
|--------|--------|
| Monthly active users | Tracking post-launch |
| Videos generated per user per session | >1 |
| Caption usage rate (% who use vs skip) | >60% |
| Share rate (% of downloads shared) | >20% |
| Return user rate (7-day) | >30% |

---

## 8. Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Railway OOM on large selections | Medium | High | Job queue + ultrafast + single thread |
| Google Photos API rate limits | Low | High | Low traffic currently. Add backoff when scaling |
| Session loss on redeploy | High | Medium | Accept for MVP. Redis for production |
| Generated files lost on redeploy | High | Medium | Accept for MVP. Cloud storage for production |
| Claude API downtime | Low | Low | Template fallback captions — app still works |
| Claude API cost at scale | Medium | Medium | Monitor usage. Consider caching common patterns |
| Instagram/YouTube reject format | Low | High | Validated: H.264, 1080×1920, 30fps, yuv420p |

---

## 9. Open Questions

1. **Monetization**: Free tier with watermark + paid tier without? Subscription? Pay-per-video?
2. **User accounts**: Keep session-based or add persistent accounts with video history?
3. **Direct publishing**: Worth pursuing Instagram/YouTube API integration, or is download + share sufficient?
4. **Music licensing**: How to handle background music legally? Pre-licensed library or user-uploaded only?
5. **Caption regeneration**: Add a "regenerate" button for new caption suggestions?
6. **Caption analytics**: Track which caption style (engaging vs professional) users prefer?

---

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 23, 2026 | Session 1 | Initial PRD |
| 2.0 | March 26, 2026 | Session 4 | Updated all feature statuses, added design system, release plan, user stories, metrics, risks |
| 2.1 | March 26, 2026 | Session 5 | Added AI captions feature (v2.3), updated workflow to 5 steps, added US-12 through US-16, updated release plan, added caption-related risks and metrics |

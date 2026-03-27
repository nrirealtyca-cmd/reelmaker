# ReelMaker — Business Requirements Document (BRD)
## Version 2.1 | March 26, 2026

---

## 1. Executive Summary

ReelMaker is a web application that enables users to create Instagram Reels and YouTube Shorts directly from their Google Photos library. Users connect their Google Photos account, select up to 10 photos or video clips, and ReelMaker generates polished short-form videos with transitions — plus AI-generated post captions ready for copy-paste into Instagram or YouTube.

### Business Objective
Simplify short-form video creation for individuals and small businesses who have media in Google Photos but lack video editing skills or software.

### Target Users
- Social media creators wanting quick content from their photo library
- Small business owners creating promotional Reels/Shorts
- Casual users wanting to share photo memories as videos

---

## 2. Scope

### In Scope
- Google Photos integration (OAuth 2.0, media browsing, photo/video download)
- Automated video generation with transitions (Instagram Reel + YouTube Short formats)
- AI-generated post captions (engaging + professional styles) via Claude API
- Download and share functionality
- Demo mode for users without Google Photos

### Out of Scope
- Direct publishing to Instagram/YouTube (requires platform API partnerships)
- User accounts or persistent storage (session-based only)
- Video editing tools (trimming, cropping, manual timeline)
- Music/audio library integration (future consideration)
- Multi-language captioning (English-first)
- Captions burned into video (captions are for the post text, not video overlay)

---

## 3. Functional Requirements

### FR-01: Google Photos Connection
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01.1 | OAuth 2.0 authentication with Google Photos API | Must | ✅ Done |
| FR-01.2 | Display user profile (name, email, avatar) after connection | Must | ✅ Done |
| FR-01.3 | Browse media library with thumbnail grid (50 items/page) | Must | ✅ Done |
| FR-01.4 | Paginated loading with "Load More" | Must | ✅ Done |
| FR-01.5 | Disconnect/revoke access | Must | ✅ Done |
| FR-01.6 | Demo mode when OAuth is not configured | Should | ✅ Done |
| FR-01.7 | Automatic token refresh when access token expires | Must | ✅ Done |

### FR-02: Media Selection
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-02.1 | Select 2–10 photos or videos from library | Must | ✅ Done |
| FR-02.2 | Visual selection indicator with order badges (1, 2, 3...) | Must | ✅ Done |
| FR-02.3 | Toggle selection on/off by clicking | Must | ✅ Done |
| FR-02.4 | Enforce maximum 10-item limit | Must | ✅ Done |
| FR-02.5 | Distinguish video items with badge overlay | Should | ✅ Done |
| FR-02.6 | Selection count display with minimum requirement hint | Should | ✅ Done |

### FR-03: Video Generation
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-03.1 | Generate Instagram Reel: 9:16, H.264, 1080×1920, 30fps, up to 90s | Must | ✅ Done |
| FR-03.2 | Generate YouTube Short: 9:16, H.264, 1080×1920, 30fps, up to 60s | Must | ✅ Done |
| FR-03.3 | Fade transitions between items | Must | ✅ Done |
| FR-03.4 | Photo duration: 3 seconds per photo (configurable future) | Must | ✅ Done |
| FR-03.5 | Video clips trimmed to match photo duration | Should | ✅ Done |
| FR-03.6 | Proper letterboxing for non-9:16 media | Must | ✅ Done |
| FR-03.7 | Real-time progress reporting via polling | Must | ✅ Done |
| FR-03.8 | Queue system for concurrent requests (max 1 encode) | Must | ✅ Done |
| FR-03.9 | Memory-optimized encoding for constrained environments | Must | ✅ Done |

### FR-04: Video Validation
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-04.1 | Validate output: H.264 codec | Must | ✅ Done |
| FR-04.2 | Validate output: 1080×1920 resolution | Must | ✅ Done |
| FR-04.3 | Validate output: 30fps frame rate | Must | ✅ Done |
| FR-04.4 | Validate output: yuv420p pixel format | Must | ✅ Done |
| FR-04.5 | Validate output: non-zero duration and file size | Must | ✅ Done |

### FR-05: AI Post Captions
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-05.1 | Generate captions from photo metadata via Claude API | Must | ✅ Done |
| FR-05.2 | Provide "Engaging" style (social media, hashtags, emojis) | Must | ✅ Done |
| FR-05.3 | Provide "Professional" style (clean, business-appropriate) | Must | ✅ Done |
| FR-05.4 | Editable caption textarea before proceeding to preview | Must | ✅ Done |
| FR-05.5 | Copy-to-clipboard for captions | Must | ✅ Done |
| FR-05.6 | Option to skip caption and proceed directly | Should | ✅ Done |
| FR-05.7 | Demo/fallback captions when API key is not configured | Should | ✅ Done |
| FR-05.8 | Caption generation runs in parallel with video encoding | Should | ✅ Done |

### FR-06: Download & Share
| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-06.1 | Download Reel as .mp4 file | Must | ✅ Done |
| FR-06.2 | Download Short as .mp4 file | Must | ✅ Done |
| FR-06.3 | Share via Web Share API (mobile devices) | Should | ✅ Done |
| FR-06.4 | Copy caption on preview screen for pasting into Instagram/YouTube | Should | ✅ Done |
| FR-06.5 | Deep link to Instagram for sharing | Could | ❌ Not Started |
| FR-06.6 | Deep link to YouTube for sharing | Could | ❌ Not Started |

---

## 4. Non-Functional Requirements

### NFR-01: Performance
| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-01.1 | Photo thumbnails load within 5 seconds | <5s | ✅ Met |
| NFR-01.2 | Video generation completes within 120 seconds | <120s | ✅ Met |
| NFR-01.3 | Page load time | <3s | ✅ Met |
| NFR-01.4 | Caption generation completes within 10 seconds | <10s | ✅ Met |

### NFR-02: Reliability
| ID | Requirement | Status |
|----|-------------|--------|
| NFR-02.1 | Graceful error handling with user-friendly messages | ✅ Done |
| NFR-02.2 | Retry capability on generation failure | ✅ Done |
| NFR-02.3 | Auto-cleanup of temp files and old outputs | ✅ Done |
| NFR-02.4 | OOM protection via job queue and memory-optimized encoding | ✅ Done |
| NFR-02.5 | Caption API fallback to demo captions on failure | ✅ Done |

### NFR-03: Security
| ID | Requirement | Status |
|----|-------------|--------|
| NFR-03.1 | OAuth 2.0 with refresh token rotation | ✅ Done |
| NFR-03.2 | No credentials stored client-side (session ID only) | ✅ Done |
| NFR-03.3 | Token revocation on disconnect | ✅ Done |
| NFR-03.4 | Anthropic API key stored server-side only | ✅ Done |

### NFR-04: Compatibility
| ID | Requirement | Status |
|----|-------------|--------|
| NFR-04.1 | Works on Chrome, Safari, Firefox, Edge (latest) | ✅ Done |
| NFR-04.2 | Mobile-responsive layout | ⚠️ Partial |
| NFR-04.3 | Generated videos compatible with Instagram and YouTube | ✅ Done |

---

## 5. Use Cases

### UC-01: Connect Google Photos ✅
**Actor**: User
**Flow**: User clicks "Connect Google Photos" → redirected to Google OAuth → grants permissions → redirected back with session → profile displayed

### UC-02: Browse and Select Media ✅
**Actor**: Authenticated User
**Flow**: Photo grid loads (50/page) → user clicks photos to select (2-10) → selection badges show order → "Generate Videos" button becomes active

### UC-03: Generate Videos ✅
**Actor**: Authenticated User (or Demo User)
**Flow**: User clicks "Generate Videos" → processing screen with progress bar → backend downloads media → FFmpeg encodes Reel → stream-copies Short → validates both → proceeds to captions

### UC-04: AI Caption Generation ✅
**Actor**: User
**Flow**: After video generation completes → captions screen shows two AI-generated styles (Engaging / Professional) → user switches between styles, edits text → clicks "Use This Caption" or "Skip Caption" → proceeds to preview

### UC-05: Download and Share ⚠️
**Actor**: User
**Flow**: On preview screen → selected caption shown with copy button → user clicks "Download" to save .mp4 → or clicks "Share" to use Web Share API (mobile) → future: deep links to Instagram/YouTube apps

---

## 6. Constraints and Assumptions

### Constraints
- Railway free/hobby tier has limited RAM (~512MB-8GB depending on plan)
- Google Photos API `baseUrl` values expire after ~60 minutes
- No direct Instagram/YouTube publishing API access
- Railway filesystem is ephemeral — files lost on redeploy
- Anthropic API requires an API key (demo fallback available without)

### Assumptions
- Users have a Google account with photos
- Users access the app from a modern browser
- Internet connection is stable enough for photo download and video generation
- Generated videos are short enough to fit platform limits (90s/60s)
- Users will copy-paste captions into Instagram/YouTube (no direct publishing)

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Video generation success rate | >95% |
| Time from "Generate" to preview | <60s for 5 photos |
| User can download working .mp4 | 100% of successful generations |
| Generated video passes Instagram/YouTube upload validation | 100% |
| Caption generation success rate | >99% (with fallback) |

---

## 8. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | March 23, 2026 | Session 1 | Initial BRD with 30 FRs, 5 use cases |
| 2.0 | March 26, 2026 | Session 4 | Updated status for all FRs, added NFRs, added FR-03.8/FR-03.9, updated UC-03 flow |
| 2.1 | March 26, 2026 | Session 5 | FR-05 rewritten for post captions (not video overlay), added FR-05.1-FR-05.8, FR-06.4, NFR-01.4, NFR-02.5, NFR-03.4, updated UC-04, updated scope |

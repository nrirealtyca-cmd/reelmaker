// ============================================================
// ReelMaker — server.js v2.4 (Session 6 — Gemini Captions)
// Express backend: Auth, Google Photos API, FFmpeg pipeline,
// AI Captions via Google Gemini
// ============================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Config ──────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Build base URL from Railway domain or fallback
const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : `http://localhost:${PORT}`;

const REDIRECT_URI = `${BASE_URL}/auth/google/callback`;

const TMP_DIR = path.join(process.env.NODE_ENV === 'production' ? '/tmp' : __dirname, 'tmp', 'reelmaker');
const OUT_DIR = path.join(__dirname, 'public', 'output');

// Ensure directories exist
[TMP_DIR, OUT_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// ─── Session Store (in-memory) ───────────────────────────────

const sessions = new Map();

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

// ─── Job Queue (max 1 concurrent FFmpeg job) ─────────────────

class JobQueue {
  constructor(concurrency = 1) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          if (this.queue.length > 0 && this.running < this.concurrency) {
            this.queue.shift()();
          }
        }
      };
      if (this.running < this.concurrency) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  get pending() { return this.queue.length; }
  get active() { return this.running; }
}

const ffmpegQueue = new JobQueue(1);

// ─── Job Tracker ─────────────────────────────────────────────

const jobs = {};
const OUTPUT_TTL = 60 * 60 * 1000; // 1 hour

// Clean old output files every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of Object.entries(jobs)) {
    if (job.createdAt && now - job.createdAt > OUTPUT_TTL) {
      [job.reelUrl, job.shortUrl].forEach(url => {
        if (url) {
          const filePath = path.join(__dirname, 'public', url.replace(/^\//, ''));
          try { fs.unlinkSync(filePath); } catch {}
        }
      });
      delete jobs[jobId];
    }
  }
}, 10 * 60 * 1000);

// ─── Static Files ────────────────────────────────────────────

app.use(express.static('public', { extensions: ['html'] }));

// Dedicated video file route with proper headers
app.get('/output/:filename', (req, res) => {
  const filePath = path.join(OUT_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  });
  fs.createReadStream(filePath).pipe(res);
});

// ─── Health Check ────────────────────────────────────────────

app.get('/health', (req, res) => {
  let ffmpegVersion = '';
  let hasLibx264 = false;
  try {
    ffmpegVersion = execSync('ffmpeg -version 2>&1', { maxBuffer: 10 * 1024 * 1024 }).toString().split('\n')[0];
    const codecs = execSync('ffmpeg -codecs 2>&1', { maxBuffer: 10 * 1024 * 1024 }).toString();
    hasLibx264 = codecs.includes('libx264');
  } catch {}

  let tmpWritable = false, outWritable = false;
  try {
    const tf = path.join(TMP_DIR, '.write-test');
    fs.writeFileSync(tf, 'ok');
    fs.unlinkSync(tf);
    tmpWritable = true;
  } catch {}
  try {
    const of = path.join(OUT_DIR, '.write-test');
    fs.writeFileSync(of, 'ok');
    fs.unlinkSync(of);
    outWritable = true;
  } catch {}

  res.json({
    status: 'ok',
    version: '2.4',
    ffmpeg: !!ffmpegVersion,
    ffmpegVersion,
    libx264: hasLibx264,
    tmpDir: TMP_DIR,
    tmpWritable,
    outDir: OUT_DIR,
    outWritable,
    base: BASE_URL,
    oauth: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    captionApi: !!GEMINI_API_KEY,
    activeJobs: ffmpegQueue.active,
    queuedJobs: ffmpegQueue.pending,
    totalTrackedJobs: Object.keys(jobs).length
  });
});

// ─── Google OAuth 2.0 ────────────────────────────────────────

app.get('/auth/google/url', (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.json({ authUrl: null, message: 'OAuth not configured — demo mode only' });
  }
  const scopes = [
    'https://www.googleapis.com/auth/photoslibrary.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent'
  }).toString();
  res.json({ authUrl });
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const tokenData = await fetchJSON('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      }).toString()
    });

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      createdAt: Date.now()
    });

    res.redirect(`/?session=${sessionId}`);
  } catch (err) {
    console.error('[OAuth callback error]', err.message);
    res.redirect('/?error=auth_failed');
  }
});

// ─── Token Refresh ───────────────────────────────────────────

async function refreshAccessToken(session) {
  if (!session.refreshToken) throw new Error('No refresh token');
  const tokenData = await fetchJSON('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: session.refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token'
    }).toString()
  });
  session.accessToken = tokenData.access_token;
  session.expiresAt = Date.now() + (tokenData.expires_in * 1000);
  return session.accessToken;
}

async function getValidToken(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;
  if (Date.now() >= session.expiresAt - 60000) {
    try {
      await refreshAccessToken(session);
    } catch (err) {
      console.error('[Token refresh failed]', err.message);
      return null;
    }
  }
  return session.accessToken;
}

// ─── User Profile ────────────────────────────────────────────

app.get('/api/profile', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const token = await getValidToken(sessionId);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const profile = await fetchJSON('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    res.json({ name: profile.name, email: profile.email, picture: profile.picture });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Photos Library ──────────────────────────────────────────

app.get('/api/photos', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const token = await getValidToken(sessionId);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const pageToken = req.query.pageToken || '';
    const url = 'https://photoslibrary.googleapis.com/v1/mediaItems?' + new URLSearchParams({
      pageSize: '50',
      ...(pageToken ? { pageToken } : {})
    }).toString();

    const data = await fetchJSON(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const items = (data.mediaItems || []).map(item => ({
      id: item.id,
      baseUrl: item.baseUrl,
      mimeType: item.mimeType,
      filename: item.filename,
      mediaMetadata: item.mediaMetadata,
      thumbnail: `${item.baseUrl}=w400-h400-c`,
      isMock: false
    }));

    res.json({ items, nextPageToken: data.nextPageToken || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Disconnect ──────────────────────────────────────────────

app.post('/api/disconnect', async (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const session = getSession(sessionId);
  if (session) {
    try {
      await fetchJSON(`https://oauth2.googleapis.com/revoke?token=${session.accessToken}`, { method: 'POST' });
    } catch {}
    sessions.delete(sessionId);
  }
  res.json({ success: true });
});

// ─── AI Captions (Google Gemini) — 5 Tones ──────────────────

const CAPTION_TONES = {
  engaging:      'Fun, attention-grabbing, use 1-2 emojis, include a call to action. Add 3-4 relevant hashtags at the end.',
  professional:  'Clean, polished, business-appropriate. No emojis. Authoritative but approachable. Add 2-3 industry-relevant hashtags at the end.',
  witty:         'Clever wordplay, puns, or humor. Personality-driven, slightly cheeky. Use 1 emoji max. Add 3-4 fun hashtags at the end.',
  inspirational: 'Motivational, uplifting, poetic. Think quote-style caption. Use 1-2 emojis. Add 2-3 aspirational hashtags at the end.',
  storyteller:   'Narrative voice, behind-the-scenes feel, personal and warm. As if sharing with a friend. Use 1 emoji max. Add 2-3 hashtags at the end.'
};

const TONE_KEYS = Object.keys(CAPTION_TONES);

// Gemini REST API responseSchema — using uppercase types + descriptions per docs
const CAPTION_SCHEMA = {
  type: 'OBJECT',
  description: 'Five social media captions in different tones, each approximately 30 words plus hashtags',
  properties: {
    engaging:      { type: 'STRING', description: 'Fun caption with emojis and call to action, ~30 words + hashtags' },
    professional:  { type: 'STRING', description: 'Clean business-appropriate caption, no emojis, ~30 words + hashtags' },
    witty:         { type: 'STRING', description: 'Clever humorous caption with wordplay, ~30 words + hashtags' },
    inspirational: { type: 'STRING', description: 'Motivational uplifting caption, ~30 words + hashtags' },
    storyteller:   { type: 'STRING', description: 'Personal narrative-style caption, ~30 words + hashtags' }
  },
  propertyOrdering: ['engaging', 'professional', 'witty', 'inspirational', 'storyteller'],
  required: ['engaging', 'professional', 'witty', 'inspirational', 'storyteller']
};

app.post('/api/captions', async (req, res) => {
  const { items, platform = 'reel' } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' });
  }

  if (!GEMINI_API_KEY) {
    console.log('[Captions] No GEMINI_API_KEY — returning demo captions');
    return res.json({
      captions: generateDemoCaptions(items, platform),
      tones: TONE_KEYS,
      source: 'demo'
    });
  }

  try {
    const captions = await generateGeminiCaptions(items, platform);
    res.json(captions);
  } catch (err) {
    console.error('[Captions] Fatal error:', err.message);
    res.json({
      captions: generateDemoCaptions(items, platform),
      tones: TONE_KEYS,
      source: 'fallback',
      error: err.message
    });
  }
});

async function generateGeminiCaptions(items, platform) {
  // Build context from photo metadata
  const photoContext = items.map((item, i) => {
    const parts = [`Photo ${i + 1}`];
    if (item.filename) parts.push(`file: "${item.filename}"`);
    if (item.mimeType) parts.push(`type: ${item.mimeType}`);
    if (item.mediaMetadata) {
      const m = item.mediaMetadata;
      if (m.creationTime) parts.push(`taken: ${m.creationTime}`);
      if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
      if (m.photo) {
        if (m.photo.cameraMake) parts.push(`camera: ${m.photo.cameraMake} ${m.photo.cameraModel || ''}`);
        if (m.photo.focalLength) parts.push(`${m.photo.focalLength}mm f/${m.photo.apertureFNumber}`);
        if (m.photo.isoEquivalent) parts.push(`ISO ${m.photo.isoEquivalent}`);
      }
    }
    return parts.join(' | ');
  }).join('\n');

  const platformName = platform === 'short' ? 'YouTube Short' : 'Instagram Reel';

  const toneInstructions = TONE_KEYS.map((key, i) =>
    `${i + 1}. "${key}" — ${CAPTION_TONES[key]}`
  ).join('\n');

  const prompt = `You are an expert social media caption writer. Generate captions for a ${platformName} video based on the photo metadata below.

RULES:
- Each caption: approximately 30 words (not counting hashtags).
- Emojis allowed where the tone specifies.
- Hashtags at the end, not counted in word limit.
- Reference specific details from metadata (food, places, animals, camera, time of day).
- Each caption must be a single line of text (no line breaks within a caption).

PHOTO METADATA:
${photoContext}

TONES:
${toneInstructions}`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const geminiBody = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: CAPTION_SCHEMA
    }
  });

  const response = await fetchJSON(geminiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(geminiBody)
    },
    body: geminiBody
  });

  // Extract the text from Gemini response
  const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    // Check for blocked/filtered responses
    const finishReason = response?.candidates?.[0]?.finishReason;
    const blockReason = response?.promptFeedback?.blockReason;
    throw new Error(`Empty Gemini response. finishReason=${finishReason}, blockReason=${blockReason}`);
  }

  console.log(`[Captions] Raw Gemini (${rawText.length} chars, first 300): ${JSON.stringify(rawText).slice(0, 300)}`);

  // Parse the response — handle multiple encoding scenarios
  const captions = parseGeminiJSON(rawText);

  // Merge with demo captions to fill any gaps
  const demoCaptions = generateDemoCaptions(items, platform);
  const merged = {};
  let aiCount = 0;
  for (const key of TONE_KEYS) {
    if (captions[key] && captions[key].trim().length > 10) {
      merged[key] = captions[key];
      aiCount++;
    } else {
      merged[key] = demoCaptions[key];
    }
  }

  const source = aiCount === 5 ? 'ai' : aiCount > 0 ? 'ai-partial' : 'fallback';
  console.log(`[Captions] ${source}: ${aiCount}/5 tones from Gemini`);
  return { captions: merged, tones: TONE_KEYS, source };
}

/**
 * Parse Gemini JSON response — handles:
 * 1. Clean JSON: {"engaging":"...", ...}
 * 2. Double-encoded: "{\"engaging\":\"...\", ...}"
 * 3. JSON with control characters (newlines/tabs inside strings)
 * 4. Partial/malformed JSON → regex extraction
 */
function parseGeminiJSON(rawText) {
  // Attempt 1: Direct parse after stripping ALL control characters
  // (Safe because our schema has only flat string values — no structural whitespace needed)
  try {
    const cleaned = rawText
      .replace(/```json\s*/g, '').replace(/```\s*/g, '')
      .replace(/[\x00-\x1F\x7F\u2028\u2029]/g, ' ')  // includes Unicode line separators
      .replace(/\s{2,}/g, ' ')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed.engaging) {
      console.log('[Captions] Parsed via direct JSON.parse');
      return parsed;
    }
    // If parsed is a string (double-encoded), unwrap it
    if (typeof parsed === 'string') {
      const inner = JSON.parse(parsed.replace(/[\x00-\x1F\x7F\u2028\u2029]/g, ' '));
      if (typeof inner === 'object' && inner.engaging) {
        console.log('[Captions] Parsed via double-decode');
        return inner;
      }
    }
  } catch (e) {
    console.warn('[Captions] Direct parse failed:', e.message);
  }

  // Attempt 2: Unescape \" and try again (handles escaped-quote encoding)
  try {
    const unescaped = rawText.replace(/\\"/g, '"').replace(/[\x00-\x1F\x7F\u2028\u2029]/g, ' ').replace(/\s{2,}/g, ' ');
    const parsed = JSON.parse(unescaped);
    if (typeof parsed === 'object' && parsed.engaging) {
      console.log('[Captions] Parsed via unescape + JSON.parse');
      return parsed;
    }
  } catch (e) {
    console.warn('[Captions] Unescape parse failed:', e.message);
  }

  // Attempt 3: Regex extraction — last resort
  // Normalize the text first
  const normalized = rawText
    .replace(/\\"/g, '"')
    .replace(/[\x00-\x1F\x7F\u2028\u2029]/g, ' ')
    .replace(/\s{2,}/g, ' ');

  const captions = {};
  for (let i = 0; i < TONE_KEYS.length; i++) {
    const key = TONE_KEYS[i];
    const nextKey = TONE_KEYS[i + 1];
    let pattern;
    if (nextKey) {
      // Match from this key to the next key
      pattern = new RegExp(`"${key}"\\s*:\\s*"(.*?)"\\s*,\\s*"${nextKey}"`);
    } else {
      // Last key — match to closing brace
      pattern = new RegExp(`"${key}"\\s*:\\s*"(.*?)"\\s*\\}`);
    }
    const match = normalized.match(pattern);
    if (match) {
      captions[key] = match[1].trim();
    }
  }

  const extracted = Object.keys(captions).filter(k => captions[k]);
  console.log(`[Captions] Regex extracted: ${extracted.join(', ') || 'none'}`);
  return captions;
}

function generateDemoCaptions(items, platform = 'reel') {
  const count = items.length;
  const s = count === 1 ? '' : 's';
  const filenames = items.map(it => it.filename || '').filter(f => f && !f.startsWith('Demo'));
  const hint = filenames.length > 0 ? filenames[0].replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ') : 'moments';
  const tag = platform === 'short' ? '#YouTubeShorts' : '#InstagramReels';

  return {
    engaging:      `✨ ${count} frame${s} of pure magic capturing ${hint} and so much more! Every second hits different. Which moment is your absolute favorite? Drop it below! 👇 ${tag} #PhotoMontage #ContentCreator #ViralContent`,
    professional:  `A carefully curated visual compilation of ${count} photograph${s} showcasing ${hint}. Each frame selected for composition and narrative impact within this cohesive short-form presentation. ${tag} #Photography #VisualStorytelling`,
    witty:         `POV: you picked ${count} photo${s} and now you are basically a film director. Someone get this person an award already. No big deal. 🎬 ${tag} #AccidentalFilmmaker #MainCharacterEnergy #ContentLife`,
    inspirational: `Every photograph holds a story waiting to be told. These ${count} moment${s} remind us that beauty exists in ${hint} and in the courage to capture it. ✨ ${tag} #LiveInspired #ChaseMoments`,
    storyteller:   `So I was going through my camera roll and found ${count === 1 ? 'this gem' : `these ${count} gems`}. Each one brought back a wave of memories — especially ${hint}. Had to share. 📸 ${tag} #BehindTheScenes #RealMoments`
  };
}

// ─── Video Generation ────────────────────────────────────────

app.post('/api/generate', async (req, res) => {
  const { items, photoDuration = 3 } = req.body;

  if (!items || !Array.isArray(items) || items.length < 1) {
    return res.status(400).json({ error: 'Select at least 1 item (2+ recommended)' });
  }
  if (items.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 items allowed' });
  }

  const jobId = crypto.randomUUID().slice(0, 8);
  const sessionId = req.headers['x-session-id'];

  jobs[jobId] = {
    status: 'starting',
    progress: 0,
    reelUrl: null,
    shortUrl: null,
    error: null,
    createdAt: Date.now()
  };

  res.json({ jobId });

  // Run async pipeline
  runGenerationPipeline(jobId, items, photoDuration, sessionId).catch(err => {
    console.error(`[Job ${jobId}] Pipeline error:`, err.message);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  });
});

app.get('/api/generate/:jobId', (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// ─── Generation Pipeline ─────────────────────────────────────

async function runGenerationPipeline(jobId, items, photoDuration, sessionId) {
  const jobDir = path.join(TMP_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  try {
    // Step 1: Download / generate input media
    jobs[jobId].status = 'Downloading media...';
    jobs[jobId].progress = 10;

    const hasMockItems = items.some(it => it.isMock !== false);
    let token = null;

    if (!hasMockItems && sessionId) {
      token = await getValidToken(sessionId);
    }

    let inputFiles;
    if (token && !hasMockItems) {
      inputFiles = await downloadRealMedia(items, token, jobDir, jobId);
    } else {
      inputFiles = await generateDemoImages(items, jobDir);
    }

    // Validate all input files exist and have content
    for (const f of inputFiles) {
      if (!fs.existsSync(f)) throw new Error(`Input file missing: ${path.basename(f)}`);
      const stat = fs.statSync(f);
      if (stat.size === 0) throw new Error(`Input file empty: ${path.basename(f)}`);
    }

    jobs[jobId].progress = 30;

    // Handle single item — duplicate it so xfade has a pair
    if (inputFiles.length === 1) {
      const ext = path.extname(inputFiles[0]);
      const dup = path.join(jobDir, `input_dup${ext}`);
      fs.copyFileSync(inputFiles[0], dup);
      inputFiles.push(dup);
    }

    // Step 2: Encode Reel (max 90s)
    const reelPath = path.join(OUT_DIR, `reel_${jobId}.mp4`);
    const reelArgs = buildStitchArgs(inputFiles, reelPath, {
      photoDuration,
      maxDuration: 90,
      transitionDuration: 0.5
    });

    const queuePos = ffmpegQueue.pending;
    jobs[jobId].status = queuePos > 0
      ? `Queued (position ${queuePos + 1})...`
      : 'Encoding Reel...';
    jobs[jobId].progress = 40;

    await ffmpegQueue.add(async () => {
      jobs[jobId].status = 'Encoding Reel...';
      jobs[jobId].progress = 50;
      const result = await runFFmpegSpawn(reelArgs, reelPath);
      console.log(`[Job ${jobId}] Reel done: ${result.size} bytes`);
    });

    jobs[jobId].progress = 70;

    // Step 3: Derive Short from Reel (stream copy, no re-encode)
    const shortPath = path.join(OUT_DIR, `short_${jobId}.mp4`);
    jobs[jobId].status = 'Creating Short...';
    jobs[jobId].progress = 80;

    const shortArgs = [
      '-i', reelPath,
      '-t', '60',
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y',
      shortPath
    ];

    await ffmpegQueue.add(async () => {
      const result = await runFFmpegSpawn(shortArgs, shortPath);
      console.log(`[Job ${jobId}] Short done: ${result.size} bytes`);
    });

    // Step 4: Validate outputs
    jobs[jobId].status = 'Validating...';
    jobs[jobId].progress = 90;

    const reelInfo = await validateVideo(reelPath);
    const shortInfo = await validateVideo(shortPath);

    if (!reelInfo.valid) throw new Error(`Reel validation failed: ${JSON.stringify(reelInfo)}`);
    if (!shortInfo.valid) throw new Error(`Short validation failed: ${JSON.stringify(shortInfo)}`);

    // Step 5: Done
    jobs[jobId].status = 'done';
    jobs[jobId].progress = 100;
    jobs[jobId].reelUrl = `/output/reel_${jobId}.mp4`;
    jobs[jobId].shortUrl = `/output/short_${jobId}.mp4`;
    jobs[jobId].reelInfo = reelInfo;
    jobs[jobId].shortInfo = shortInfo;

    console.log(`[Job ${jobId}] Complete — Reel: ${reelInfo.duration}s, Short: ${shortInfo.duration}s`);

  } catch (err) {
    console.error(`[Job ${jobId}] Failed:`, err.message);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  } finally {
    try { fs.rmSync(jobDir, { recursive: true, force: true }); } catch {}
  }
}

// ─── Download Real Media from Google Photos ──────────────────

async function downloadRealMedia(items, token, jobDir, jobId) {
  const inputFiles = [];

  // Re-fetch media items to get fresh baseUrls (they expire after ~1hr)
  const mediaIds = items.map(it => it.id);
  let freshItems = items;
  try {
    const batchResult = await fetchJSON('https://photoslibrary.googleapis.com/v1/mediaItems:batchGet?' +
      mediaIds.map(id => `mediaItemIds=${id}`).join('&'), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (batchResult.mediaItemResults) {
      freshItems = batchResult.mediaItemResults
        .filter(r => r.mediaItem)
        .map(r => r.mediaItem);
    }
  } catch (err) {
    console.warn(`[Job ${jobId}] Could not refresh baseUrls, using original:`, err.message);
  }

  for (let i = 0; i < freshItems.length; i++) {
    const item = freshItems[i];
    const isVideo = item.mimeType && item.mimeType.startsWith('video/');
    const ext = isVideo ? '.mp4' : '.jpg';
    const outFile = path.join(jobDir, `input_${i}${ext}`);

    jobs[jobId].status = `Downloading ${i + 1}/${freshItems.length}...`;

    if (isVideo) {
      const videoUrl = `${item.baseUrl}=dv`;
      await downloadFile(videoUrl, outFile);
      const trimmed = path.join(jobDir, `input_${i}_trimmed.mp4`);
      execSync(
        `ffmpeg -i "${outFile}" -t 3 -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black" -c:v libx264 -preset fast -crf 23 -r 30 -pix_fmt yuv420p -an -y "${trimmed}"`,
        { maxBuffer: 10 * 1024 * 1024 }
      );
      fs.renameSync(trimmed, outFile);
    } else {
      const photoUrl = `${item.baseUrl}=w1080-h1920`;
      await downloadFile(photoUrl, outFile);
    }

    inputFiles.push(outFile);
  }

  return inputFiles;
}

// ─── Generate Demo Images (colored rectangles) ──────────────

async function generateDemoImages(items, jobDir) {
  const colors = ['#FF6B35', '#E63946', '#457B9D', '#2A9D8F', '#E9C46A',
                  '#F4A261', '#264653', '#6A4C93', '#1982C4', '#8AC926'];
  const inputFiles = [];

  for (let i = 0; i < items.length; i++) {
    const color = colors[i % colors.length];
    const outFile = path.join(jobDir, `demo_${i}.jpg`);
    execSync(
      `ffmpeg -f lavfi -i "color=c=${color.replace('#', '0x')}:s=1080x1920:d=0.1" -frames:v 1 -y "${outFile}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );
    inputFiles.push(outFile);
  }

  return inputFiles;
}

// ─── FFmpeg Filter Chain Builder ─────────────────────────────

function buildStitchArgs(inputFiles, outputPath, {
  photoDuration = 3,
  maxDuration = 90,
  transitionDuration = 0.5
} = {}) {
  const n = inputFiles.length;
  const args = [];

  for (const f of inputFiles) {
    if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
      args.push('-loop', '1', '-t', String(photoDuration), '-i', f);
    } else {
      args.push('-i', f);
    }
  }

  const filters = [];

  // Normalize EVERY input: resolution, fps, pixel format, timebase
  for (let i = 0; i < n; i++) {
    filters.push(
      `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
      `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,` +
      `fps=30,` +
      `format=yuv420p,` +
      `settb=1/30` +
      `[v${i}]`
    );
  }

  // Chain xfade transitions
  if (n === 1) {
    filters.push('[v0]null[outv]');
  } else {
    let prevLabel = 'v0';
    for (let i = 1; i < n; i++) {
      const offset = (photoDuration * i) - (transitionDuration * i);
      const outLabel = i === n - 1 ? 'outv' : `xf${i}`;
      filters.push(
        `[${prevLabel}][v${i}]xfade=transition=fade:duration=${transitionDuration}:offset=${offset}[${outLabel}]`
      );
      prevLabel = outLabel;
    }
  }

  const filterComplex = filters.join(';');

  args.push(
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'stillimage',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-threads', '1',
    '-x264-params', 'rc-lookahead=10:ref=1:bframes=0',
    '-t', String(maxDuration),
    '-movflags', '+faststart',
    '-an',
    '-y',
    outputPath
  );

  return args;
}

// ─── FFmpeg Runner (spawn, no shell) ─────────────────────────

function runFFmpegSpawn(args, outputPath, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    console.log('[FFmpeg] spawn with', args.length, 'args → ', path.basename(outputPath));

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let lastProgress = '';

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length) lastProgress = lines[lines.length - 1].trim();
    });

    const timer = setTimeout(() => {
      console.error(`[FFmpeg] TIMEOUT after ${timeoutMs / 1000}s — killing`);
      proc.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s. Last: ${lastProgress}`));
    }, timeoutMs);

    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      const fileExists = fs.existsSync(outputPath);
      const fileSize = fileExists ? fs.statSync(outputPath).size : 0;

      console.log(`[FFmpeg] code=${code} signal=${signal} size=${fileSize}`);

      if (signal) {
        reject(new Error(
          `FFmpeg killed by ${signal} (likely out-of-memory). ` +
          `Try fewer photos or retry. Last: ${lastProgress}`
        ));
      } else if (code !== 0) {
        const tail = stderr.slice(-500);
        reject(new Error(`FFmpeg error (code ${code}): ${tail}`));
      } else if (fileSize === 0) {
        reject(new Error(
          `FFmpeg produced 0-byte output. Filter chain issue. ` +
          `stderr: ${stderr.slice(-500)}`
        ));
      } else {
        resolve({ size: fileSize, lastProgress });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`FFmpeg spawn failed: ${err.message}`));
    });
  });
}

// ─── Video Validator ─────────────────────────────────────────

async function validateVideo(filePath) {
  try {
    const raw = execSync(
      `ffprobe -v quiet -print_format json -show_streams -show_format "${filePath}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    ).toString();
    const data = JSON.parse(raw);
    const video = data.streams.find(s => s.codec_type === 'video');
    if (!video) return { valid: false, error: 'No video stream found' };

    const info = {
      codec: video.codec_name,
      width: parseInt(video.width),
      height: parseInt(video.height),
      fps: Math.round(eval(video.r_frame_rate)),
      pixFmt: video.pix_fmt,
      duration: parseFloat(data.format.duration),
      size: parseInt(data.format.size),
      valid: false
    };

    info.valid = (
      info.codec === 'h264' &&
      info.width === 1080 &&
      info.height === 1920 &&
      info.fps === 30 &&
      info.pixFmt === 'yuv420p' &&
      info.duration > 0 &&
      info.size > 0
    );

    return info;
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ─── HTTP Helpers ────────────────────────────────────────────

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const transport = urlObj.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    // Content-Length is required for some APIs (Gemini, Anthropic)
    if (options.body && !reqOptions.headers['Content-Length']) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = transport.request(reqOptions, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
          } else {
            resolve(json);
          }
        } catch {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          else resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const follow = (u, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const uObj = new URL(u);
      const t = uObj.protocol === 'https:' ? https : http;

      t.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        }
        const ws = fs.createWriteStream(destPath);
        res.pipe(ws);
        ws.on('finish', () => { ws.close(); resolve(destPath); });
        ws.on('error', reject);
      }).on('error', reject);
    };

    follow(url);
  });
}

// ─── Start Server ────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🎬 ReelMaker v2.4 — ${BASE_URL}`);
  console.log(`   FFmpeg queue: max 1 concurrent job`);
  console.log(`   OAuth: ${GOOGLE_CLIENT_ID ? 'configured' : 'demo mode only'}`);
  console.log(`   Captions: ${GEMINI_API_KEY ? 'Gemini AI' : 'demo mode (no GEMINI_API_KEY)'}`);
  console.log(`   Tmp: ${TMP_DIR}`);
  console.log(`   Output: ${OUT_DIR}\n`);
});

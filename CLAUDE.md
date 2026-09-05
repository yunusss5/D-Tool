# D Tool - Multi-Platform Downloader

A modern, polished multi-platform downloader for YouTube, Instagram, and Pinterest.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Runtime:** Node.js
- **Media engine:** yt-dlp (via Python) for YouTube, ffmpeg for muxing
- **Scraping:** cheerio, plus each platform's own public JSON endpoints

## Project Structure

```
D Tool/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   │   ├── fetch/        # Media info fetch endpoint (auto-detect)
│   │   ├── youtube/      # Platform-pinned info endpoint
│   │   ├── instagram/    # Platform-pinned info endpoint
│   │   ├── pinterest/    # Platform-pinned info endpoint
│   │   └── download/     # File download / mux endpoint
│   ├── youtube-downloader/ # YouTube downloader page
│   ├── instagram-downloader/ # Instagram downloader page
│   ├── pinterest-downloader/ # Pinterest downloader page
│   ├── how-to-use/       # How to use guide
│   ├── faq/             # FAQ page
│   ├── privacy-policy/   # Privacy policy
│   ├── terms-of-service/ # Terms of service
│   ├── contact/         # Contact page
│   ├── dmca/            # DMCA policy
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Homepage
│   └── globals.css      # Global styles
├── components/
│   ├── providers/       # Context providers (Theme)
│   ├── layout/          # Header, Footer
│   ├── home/            # Homepage sections
│   └── download/        # Download form component
├── lib/                 # Extractors and shared utilities
│   ├── extractors/      # youtube.ts, instagram.ts, pinterest.ts, index.ts
│   ├── ytdlp.ts         # yt-dlp / ffmpeg process plumbing
│   ├── media.ts         # Shared types, URL builders, formatters
│   ├── http.ts          # fetchWithTimeout and friends
│   ├── platform-route.ts # Shared handler for the per-platform endpoints
│   └── rate-limit.ts    # In-memory sliding window
├── public/              # Static assets
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

## Runtime Requirements

The YouTube path shells out to yt-dlp; merged (video+audio) downloads also need
ffmpeg. Both must be present on the machine running the server:

```bash
python -m pip install -U yt-dlp
ffmpeg -version
```

Optional environment overrides when they are not on `PATH`:

| Variable | Purpose |
| --- | --- |
| `YTDLP_PATH` | Path to a `yt-dlp` executable |
| `PYTHON_PATH` | Python interpreter used for `python -m yt_dlp` |
| `FFMPEG_PATH` | Path to `ffmpeg` |

Without ffmpeg the app still works: it falls back to progressive streams and
offers clearly labelled video-only files for the heights YouTube no longer
serves with sound. Without yt-dlp, YouTube returns a plain-language error while
Instagram and Pinterest keep working.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

## Features

- ✅ YouTube video/audio download — 144p to 4K, real file-size estimates, m4a/webm audio
- ✅ Instagram Reels/Posts/Carousels download (public content, logged out)
- ✅ Pinterest Pins/Idea pins/Carousels download
- ✅ Dark/Light mode toggle
- ✅ Mobile responsive design
- ✅ Platform auto-detection
- ✅ Multiple format options
- ✅ Rate limiting (20 requests/min per IP, in-memory sliding window)
- ✅ Clean, modern UI

## API Endpoints

- `POST /api/fetch` — `{ url, platform? }` → `MediaInfo`; auto-detects the platform
- `POST /api/youtube` · `/api/instagram` · `/api/pinterest` — same payload, platform pinned
- `GET /api/download` — two modes:
  - `?url=<media>&filename=<name>&referer=<origin>` proxies a CDN file (host allowlist, Range passthrough)
  - `?src=yt&id=<videoId>&v=<fmt>[&a=<fmt>]&filename=<name>` re-resolves a YouTube format at click time and, when `a` is present, muxes video+audio through ffmpeg to a single MP4/WebM stream

## Notes

- YouTube URLs are signed and expire, so the client only ever receives format
  ids. `/api/download` re-resolves them through a 5-minute in-process cache,
  which also means a stale tab still downloads correctly.
- Instagram's logged-out GraphQL endpoint needs a real session cookie, the
  page's LSD token and browser-shaped `Sec-Fetch-*` headers; the extractor
  performs that handshake and caches the session for 10 minutes. The payload
  carries no duration field, so reel length is read from the signed `efg` blob.
- The download proxy enforces an SSRF host allowlist and rejects non-http(s)
  schemes. Only public content is reachable — private accounts and secret
  boards return a plain-language error by design.
- Deferred from the original plan: per-format SEO sub-pages, blog, monetization
  and CDN configuration.


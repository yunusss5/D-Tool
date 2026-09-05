# D Tool - Multi-Platform Downloader

A modern, polished multi-platform downloader for YouTube, Instagram, Pinterest,
TikTok and X (Twitter).

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Runtime:** Node.js
- **Media engine:** InnerTube over plain `fetch` for YouTube (yt-dlp only as an
  optional local fallback), `ffmpeg-static` for muxing
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
│   │   ├── tiktok/       # Platform-pinned info endpoint
│   │   ├── twitter/      # Platform-pinned info endpoint (X)
│   │   └── download/     # File download / mux endpoint
│   ├── youtube-downloader/ # YouTube downloader page
│   ├── instagram-downloader/ # Instagram downloader page
│   ├── pinterest-downloader/ # Pinterest downloader page
│   ├── tiktok-downloader/ # TikTok downloader page
│   ├── x-downloader/     # X (Twitter) downloader page
│   ├── how-to-use/       # How to use guide
│   ├── faq/             # FAQ page
│   ├── privacy-policy/   # Privacy policy
│   ├── terms-of-service/ # Terms of service
│   ├── contact/         # Contact page
│   ├── dmca/            # DMCA policy
│   ├── sitemap.ts       # Generated sitemap.xml
│   ├── robots.ts        # Generated robots.txt
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Homepage
│   └── globals.css      # Global styles
├── components/
│   ├── providers/       # Context providers (Theme)
│   ├── layout/          # Header, Footer
│   ├── home/            # Homepage sections
│   └── download/        # Download form component
├── lib/                 # Extractors and shared utilities
│   ├── extractors/      # youtube.ts, instagram.ts, pinterest.ts, tiktok.ts, twitter.ts, index.ts
│   ├── youtube-innertube.ts # InnerTube player client (no binaries)
│   ├── ytdlp.ts         # yt-dlp / ffmpeg process plumbing
│   ├── allowed-hosts.ts # SSRF allowlist, per-host Referer and range rules
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

Nothing has to be installed on the server. YouTube is resolved through InnerTube
over `fetch`, and muxing uses the `ffmpeg` binary that ships inside the
`ffmpeg-static` package, so the app runs as-is on Vercel and other serverless
hosts. `npm install` is the whole setup.

`ffmpeg-static` sits in `optionalDependencies` so a failed binary download never
breaks the install. Optional environment overrides:

| Variable | Purpose |
| --- | --- |
| `FFMPEG_PATH` | Path to an `ffmpeg` binary, used ahead of `ffmpeg-static` |
| `YTDLP_PATH` | Path to a `yt-dlp` executable (optional fallback engine) |
| `PYTHON_PATH` | Python interpreter used for `python -m yt_dlp` |

If ffmpeg cannot be resolved at all, YouTube degrades rather than breaks: it
offers progressive streams plus clearly labelled video-only files. yt-dlp is
consulted only when InnerTube returns nothing usable, and its absence is normal.

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

- ✅ YouTube video/audio download — 144p to 4K, every option muxed to one file with sound
- ✅ Instagram Reels/Posts/Carousels download (public content, logged out)
- ✅ Pinterest Pins/Idea pins/Carousels download
- ✅ TikTok videos without a watermark, and photo posts slide by slide
- ✅ X (Twitter) videos, GIFs and photos at the best variant the post carries
- ✅ Dark/Light mode toggle
- ✅ Mobile responsive design
- ✅ Platform auto-detection
- ✅ Multiple format options with real byte sizes
- ✅ Rate limiting (20 info requests/min and 40 downloads/min per IP, in-memory sliding window)
- ✅ Clean, modern UI

## API Endpoints

- `POST /api/fetch` — `{ url, platform? }` → `MediaInfo`; auto-detects the platform
- `POST /api/youtube` · `/api/instagram` · `/api/pinterest` · `/api/tiktok` ·
  `/api/twitter` — same payload, platform pinned
- `GET /api/download` — two modes:
  - `?url=<media>&filename=<name>&ref=<origin>` proxies a CDN file (host allowlist, Range passthrough)
  - `?src=yt&id=<videoId>&v=<fmt>[&a=<fmt>]&filename=<name>` re-resolves a YouTube format at click time and, when `a` is present, muxes video+audio through ffmpeg to a single MP4/WebM stream

## Notes

### YouTube

- `lib/youtube-innertube.ts` calls the InnerTube player endpoint directly. Client
  choice is the whole trick and it turns on proof-of-origin (PO) tokens:
  - `WEB`/`MWEB` refuse an anonymous server outright ("Sign in to confirm you're
    not a bot").
  - `IOS` answers, but yt-dlp's own table marks its GVS PO token *required*, and
    without one its media URLs serve exactly the first **1,048,576 bytes** and
    then 403 forever, at any offset, on a freshly minted URL — measured on 7 of
    10 sampled videos. It now also tends to return `signatureCipher` rather than
    a plain URL, which this module deliberately cannot use.
  - **`VISIONOS` (client id 101) is the primary.** It needs neither a PO token
    nor YouTube's player JavaScript, and served whole files on every video
    sampled. `ANDROID_VR` is the second ungated client and the only one that
    still returns a progressive (single-file) stream.
  - Clients are asked in parallel and ungated ones rank first, so a capped URL
    can never displace a good one for the same itag.
- **A visitor id is mandatory.** Without one, VISIONOS answers the first request
  and `LOGIN_REQUIRED` for every request after it. It comes from
  `/youtubei/v1/visitor_id` and is cached for 6 hours.
- Some uploads (certain "made for kids" videos) are `UNPLAYABLE` on every ungated
  client; they surface as a plain-language error rather than a download that dies
  part-way.
- YouTube URLs are signed and expire, so the client only ever receives format
  ids. `/api/download` re-resolves them through a 5-minute in-process cache,
  which also means a stale tab still downloads correctly.

### Downloading

- **googlevideo paces a single connection at roughly playback speed** after a
  short initial burst, so a whole-file read is unusably slow: itag 136
  (26 MB) took 110 s as one read and 8.8 s as sequential 4 MiB ranged windows.
  `/api/download` therefore walks googlevideo files in ranged windows, shrinking
  from 4 MiB toward 256 KiB when an edge refuses the width and re-signing the URL
  when shrinking is not enough. Every window resumes at the exact byte reached,
  so the output is byte-exact.
- Muxing feeds video to `ffmpeg -i pipe:0` and stages the (much smaller) audio
  track to the temp directory, because ffmpeg must seek the audio to interleave
  it. Output uses `frag_keyframe+empty_moov+default_base_moof` so the response
  streams instead of buffering.
- **Never send an empty `Referer`.** `video.twimg.com` serves the file with no
  Referer header at all, or with any non-empty value, and answers 403 to
  `Referer:` with an empty value. `mediaHeaders` omits the header entirely when
  no referer applies.
- The download proxy enforces an SSRF host allowlist and rejects non-http(s)
  schemes. Only public content is reachable — private accounts and secret
  boards return a plain-language error by design.

### Other platforms

- Instagram's logged-out GraphQL endpoint needs a real session cookie, the
  page's LSD token and browser-shaped `Sec-Fetch-*` headers; the extractor
  performs that handshake and caches the session for 10 minutes. The payload
  carries no duration field, so reel length is read from the signed `efg` blob.
- **TikTok blocks some networks and regions outright**, including the network
  this was developed on, so `/api/tiktok` can only be verified from a permitted
  network. The extractor and its error copy handle that case explicitly.
- Deferred from the original plan: per-format SEO sub-pages, blog, monetization
  and CDN configuration.


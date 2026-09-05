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
| `YT_VISITOR_DATA` | A visitor id minted on a network YouTube trusts, used instead of minting one |
| `YT_COOKIE` | A signed-in `Cookie` header; the SAPISIDHASH signature is derived from it |
| `YT_PROXY` | HTTP(S) proxy for `youtube.com` and `googlevideo.com` traffic only |
| `YT_API_KEY` | Key for the third-party YouTube resolver; optional, it also answers keyless |
| `YT_API_HOST` | Resolver hostname, if your dashboard shows one other than `p.savenow.to` |

The last three exist for one situation, described under
[Deploying to a datacenter](#deploying-to-a-datacenter). None of them is needed
on a host YouTube already trusts, and `.env.example` explains how to obtain each.

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
- `GET /api/youtube?id=<videoId>` — per-client InnerTube diagnostics for the host
  that serves it (see [Deploying to a datacenter](#deploying-to-a-datacenter))
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
  - Nothing else anonymous is worth adding: `TVHTML5`, `TVHTML5_SIMPLY_EMBEDDED_PLAYER`,
    `WEB_EMBEDDED_PLAYER`, `WEB_CREATOR`, `IOS_MUSIC` and `IOS_UNPLUGGED` were all
    measured returning `UNPLAYABLE`/`ERROR`/`LOGIN_REQUIRED` with zero formats.
- **A visitor id is mandatory.** Without one, VISIONOS answers the first request
  and `LOGIN_REQUIRED` for every request after it. It comes from
  `/youtubei/v1/visitor_id` and is cached for 6 hours. A failed mint is **never**
  cached: caching one poisons a warm lambda for the whole TTL, which looks exactly
  like a permanent bot challenge. If minting is refused, an id is generated
  locally instead (protobuf `{1: <11 chars>, 5: <unix seconds>}`, base64url —
  InnerTube accepts it), and a round that still comes back empty is retried once
  against a rotated id.
- Some uploads (certain "made for kids" videos) are `UNPLAYABLE` on every ungated
  client; they surface as a plain-language error rather than a download that dies
  part-way.
- YouTube URLs are signed and expire, so the client only ever receives format
  ids. `/api/download` re-resolves them through a 5-minute in-process cache,
  which also means a stale tab still downloads correctly.
- **The last answer that resolved is kept for 90 minutes as a fallback.** A
  challenge arrives in bursts, so on a distrusted host the request *after* a
  success is often the one refused — which would break the click on a listing
  that had just loaded. Signatures outlive that window by hours, so a failed
  resolve replays the remembered answer instead of erroring. Re-resolution is
  still attempted on every call, and `refresh: true` (the mid-transfer repair)
  never accepts the fallback, since replaying the URL it distrusts is the one
  thing that cannot help it.

### Deploying to a datacenter

Everything above is about *which client* to ask. Whether YouTube answers at all
also depends on *where the request comes from*, and that is not something the code
can choose: reputation is scored per IP, every serverless host is a datacenter
address, and Google challenges those far more readily than a home connection. The
symptom is `/api/fetch` returning **503 "YouTube is challenging this server right
now"** in production while the identical build works locally. It is not a
regression — it is the address.

`GET /api/youtube?id=<videoId>` answers the only question worth asking first: what
does *this* host actually get back? It reports each client's `playabilityStatus`,
how many formats it offered, and whether its largest URL reads past the 1 MiB
proof-of-origin wall. Statuses and counts only — no media URLs, no credentials.

```bash
curl -s 'https://<your-app>/api/youtube?id=dQw4w9WgXcQ'
```

What the code does about it, with no configuration:

- **A failed visitor mint is never cached.** Caching `undefined` for six hours is
  how one blocked request at a cold start takes a whole deployment down until the
  instance recycles. There is also always *some* identity — a locally generated
  one (protobuf `{1: <11 chars>, 5: <ts>}`, base64url) is accepted by InnerTube
  and beats having none.
- **A refusal is retried under a fresh identity.** The decision to challenge is
  made against the pair (address, visitor id) and only the address is fixed, so
  the whole round runs again with a new id before anything is reported. A verdict
  a new identity cannot change — private, removed, members-only, age-gated — is
  returned immediately instead.
- **Gated clients are probed before use.** `ANDROID` and `IOS` may answer when the
  ungated pair is challenged, but their URLs can stop at 1 MiB. One ranged request
  two bytes past the wall decides whether their formats are offered at all, so a
  challenged host degrades to fewer options rather than to downloads that die a
  megabyte in.

**Measured on this deployment (Vercel, 2026-09-05), so nobody has to re-derive
it.** Every combination was probed from the running function and all of them came
back `Sign in to confirm you're not a bot`: both front doors
(`www.youtube.com/youtubei/v1/player` and `youtubei.googleapis.com/…?key=`), all
four clients (VISIONOS, ANDROID_VR, ANDROID, TVHTML5), and all three identities —
minted on the host, **minted on a residential connection and hardcoded**, and
omitted entirely. Two regions behaved identically (`iad1`, then `bom1`). The
conclusions worth keeping:

- **It is the address, not the request.** No client, front door, header set or
  identity provenance changes the verdict, so `YT_VISITOR_DATA` cannot rescue a
  challenged deployment — a trusted id does not launder an untrusted IP. That
  leaves `YT_COOKIE` (an account YouTube already trusts) and `YT_PROXY` (a
  different address), and nothing else.
- **Identity rotation is not a lever.** Four strategies — one id shared across
  clients, a fresh id per client, one id reused across six sequential asks, and a
  new id per ask — returned `LOGIN_REQUIRED` **22 times out of 22**.
- **The egress pool is tiny and all of it is blocked.** The function leaves from
  `15.206.153.191` and `13.206.202.223`; 24 samples across the two were
  `LOGIN_REQUIRED` **24/24**. There is no lucky address to retry into.
- **A valid proof-of-origin token does not lift it.** This was the last code-level
  lever, so it was built and measured rather than assumed: BotGuard runs fine on
  Vercel (`bgutils-js` + `jsdom`, token minted at 168 chars in 1.2 s), and sending
  it as `serviceIntegrityDimensions.poToken` still returned `LOGIN_REQUIRED` for
  both VISIONOS and `WEB`. The same code on a residential address mints the same
  token and gets `OK` with 23 formats — the token was never the missing piece. The
  implementation was reverted afterwards: two dependencies and a BotGuard VM for
  zero measured benefit is not worth carrying.
- **A browser-side handshake is impossible.** Offloading the player call to the
  visitor's own (residential) address would sidestep everything above, but
  InnerTube answers **403** to any request carrying a foreign `Origin`, and
  `Origin` is a header browsers refuse to let JavaScript set.
- **Region hopping is not the lever it looks like.** Vercel functions egress from
  cloud ranges wherever they run, and Google challenges the range, not the city.
  `vercel.json` pins `bom1` for latency, not for reputation.
- **Public resolvers are not a fallback here.** Invidious, Piped and cobalt were
  swept twice, from each project's own instance list: `api.invidious.io` now
  publishes only Yggdrasil (`.ygg`) hosts, and the Piped and cobalt lists are
  unreachable from the function. Zero working instances for all three. There is no
  credential-free third party left to lean on for YouTube — unlike TikTok, where
  one does still work.

If a host is challenged persistently, the env vars are the way out, in increasing
order of effort: `YT_COOKIE` (a signed-in cookie — reliable, but ties downloads to
that account, so use a throwaway), `YT_PROXY` (moves both the handshake and the
media reads off the host's address; the most reliable). `YT_VISITOR_DATA` only
helps a host that is *intermittently* challenged, since it saves the mint round
trip; per the measurement above it does not lift a standing block. Running the app
somewhere with a residential address — a home machine behind a tunnel — works
without any of them, which is why the whole ladder resolves locally.

### The YouTube resolver of last resort

Because that ladder all needs an operator, there is one rung below it that needs
nobody: when InnerTube (and yt-dlp, if present) fail with a *transport* verdict —
502, 503, 504, i.e. "this address was refused" — `lib/extractors/youtube.ts` hands
the video to `lib/youtube-api.ts`, which asks a third-party resolver
(`video-download-api.com`, API host `p.savenow.to`) to prepare the file on an
address Google does trust. Only transport failures fall through; a verdict about
the video itself (private, removed, members-only, live) travels with the video, so
asking somebody else cannot help and is not attempted.

What is different about this path, and why the code looks the way it does:

- **It is a job API, not a format list.** Submit `?format=<key>&url=<watch url>`,
  poll `?id=` until `progress == 1000`, then stream the `download_url` it returns.
  So sizes cannot be known before the job runs and the listing shows none — an
  honest blank rather than a guess — and the fixed menu (2160p/1440p/1080p/720p/
  480p/360p, m4a, mp3) replaces the itag-derived one.
- **Audio is merged upstream.** This path needs no ffmpeg and never offers a
  silent video file. Its format ids are prefixed `api-` so they can never collide
  with an itag.
- **Metadata comes from oEmbed, not the resolver.** `youtube.com/oembed` is public
  and answers fine from a datacenter, so title/channel/thumbnail cost one cheap
  request instead of starting a job just to print a title. oEmbed carries no
  duration, so listings on this path show none.
- **The key is optional and failure-soft.** `YT_API_KEY` is sent when set, but a
  refusal from the keyed tier — an exhausted balance being the likely one — is
  retried anonymously rather than reported, because the free tier serves the same
  files, just slower and rate-limited. Verified end to end: keyed attempt logged
  `Not enough balance`, the keyless retry returned 17,584,186 bytes of 480p MP4.
- **It is somebody else's upstream.** The second one in this codebase, after
  `tikwm.com` for TikTok. If YouTube downloads break on a deployment that relies
  on this path, check whether the resolver is still up before anything else.

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
- **TikTok's own two doors are shut to servers, so there is a third.** Measured
  from a home connection and from the Vercel function, identically: the app hosts
  (`api22-normal-c-useast2a.tiktokv.com` and friends) answer `200` with a
  zero-byte body, and the web page returns a 106 KB shell with no
  `__UNIVERSAL_DATA_FOR_REHYDRATION__`, no `playAddr` and no `Set-Cookie` — even
  `/api/item/detail/` serves that same HTML shell instead of JSON. Hydration now
  needs an `msToken` minted by TikTok's own JavaScript, which a serverless
  function cannot produce. `lib/extractors/tiktok.ts` therefore falls back to the
  public `tikwm.com` resolver, which returns watermark-free URLs with exact byte
  lengths; verified end to end (6,644,830 and 7,200,869 byte MP4s through
  `/api/download`). It is asked only after the first two layers fail, and it is
  the one upstream in this codebase that belongs to somebody else — if TikTok
  downloads ever break, check whether that resolver is still up before anything
  else. Only `play`/`hdplay` are offered, never `wmplay`: a watermarked file under
  a "no watermark" label would be worse than no option at all.
- TikTok reports the long edge as `height` (portrait video is 1080×1920), so
  quality labels use the short edge — "1080p", not "1920p".
- Deferred from the original plan: per-format SEO sub-pages, blog, monetization
  and CDN configuration.


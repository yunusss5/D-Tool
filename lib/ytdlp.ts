/**
 * yt-dlp / ffmpeg process plumbing.
 *
 * YouTube stopped serving single-file "progressive" streams for most uploads,
 * and the signature/throttling maths behind the adaptive ones changes every few
 * weeks. yt-dlp tracks those changes; we shell out to it for metadata and let
 * ffmpeg mux the video + audio streams back together on the way to the client.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { Readable } from 'node:stream';
import { ExtractError } from './media';

export interface YtDlpFormat {
  format_id: string;
  url?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  tbr?: number | null;
  vbr?: number | null;
  abr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  format_note?: string;
  protocol?: string;
  language?: string | null;
}

export interface YtDlpInfo {
  id?: string;
  title?: string;
  description?: string;
  thumbnail?: string;
  duration?: number | null;
  view_count?: number | null;
  uploader?: string;
  channel?: string;
  uploader_id?: string;
  extractor?: string;
  webpage_url?: string;
  is_live?: boolean;
  live_status?: string;
  ext?: string;
  url?: string;
  formats?: YtDlpFormat[];
}

/** How yt-dlp is launched: an executable plus any fixed leading arguments. */
interface Launcher {
  file: string;
  prefix: string[];
}

interface RunResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

const COMMON_ARGS = [
  '--ignore-config',
  '--no-playlist',
  '--no-progress',
  '--no-warnings',
  '--no-call-home',
  '--socket-timeout',
  '20',
  '--retries',
  '3',
];

function launcherCandidates(): Launcher[] {
  const list: Launcher[] = [];
  const explicit = process.env.YTDLP_PATH?.trim();
  if (explicit) list.push({ file: explicit, prefix: [] });

  list.push({ file: 'yt-dlp', prefix: [] });

  const python = process.env.PYTHON_PATH?.trim();
  if (python) list.push({ file: python, prefix: ['-m', 'yt_dlp'] });

  for (const py of ['python', 'py', 'python3']) {
    list.push({ file: py, prefix: ['-m', 'yt_dlp'] });
  }
  return list;
}

/** Run a command to completion, capturing stdout as bytes. Never uses a shell. */
function run(file: string, args: string[], timeoutMs: number, maxBytes = 64 << 20): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      reject(error);
      return;
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      stderr += '\n[timed out]';
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 8000) stderr += chunk.toString();
    });

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

let launcherLookup: Promise<Launcher | null> | undefined;

/** First launcher that answers `--version`, cached for the life of the process. */
export function resolveYtDlp(): Promise<Launcher | null> {
  launcherLookup ??= (async () => {
    for (const candidate of launcherCandidates()) {
      try {
        const result = await run(candidate.file, [...candidate.prefix, '--version'], 20_000);
        if (result.code === 0 && result.stdout.length > 0) return candidate;
      } catch {
        /* try the next candidate */
      }
    }
    return null;
  })();
  return launcherLookup;
}

export async function ytDlpVersion(): Promise<string | null> {
  const launcher = await resolveYtDlp();
  if (!launcher) return null;
  const result = await run(launcher.file, [...launcher.prefix, '--version'], 20_000);
  return result.code === 0 ? result.stdout.toString().trim() : null;
}

let ffmpegLookup: Promise<string | null> | undefined;

/** Does this path actually run? */
async function ffmpegRuns(file: string): Promise<boolean> {
  try {
    const result = await run(file, ['-hide_banner', '-version'], 20_000);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * The `ffmpeg-static` package, when it is installed.
 *
 * It is an optional dependency precisely because it is a ~78 MB platform binary:
 * on a serverless host it is the only way to get ffmpeg at all, and on a laptop
 * that already has ffmpeg on PATH it is dead weight. Resolving it by path rather
 * than by `require` keeps the bundler out of the decision entirely.
 */
function bundledCandidates(): string[] {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return [
    join(process.cwd(), 'node_modules', 'ffmpeg-static', exe),
    // Vercel runs the function from a nested directory when the project is a
    // monorepo package; the traced copy then sits one level up.
    join(process.cwd(), '..', 'node_modules', 'ffmpeg-static', exe),
  ];
}

/**
 * A traced copy can arrive without its executable bit (zip round-trips lose it,
 * and /var/task is read-only so it cannot be restored in place). Staging the
 * binary in the writable temp directory costs one copy per cold start.
 */
async function stageExecutable(source: string): Promise<string | null> {
  try {
    await chmod(source, 0o755);
    if (await ffmpegRuns(source)) return source;
  } catch {
    /* read-only filesystem: fall through to the temp copy */
  }

  const staged = join(tmpdir(), basename(source));
  try {
    if (!existsSync(staged)) await copyFile(source, staged);
    await chmod(staged, 0o755);
  } catch {
    return null;
  }
  return (await ffmpegRuns(staged)) ? staged : null;
}

/** Path to a usable ffmpeg, or null. Needed to mux video-only + audio-only. */
export function resolveFfmpeg(): Promise<string | null> {
  ffmpegLookup ??= (async () => {
    for (const file of [process.env.FFMPEG_PATH?.trim(), 'ffmpeg'].filter(Boolean) as string[]) {
      if (await ffmpegRuns(file)) return file;
    }

    for (const candidate of bundledCandidates()) {
      if (!existsSync(candidate)) continue;
      if (await ffmpegRuns(candidate)) return candidate;
      const staged = await stageExecutable(candidate);
      if (staged) return staged;
    }

    return null;
  })();
  return ffmpegLookup;
}

/** Map yt-dlp's stderr onto something a visitor can act on. */
function describeFailure(stderr: string): ExtractError {
  const text = stderr.toLowerCase();

  if (text.includes('private video') || text.includes('this video is private')) {
    return new ExtractError('That video is private, so it cannot be downloaded.', 403);
  }
  if (text.includes('confirm your age') || text.includes('age-restricted')) {
    return new ExtractError(
      'That video is age-restricted and needs a signed-in YouTube session, which this tool does not use.',
      403
    );
  }
  if (text.includes("not a bot") || text.includes('failed to extract any player response')) {
    return new ExtractError(
      'YouTube is refusing requests from this server. Try again in a minute — if it keeps failing, this server’s address is blocked, not the video.',
      503
    );
  }
  if (text.includes('members-only') || text.includes('join this channel')) {
    return new ExtractError('That video is members-only, so it cannot be downloaded.', 403);
  }
  if (/video (?:is |isn't |is no longer |was )?(?:un)?available/.test(text) || text.includes('removed by the uploader')) {
    return new ExtractError('That video is unavailable — it may have been removed or made private.', 404);
  }
  if (text.includes('http error 429') || text.includes('too many requests')) {
    return new ExtractError('The site is rate-limiting this server. Try again in a minute.', 429);
  }
  if (text.includes('unsupported url')) {
    return new ExtractError('That link is not one this downloader understands.', 400);
  }
  if (text.includes('is not a valid url') || text.includes('unable to download webpage')) {
    return new ExtractError('That link could not be opened. Check it and try again.', 400);
  }
  if (text.includes('[timed out]')) {
    return new ExtractError('The site took too long to answer. Please try again.', 504);
  }

  // Nothing matched: surface yt-dlp's own line, minus the "[youtube] <id>:"
  // bookkeeping prefix that means nothing to a visitor.
  const firstError = stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('ERROR:'))
    ?.replace(/^ERROR:\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[A-Za-z0-9_-]{6,15}:\s*/, '')
    .trim();
  return new ExtractError(
    firstError?.slice(0, 180) || 'The media could not be read from that link.',
    502
  );
}

export function ytDlpMissingError(): ExtractError {
  return new ExtractError(
    'The YouTube engine (yt-dlp) is not installed on this server. Run "pip install -U yt-dlp", or set YTDLP_PATH to the binary.',
    503
  );
}

/** Full metadata for a single URL, as yt-dlp's `--dump-single-json`. */
export async function dumpInfo(url: string, extraArgs: string[] = []): Promise<YtDlpInfo> {
  const launcher = await resolveYtDlp();
  if (!launcher) throw ytDlpMissingError();

  const args = [
    ...launcher.prefix,
    ...COMMON_ARGS,
    '--dump-single-json',
    ...extraArgs,
    '--',
    url,
  ];

  let result: RunResult;
  try {
    result = await run(launcher.file, args, 90_000);
  } catch {
    throw ytDlpMissingError();
  }

  if (result.code !== 0 || result.stdout.length === 0) {
    throw describeFailure(result.stderr);
  }

  try {
    return JSON.parse(result.stdout.toString('utf8')) as YtDlpInfo;
  } catch {
    throw new ExtractError('The media details came back in a form we could not read.', 502);
  }
}

export interface PipedProcess {
  /** Node readable carrying the muxed bytes. */
  stdout: NodeJS.ReadableStream;
  /** Resolves once the child exits; rejects with stderr on a non-zero exit. */
  done: Promise<void>;
  kill: () => void;
}

/**
 * Mux a video-only and an audio-only stream into a fragmented MP4/WebM on
 * stdout. Fragmented output is what makes it streamable: no moov atom has to be
 * written at the end, so bytes reach the browser immediately.
 *
 * Neither input is a URL, and that is deliberate. googlevideo hands a single
 * connection a short fast burst and then paces it at roughly playback speed
 * (~240 KiB/s measured on a 720p stream), so letting ffmpeg open the streams
 * itself made a 26 MB download take minutes. The caller fetches both through a
 * ranged-window reader instead — an order of magnitude faster — and passes the
 * video in on stdin. The audio comes from a file so that ffmpeg can seek it,
 * which is what lets it line the two streams up.
 */
export async function muxToStdout(
  video: Readable,
  audioFile: string,
  container: 'mp4' | 'webm'
): Promise<PipedProcess> {
  const ffmpeg = await resolveFfmpeg();
  if (!ffmpeg) {
    throw new ExtractError(
      'ffmpeg is not installed on this server, so video and audio cannot be combined. Download the video and audio options separately, or install ffmpeg.',
      503
    );
  }

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-i',
    audioFile,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c',
    'copy',
  ];

  if (container === 'mp4') {
    args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4');
  } else {
    args.push('-f', 'webm');
  }
  args.push('pipe:1');

  return spawnPiped(ffmpeg, args, video);
}

/** Spawn a child and hand back its stdout plus a completion promise. */
export function spawnPiped(file: string, args: string[], stdin?: Readable): PipedProcess {
  // Two spawn calls rather than a computed stdio array: it keeps the tuple
  // literal, which is what tells TypeScript stdout and stderr are really there.
  const child = stdin
    ? spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    : spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

  if (stdin && child.stdin) {
    // ffmpeg closes stdin the moment it has what it needs, which surfaces here
    // as EPIPE. That is a normal end to the transfer, not a failure.
    child.stdin.on('error', () => stdin.destroy());
    stdin.pipe(child.stdin);
  }

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < 4000) stderr += chunk.toString();
  });

  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(stderr.trim() || `${file} exited with code ${code}`));
    });
  });

  return {
    stdout: child.stdout,
    done,
    kill: () => {
      stdin?.destroy();
      if (!child.killed) child.kill();
    },
  };
}

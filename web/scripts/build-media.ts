// Make smaller copies of the museum's images: media/w<width>/<file>, and
// data/media.json listing which exist. Uses `sips` (macOS) or `vipsthumbnail`
// (libvips, installed in the Docker build); without either, it writes an
// empty manifest and the museum serves the originals.
// Usage: node scripts/build-media.ts <media-dir> <manifest.json>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WIDTHS = [480, 960, 1600];

/**
 * Scans with obvious scanner margins and colour bars, cropped for display:
 * [top, right, bottom, left] as fractions of the image. Content keeps the
 * original; only the served copy is cropped.
 */
const CROPS: Record<string, [number, number, number, number]> = {
  'phillis-wheatley.jpg': [0.08, 0.13, 0.08, 0.145],
};
const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: build-media.ts <media-dir> <manifest.json>');
  process.exit(2);
}

const has = (cmd: string) => {
  try {
    execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
const tool = has('sips') ? 'sips' : has('vipsthumbnail') ? 'vips' : null;
// WebP copies: cwebp (libwebp) where present, else vips can write them.
const webp = has('cwebp') ? 'cwebp' : has('vipsthumbnail') ? 'vips' : null;

function toWebp(src: string): string | undefined {
  const dst = src.replace(/\.(jpe?g|png)$/i, '.webp');
  if (existsSync(dst) && statSync(dst).mtimeMs >= statSync(src).mtimeMs) return dst;
  try {
    if (webp === 'cwebp') execFileSync('cwebp', ['-quiet', '-q', '74', src, '-o', dst], { stdio: 'ignore' });
    else if (webp === 'vips') execFileSync('vips', ['copy', src, `${dst}[Q=74]`], { stdio: 'ignore' });
    else return undefined;
    return dst;
  } catch {
    return undefined;
  }
}

function crop(file: string, c: [number, number, number, number]): void {
  const w = width(file);
  const hgt = (() => {
    try {
      if (tool === 'sips') return Number(execFileSync('sips', ['-g', 'pixelHeight', file]).toString().match(/pixelHeight:\s*(\d+)/)?.[1]);
      return Number(execFileSync('vipsheader', ['-f', 'height', file]).toString().trim());
    } catch {
      return 0;
    }
  })();
  if (!w || !hgt) return;
  const [t, r, b, l] = c;
  const cw = Math.round(w * (1 - l - r));
  const ch = Math.round(hgt * (1 - t - b));
  const x = Math.round(w * l);
  const y = Math.round(hgt * t);
  if (tool === 'sips') execFileSync('sips', ['--cropToHeightWidth', String(ch), String(cw), '--cropOffset', String(y), String(x), file], { stdio: 'ignore' });
  else execFileSync('vips', ['crop', file, `${file}.tmp.jpg`, String(x), String(y), String(cw), String(ch)], { stdio: 'ignore' }), execFileSync('mv', [`${file}.tmp.jpg`, file]);
}

function width(file: string): number | undefined {
  try {
    if (tool === 'sips') return Number(execFileSync('sips', ['-g', 'pixelWidth', file]).toString().match(/pixelWidth:\s*(\d+)/)?.[1]);
    if (tool === 'vips') return Number(execFileSync('vipsheader', ['-f', 'width', file]).toString().trim());
  } catch {
    /* unreadable: skip */
  }
  return undefined;
}

function resize(src: string, dst: string, w: number): void {
  if (tool === 'sips') execFileSync('sips', ['-Z', String(w), '-s', 'formatOptions', '72', src, '--out', dst], { stdio: 'ignore' });
  else execFileSync('vipsthumbnail', [src, '--size', `${w}x`, '-o', `${dst}[Q=72,strip]`], { stdio: 'ignore' });
}

const files: Record<string, number[]> = {};
const sizes: Record<string, number> = {};
const webps: string[] = [];
if (tool) {
  for (const f of readdirSync(dir)) {
    const src = join(dir, f);
    if (!/\.(jpe?g|png)$/i.test(f) || !statSync(src).isFile()) continue;
    if (CROPS[f]) crop(src, CROPS[f]);
    const w0 = width(src);
    if (!w0) continue;
    sizes[f] = w0;
    for (const w of WIDTHS) {
      if (w >= w0 * 0.9) break; // never upscale, and skip near-duplicates
      const dstDir = join(dir, `w${w}`);
      const dst = join(dstDir, f);
      mkdirSync(dstDir, { recursive: true });
      if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) resize(src, dst, w);
      (files[f] ??= []).push(w);
    }
    // WebP for the original and every smaller copy, or none at all.
    const all = [src, ...(files[f] ?? []).map((w) => join(dir, `w${w}`, f))];
    if (webp && all.every((p) => toWebp(p))) webps.push(f);
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ widths: WIDTHS, files, sizes, webp: webps }));
console.log(`media variants: ${tool ?? 'none (no sips or vipsthumbnail)'}, ${Object.keys(files).length} images, ${webps.length} with WebP`);

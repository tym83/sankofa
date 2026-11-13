// Make smaller copies of the museum's images: media/w<width>/<file>, and
// data/media.json listing which exist. Uses `sips` (macOS) or `vipsthumbnail`
// (libvips, installed in the Docker build); without either, it writes an
// empty manifest and the museum serves the originals.
// Usage: node scripts/build-media.ts <media-dir> <manifest.json>
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WIDTHS = [480, 960, 1600];
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
if (tool) {
  for (const f of readdirSync(dir)) {
    const src = join(dir, f);
    if (!/\.(jpe?g|png)$/i.test(f) || !statSync(src).isFile()) continue;
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
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ widths: WIDTHS, files, sizes }));
console.log(`media variants: ${tool ?? 'none (no sips or vipsthumbnail)'}, ${Object.keys(files).length} images`);

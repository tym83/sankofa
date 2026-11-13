// Smaller copies of images, made at build time (scripts/build-data.sh writes
// media/w<width>/<file> and data/media.json). Without them, the originals.
import type { App } from '../app';

interface Manifest {
  /** file → widths of the variants that exist, ascending */
  files?: Record<string, number[]>;
  /** file → width of the original */
  sizes?: Record<string, number>;
}

let variants: Record<string, number[]> = {};
let sizes: Record<string, number> = {};

export async function loadMediaManifest(): Promise<void> {
  try {
    const r = await fetch('data/media.json');
    if (!r.ok) return;
    const m = (await r.json()) as Manifest;
    variants = m.files ?? {};
    sizes = m.sizes ?? {};
  } catch {
    /* no variants: the originals are used */
  }
}

/** For tests. */
export function setVariants(v: Record<string, number[]>, s: Record<string, number> = {}): void {
  variants = v;
  sizes = s;
}

/** Width of the original, when the build measured it. */
export function naturalWidth(file: string): number | undefined {
  return sizes[file];
}

/**
 * src and srcset for an image: the smallest variant that covers `want[0]` as
 * src, every variant plus the original in srcset. Never larger than the
 * source, so nothing is upscaled by us.
 */
export function mediaSrc(app: Pick<App, 'media'>, file: string, want: number[] = [960]): { src: string; srcset?: string } {
  const have = variants[file] ?? [];
  const orig = app.media(file);
  if (!have.length) return { src: orig };
  const pickW = have.find((w) => w >= want[0]) ?? have[have.length - 1];
  const origW = sizes[file] ?? have[have.length - 1] * 2;
  const srcset = [...have.map((w) => `media/w${w}/${file} ${w}w`), `${orig} ${origW}w`].join(', ');
  return { src: `media/w${pickW}/${file}`, srcset };
}

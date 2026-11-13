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

/**
 * A picture that is never an empty frame: a small copy shows first, softly
 * blurred, and the full one replaces it once loaded. `ready` resolves when
 * something is on screen. With `near`, loading starts only when the element
 * comes within a few screens.
 */
export function progressive(
  app: Pick<App, 'media'>,
  file: string,
  opts: { want?: number; sizes?: string; alt?: string; cls?: string; near?: boolean } = {},
): { img: HTMLImageElement; ready: Promise<void> } {
  const img = document.createElement('img');
  img.alt = opts.alt ?? '';
  img.decoding = 'async';
  if (opts.cls) img.className = opts.cls;
  const small = variants[file]?.[0];
  const full = mediaSrc(app, file, [opts.want ?? 960]);
  let resolve!: () => void;
  const ready = new Promise<void>((r) => (resolve = r));
  const start = () => {
    if (small && full.srcset) {
      img.classList.add('lq');
      img.src = `media/w${small}/${file}`;
      img.decode().then(resolve, resolve);
      const hi = new Image();
      hi.decoding = 'async';
      if (opts.sizes) hi.sizes = opts.sizes;
      hi.srcset = full.srcset;
      hi.src = full.src;
      hi.decode().then(
        () => {
          if (opts.sizes) img.sizes = opts.sizes;
          img.srcset = full.srcset!;
          img.src = full.src;
          img.classList.remove('lq');
        },
        () => img.classList.remove('lq'),
      );
    } else {
      img.src = full.src;
      img.decode().then(resolve, resolve);
    }
  };
  if (opts.near && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        start();
      },
      { rootMargin: '250% 0px' },
    );
    queueMicrotask(() => io.observe(img));
  } else start();
  return { img, ready };
}

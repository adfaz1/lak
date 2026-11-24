// Reading a picture the merchant picks (logo, favicon, banner) in the browser: an object URL is decoded, then redrawn
// smaller on a canvas and kept as a data URL in the session media store. Nothing is uploaded anywhere (simulated host).
import { mediaStore, type MediaItem } from './state';

export const MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml';
export type MediaError = 'type' | 'size' | 'read' | 'small';
export type MediaNote = 'cropped' | 'wide';
/** Largest size kept per use: a logo stays sharp at twice its header height, a favicon is square, banners fit a wide screen. */
const BOX: Record<MediaItem['kind'], { w: number; h: number; min: number }> = { logo: { w: 640, h: 200, min: 48 }, favicon: { w: 64, h: 64, min: 16 }, image: { w: 1600, h: 1000, min: 400 } };

export function checkFile(f: { type: string; size: number }): MediaError | null {
  if (!ACCEPT.split(',').includes(f.type)) return 'type';
  if (f.size > MAX_BYTES) return 'size';
  return null;
}

function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('decode')); };
    img.src = url;
  });
}

export async function readImage(file: File, kind: MediaItem['kind']): Promise<{ ok: true; ref: string; item: MediaItem; note: MediaNote | null } | { ok: false; error: MediaError }> {
  const bad = checkFile(file);
  if (bad) return { ok: false, error: bad };
  let img: HTMLImageElement;
  try { img = await decode(file); } catch { return { ok: false, error: 'read' }; }
  const sw = img.naturalWidth || 512;
  const sh = img.naturalHeight || 512;
  const box = BOX[kind];
  if (Math.max(sw, sh) < box.min) return { ok: false, error: 'small' };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, error: 'read' };
  let note: MediaNote | null = null;
  if (kind === 'favicon') {
    // Centre-crop to a square: browser tabs show icons square.
    const side = Math.min(sw, sh);
    if (sw !== sh) note = 'cropped';
    canvas.width = canvas.height = box.w;
    ctx.drawImage(img, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, box.w, box.h);
  } else {
    const k = Math.min(1, box.w / sw, box.h / sh);
    canvas.width = Math.round(sw * k);
    canvas.height = Math.round(sh * k);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (kind === 'logo' && sw / sh > 5) note = 'wide';
  }
  let url: string;
  try { url = kind === 'image' ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png'); } catch { return { ok: false, error: 'read' }; }
  const id = `${kind[0]}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const item: MediaItem = { url, name: file.name.slice(0, 80), w: canvas.width, h: canvas.height, kind, at: Date.now() };
  mediaStore.set((m) => ({ ...m, [id]: item }));
  return { ok: true, ref: `m:${id}`, item, note };
}

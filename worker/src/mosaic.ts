import {
  initPhoton,
  PhotonImage,
  SamplingFilter,
  resize,
  crop,
  watermark,
} from '@cf-wasm/photon';
import { LIMITS } from './constants';

const W = LIMITS.MOSAIC_CELL_W; // 600
const H = LIMITS.MOSAIC_CELL_H; // 400

interface Cell { x: number; y: number; w: number; h: number }
interface Layout { canvasW: number; canvasH: number; cells: Cell[] }

/**
 * Layout table for 2–7 images.
 *
 *  2        [1][2]                    1200×400
 *  3        [BIG][2] / [BIG][3]       1200×800  big=600×800, sm=600×400
 *  4        [1][2]  / [3][4]          1200×800  2×2
 *  5        [BIG][2][3] / [BIG][4][5] 1200×800  big=600×800, sm=300×400
 *  6        [1][2][3] / [4][5][6]     1200×800  3×2 (400×400 cells)
 *  7        [BIG][2][3]/[4][5]/[6][7] 1200×1200 big=600×1200, sm=300×400
 */
function getLayout(n: number): Layout {
  switch (n) {
    case 2:
      return {
        canvasW: 2 * W, canvasH: H,
        cells: [
          { x: 0, y: 0, w: W, h: H },
          { x: W, y: 0, w: W, h: H },
        ],
      };
    case 3:
      return {
        canvasW: 2 * W, canvasH: 2 * H,
        cells: [
          { x: 0, y: 0, w: W, h: 2 * H },     // big left
          { x: W, y: 0, w: W, h: H },           // small top-right
          { x: W, y: H, w: W, h: H },           // small bot-right
        ],
      };
    case 4:
      return {
        canvasW: 2 * W, canvasH: 2 * H,
        cells: [
          { x: 0, y: 0, w: W, h: H },
          { x: W, y: 0, w: W, h: H },
          { x: 0, y: H, w: W, h: H },
          { x: W, y: H, w: W, h: H },
        ],
      };
    case 5: {
      const sw = W / 2; // 300
      return {
        canvasW: 2 * W, canvasH: 2 * H,
        cells: [
          { x: 0,       y: 0, w: W,  h: 2 * H }, // big left
          { x: W,       y: 0, w: sw, h: H },       // sm top-left
          { x: W + sw,  y: 0, w: sw, h: H },       // sm top-right
          { x: W,       y: H, w: sw, h: H },       // sm bot-left
          { x: W + sw,  y: H, w: sw, h: H },       // sm bot-right
        ],
      };
    }
    case 6: {
      const cw = Math.round(2 * W / 3); // 400
      return {
        canvasW: 2 * W, canvasH: 2 * H,
        cells: Array.from({ length: 6 }, (_, i) => ({
          x: (i % 3) * cw,
          y: Math.floor(i / 3) * H,
          w: cw,
          h: H,
        })),
      };
    }
    default: {
      // 7 (or more, capped): big left full-height + 2×3 small right
      const sw = W / 2; // 300
      return {
        canvasW: 2 * W, canvasH: 3 * H,
        cells: [
          { x: 0, y: 0, w: W, h: 3 * H },                   // big 600×1200
          ...Array.from({ length: 6 }, (_, i) => ({
            x: W + (i % 2) * sw,
            y: Math.floor(i / 2) * H,
            w: sw,
            h: H,
          })),
        ],
      };
    }
  }
}

/** Canvas dimensions for n images — used by callers that need to know the size upfront. */
export function getMosaicDimensions(n: number): { width: number; height: number } {
  const l = getLayout(Math.min(Math.max(n, 2), LIMITS.MAX_MOSAIC_IMAGES));
  return { width: l.canvasW, height: l.canvasH };
}

/**
 * Create a blank white PhotonImage.
 * Raw pixels are RGBA (4 bytes per pixel), white = 255,255,255,255.
 */
function createWhiteCanvas(width: number, height: number): PhotonImage {
  const pixels = new Uint8Array(width * height * 4).fill(255);
  return new PhotonImage(pixels, width, height);
}

/**
 * Fetch raw image bytes from a URL.
 * Returns null on any network or body-read failure.
 */
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Decode raw bytes into a PhotonImage.
 * Falls back to a white placeholder cell if the WASM JPEG decoder panics.
 */
function decodeOrPlaceholder(bytes: Uint8Array | null, w: number, h: number): PhotonImage {
  if (bytes !== null) {
    try {
      return PhotonImage.new_from_byteslice(bytes);
    } catch {
      // WASM decode failure — fall through to placeholder
    }
  }
  return createWhiteCanvas(w, h);
}

/**
 * Resize an image to cover a target cell using center-crop (no squishing).
 * Scale is chosen so the image fills the cell in both dimensions, then
 * the excess is cropped from the center.
 */
function coverCrop(img: PhotonImage, targetW: number, targetH: number): PhotonImage {
  const srcW = img.get_width();
  const srcH = img.get_height();
  if (srcW === 0 || srcH === 0) return createWhiteCanvas(targetW, targetH);
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = Math.ceil(srcW * scale);
  const scaledH = Math.ceil(srcH * scale);
  const scaled = resize(img, scaledW, scaledH, SamplingFilter.Lanczos3);
  try {
    const x1 = Math.floor((scaledW - targetW) / 2);
    const y1 = Math.floor((scaledH - targetH) / 2);
    return crop(scaled, x1, y1, x1 + targetW, y1 + targetH);
  } finally {
    scaled.free();
  }
}

/**
 * Composite up to MAX_MOSAIC_IMAGES image URLs into a grid and return JPEG bytes.
 */
export async function buildMosaic(urls: string[]): Promise<Uint8Array> {
  await initPhoton.ensure();

  const capped = urls.slice(0, LIMITS.MAX_MOSAIC_IMAGES);
  const layout = getLayout(capped.length);

  // Fetch all images in parallel.
  const allBytes = await Promise.all(capped.map(fetchImageBytes));
  const images = allBytes.map((b, i) =>
    decodeOrPlaceholder(b, layout.cells[i]!.w, layout.cells[i]!.h)
  );

  // Track images not yet freed so we can clean up on early throw.
  const toFree = new Set<PhotonImage>(images);
  let canvas: PhotonImage | null = null;

  try {
    canvas = createWhiteCanvas(layout.canvasW, layout.canvasH);

    for (let i = 0; i < images.length; i++) {
      const src = images[i]!;
      const { x, y, w, h } = layout.cells[i]!;
      const cell = coverCrop(src, w, h);
      toFree.add(cell);
      watermark(canvas, cell, BigInt(x), BigInt(y));
      cell.free();
      toFree.delete(cell);
      src.free();
      toFree.delete(src);
    }

    const result = canvas.get_bytes_jpeg(85);
    canvas.free();
    return result;
  } catch (err) {
    for (const img of toFree) try { img.free(); } catch { /* ignore double-free */ }
    if (canvas) try { canvas.free(); } catch { /* ignore */ }
    throw err;
  }
}

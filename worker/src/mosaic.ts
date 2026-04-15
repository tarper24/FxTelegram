import {
  initPhoton,
  PhotonImage,
  SamplingFilter,
  resize,
  crop,
  watermark,
} from '@cf-wasm/photon';
import { LIMITS } from './constants';

const CELL_W = LIMITS.MOSAIC_CELL_W; // 600

export interface ImageInput { url: string; width: number; height: number }
interface Cell { x: number; y: number; w: number; h: number }
interface Layout { canvasW: number; canvasH: number; cells: Cell[] }

/**
 * Optimal row height for a set of images at a given cell width.
 *
 * Each image's "natural" height at cellW pixels wide is cellW * imgH / imgW.
 * We take the median of those naturals and clamp to [cellW/2, 2*cellW] so no
 * row is narrower than 2:1 landscape or taller than 1:2 portrait.
 * Falls back to MOSAIC_CELL_H when no image has valid dimensions.
 */
function rowHeight(
  images: Pick<ImageInput, 'width' | 'height'>[],
  cellW: number,
): number {
  const naturals = images
    .filter(i => i.width > 0 && i.height > 0)
    .map(i => Math.round(cellW * i.height / i.width))
    .sort((a, b) => a - b);

  if (naturals.length === 0) return LIMITS.MOSAIC_CELL_H;
  const median = naturals[Math.floor(naturals.length / 2)]!;
  return Math.max(Math.round(cellW / 2), Math.min(cellW * 2, median));
}

/**
 * Layout table for 2–7 images.
 * Row heights adapt to the actual images in each row at each row's cell width.
 *
 *  2   [1][2]                     each 600px wide
 *  3   [BIG][2] / [BIG][3]        big=600×totalH, sm=600×rowH
 *  4   [1][2]  / [3][4]           2×2, per-row heights
 *  5   [BIG][2][3] / [BIG][4][5]  big=600×totalH, sm=300×rowH
 *  6   [1][2][3] / [4][5][6]      3×2, 400px wide cells, per-row heights
 *  7+  [BIG][2][3]/[4][5]/[6][7]  big=600×totalH, sm=300×rowH, 3 rows
 */
function getLayout(images: Pick<ImageInput, 'width' | 'height'>[]): Layout {
  const n = images.length;
  const W = CELL_W;
  const canvasW = 2 * W; // always 1200

  switch (n) {
    case 2: {
      const h = rowHeight(images, W);
      return {
        canvasW, canvasH: h,
        cells: [
          { x: 0, y: 0, w: W, h },
          { x: W, y: 0, w: W, h },
        ],
      };
    }

    case 3: {
      // Right-side images determine row heights; big image cover-crops to fill.
      const h0 = rowHeight([images[1]!], W);
      const h1 = rowHeight([images[2]!], W);
      const totalH = h0 + h1;
      return {
        canvasW, canvasH: totalH,
        cells: [
          { x: 0, y: 0,  w: W, h: totalH }, // big left
          { x: W, y: 0,  w: W, h: h0 },
          { x: W, y: h0, w: W, h: h1 },
        ],
      };
    }

    case 4: {
      const h0 = rowHeight(images.slice(0, 2), W);
      const h1 = rowHeight(images.slice(2, 4), W);
      return {
        canvasW, canvasH: h0 + h1,
        cells: [
          { x: 0, y: 0,  w: W, h: h0 },
          { x: W, y: 0,  w: W, h: h0 },
          { x: 0, y: h0, w: W, h: h1 },
          { x: W, y: h0, w: W, h: h1 },
        ],
      };
    }

    case 5: {
      const sw = W / 2; // 300
      const h0 = rowHeight([images[1]!, images[2]!], sw);
      const h1 = rowHeight([images[3]!, images[4]!], sw);
      const totalH = h0 + h1;
      return {
        canvasW, canvasH: totalH,
        cells: [
          { x: 0,      y: 0,  w: W,  h: totalH }, // big left
          { x: W,      y: 0,  w: sw, h: h0 },
          { x: W + sw, y: 0,  w: sw, h: h0 },
          { x: W,      y: h0, w: sw, h: h1 },
          { x: W + sw, y: h0, w: sw, h: h1 },
        ],
      };
    }

    case 6: {
      const cw = Math.round(2 * W / 3); // 400
      const h0 = rowHeight(images.slice(0, 3), cw);
      const h1 = rowHeight(images.slice(3, 6), cw);
      return {
        canvasW, canvasH: h0 + h1,
        cells: [
          { x: 0,       y: 0,  w: cw, h: h0 },
          { x: cw,      y: 0,  w: cw, h: h0 },
          { x: 2 * cw,  y: 0,  w: cw, h: h0 },
          { x: 0,       y: h0, w: cw, h: h1 },
          { x: cw,      y: h0, w: cw, h: h1 },
          { x: 2 * cw,  y: h0, w: cw, h: h1 },
        ],
      };
    }

    default: { // 7+: big left (full height) + 2×3 right
      const sw = W / 2; // 300
      const h0 = rowHeight([images[1]!, images[2]!], sw);
      const h1 = rowHeight([images[3]!, images[4]!], sw);
      const h2 = rowHeight([images[5]!, images[6]!], sw);
      const totalH = h0 + h1 + h2;
      return {
        canvasW, canvasH: totalH,
        cells: [
          { x: 0,      y: 0,           w: W,  h: totalH }, // big left
          { x: W,      y: 0,           w: sw, h: h0 },
          { x: W + sw, y: 0,           w: sw, h: h0 },
          { x: W,      y: h0,          w: sw, h: h1 },
          { x: W + sw, y: h0,          w: sw, h: h1 },
          { x: W,      y: h0 + h1,     w: sw, h: h2 },
          { x: W + sw, y: h0 + h1,     w: sw, h: h2 },
        ],
      };
    }
  }
}

/** Canvas dimensions for n images — for callers that need size before building. */
export function getMosaicDimensions(
  images: Pick<ImageInput, 'width' | 'height'>[],
): { width: number; height: number } {
  const l = getLayout(images.slice(0, LIMITS.MAX_MOSAIC_IMAGES));
  return { width: l.canvasW, height: l.canvasH };
}

// ── Photon helpers ──────────────────────────────────────────────────────────

function createWhiteCanvas(w: number, h: number): PhotonImage {
  return new PhotonImage(new Uint8Array(w * h * 4).fill(255), w, h);
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await (await fetch(url)).arrayBuffer());
  } catch {
    return null;
  }
}

function decodeOrPlaceholder(bytes: Uint8Array | null, w: number, h: number): PhotonImage {
  if (bytes !== null) {
    try { return PhotonImage.new_from_byteslice(bytes); } catch { /* fall through */ }
  }
  return createWhiteCanvas(w, h);
}

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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Composite up to MAX_MOSAIC_IMAGES images into a layout-aware mosaic.
 *
 * Each row's height is derived from the median natural height of images in
 * that row at that row's cell width, so mixed portrait/landscape albums
 * crop each image as little as possible.
 */
export async function buildMosaic(images: ImageInput[]): Promise<Uint8Array> {
  await initPhoton.ensure();

  const capped = images.slice(0, LIMITS.MAX_MOSAIC_IMAGES);
  const layout = getLayout(capped);

  const allBytes = await Promise.all(capped.map(i => fetchImageBytes(i.url)));
  const decoded = allBytes.map((b, i) =>
    decodeOrPlaceholder(b, layout.cells[i]!.w, layout.cells[i]!.h)
  );

  const toFree = new Set<PhotonImage>(decoded);
  let canvas: PhotonImage | null = null;

  try {
    canvas = createWhiteCanvas(layout.canvasW, layout.canvasH);

    for (let i = 0; i < decoded.length; i++) {
      const src = decoded[i]!;
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
    for (const img of toFree) try { img.free(); } catch { /* ignore */ }
    if (canvas) try { canvas.free(); } catch { /* ignore */ }
    throw err;
  }
}

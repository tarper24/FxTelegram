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

interface ImageInput { url: string; width: number; height: number }
interface Cell { x: number; y: number; w: number; h: number }
interface Layout { canvasW: number; canvasH: number; cells: Cell[] }

/**
 * Compute cell height from the median aspect ratio of the source images.
 * Falls back to LIMITS.MOSAIC_CELL_H (400) when no valid dimensions exist.
 * Result is clamped so cells are never more extreme than 2:1 in either direction.
 */
function computeCellHeight(images: Pick<ImageInput, 'width' | 'height'>[]): number {
  const aspects = images
    .filter(i => i.width > 0 && i.height > 0)
    .map(i => i.width / i.height)
    .sort((a, b) => a - b);

  if (aspects.length === 0) return LIMITS.MOSAIC_CELL_H;

  const median = aspects[Math.floor(aspects.length / 2)]!;
  // Clamp: [0.5 = 1:2 portrait … 2.0 = 2:1 landscape]
  const clamped = Math.max(0.5, Math.min(2.0, median));
  return Math.round(CELL_W / clamped);
}

/**
 * Layout table for 2–7 images. All heights are multiples of cellH.
 *
 *  2        [1][2]                        canvasW×cellH
 *  3        [BIG][2] / [BIG][3]           canvasW×(2*cellH)  big=W×2H, sm=W×H
 *  4        [1][2]   / [3][4]             canvasW×(2*cellH)  2×2
 *  5        [BIG][2][3] / [BIG][4][5]     canvasW×(2*cellH)  big=W×2H, sm=(W/2)×H
 *  6        [1][2][3] / [4][5][6]         canvasW×(2*cellH)  3×2  ((2W/3)×H cells)
 *  7+       [BIG][2][3]/[4][5]/[6][7]     canvasW×(3*cellH)  big=W×3H, sm=(W/2)×H
 */
function getLayout(n: number, cellH: number): Layout {
  const W = CELL_W;
  const H = cellH;
  const canvasW = 2 * W; // always 1200

  switch (n) {
    case 2:
      return {
        canvasW, canvasH: H,
        cells: [
          { x: 0, y: 0, w: W, h: H },
          { x: W, y: 0, w: W, h: H },
        ],
      };
    case 3:
      return {
        canvasW, canvasH: 2 * H,
        cells: [
          { x: 0, y: 0, w: W, h: 2 * H },     // big left
          { x: W, y: 0, w: W, h: H },           // small top-right
          { x: W, y: H, w: W, h: H },           // small bot-right
        ],
      };
    case 4:
      return {
        canvasW, canvasH: 2 * H,
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
        canvasW, canvasH: 2 * H,
        cells: [
          { x: 0,      y: 0, w: W,  h: 2 * H }, // big left
          { x: W,      y: 0, w: sw, h: H },
          { x: W + sw, y: 0, w: sw, h: H },
          { x: W,      y: H, w: sw, h: H },
          { x: W + sw, y: H, w: sw, h: H },
        ],
      };
    }
    case 6: {
      const cw = Math.round(2 * W / 3); // 400
      return {
        canvasW, canvasH: 2 * H,
        cells: Array.from({ length: 6 }, (_, i) => ({
          x: (i % 3) * cw,
          y: Math.floor(i / 3) * H,
          w: cw,
          h: H,
        })),
      };
    }
    default: { // 7+: big left full-height + 2×3 small right
      const sw = W / 2; // 300
      return {
        canvasW, canvasH: 3 * H,
        cells: [
          { x: 0, y: 0, w: W, h: 3 * H },
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

/** Canvas dimensions for n images at the given source aspect ratios. */
export function getMosaicDimensions(
  images: Pick<ImageInput, 'width' | 'height'>[],
): { width: number; height: number } {
  const capped = images.slice(0, LIMITS.MAX_MOSAIC_IMAGES);
  const cellH = computeCellHeight(capped);
  const l = getLayout(capped.length, cellH);
  return { width: l.canvasW, height: l.canvasH };
}

// ── Photon helpers ──────────────────────────────────────────────────────────

function createWhiteCanvas(width: number, height: number): PhotonImage {
  return new PhotonImage(new Uint8Array(width * height * 4).fill(255), width, height);
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

/**
 * Resize an image to cover a target cell via center-crop (no squishing).
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

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Composite up to MAX_MOSAIC_IMAGES images into a layout-aware mosaic.
 * Cell height is derived from the median aspect ratio of the source images
 * so portrait albums render as portrait cells and landscape as landscape.
 */
export async function buildMosaic(images: ImageInput[]): Promise<Uint8Array> {
  await initPhoton.ensure();

  const capped = images.slice(0, LIMITS.MAX_MOSAIC_IMAGES);
  const cellH = computeCellHeight(capped);
  const layout = getLayout(capped.length, cellH);

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

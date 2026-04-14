import {
  initPhoton,
  PhotonImage,
  SamplingFilter,
  resize,
  watermark,
} from '@cf-wasm/photon';
import { LIMITS } from './constants';

const CELL_W = LIMITS.MOSAIC_CELL_W; // 600
const CELL_H = LIMITS.MOSAIC_CELL_H; // 400

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
 * Falls back to a white placeholder cell if the WASM JPEG decoder panics
 * (RuntimeError: unreachable on corrupt or incomplete images).
 */
function decodeOrPlaceholder(bytes: Uint8Array | null): PhotonImage {
  if (bytes !== null) {
    try {
      return PhotonImage.new_from_byteslice(bytes);
    } catch {
      // WASM decode failure — fall through to placeholder
    }
  }
  return createWhiteCanvas(CELL_W, CELL_H);
}

/**
 * Composite up to MAX_MOSAIC_IMAGES image URLs into a grid and return JPEG bytes.
 *
 * Layout:
 *   1–2 images → 1 row × 2 cols  (1200 × 400)
 *   3–4 images → 2 rows × 2 cols (1200 × 800)
 */
export async function buildMosaic(urls: string[]): Promise<Uint8Array> {
  await initPhoton.ensure();

  const capped = urls.slice(0, LIMITS.MAX_MOSAIC_IMAGES);
  const count = capped.length;

  const rows = count <= 2 ? 1 : 2;
  const canvasW = 2 * CELL_W;
  const canvasH = rows * CELL_H;

  // Fetch all images in parallel for production performance.
  const allBytes = await Promise.all(capped.map(fetchImageBytes));
  const images = allBytes.map(decodeOrPlaceholder);

  // Track images not yet freed so we can clean up if resize/watermark throws.
  const pendingFree: PhotonImage[] = [...images];
  let canvas: PhotonImage | null = null;

  try {
    canvas = createWhiteCanvas(canvasW, canvasH);

    for (let i = 0; i < images.length; i++) {
      const cell = resize(images[i]!, CELL_W, CELL_H, SamplingFilter.Lanczos3);
      const col = i % 2;
      const row = Math.floor(i / 2);
      watermark(canvas, cell, BigInt(col * CELL_W), BigInt(row * CELL_H));
      cell.free();
      images[i]!.free();
      pendingFree.shift(); // successfully freed — remove from head
    }

    const result = canvas.get_bytes_jpeg(85);
    canvas.free();
    return result;
  } catch (err) {
    // Free any images not yet freed due to early throw.
    for (const img of pendingFree) {
      try { img.free(); } catch { /* ignore double-free */ }
    }
    if (canvas) {
      try { canvas.free(); } catch { /* ignore */ }
    }
    throw err;
  }
}

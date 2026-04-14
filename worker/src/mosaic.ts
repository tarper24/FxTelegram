import {
  initPhoton,
  PhotonImage,
  SamplingFilter,
  resize,
  watermark,
} from '@cf-wasm/photon';
import { LIMITS } from './constants';

const MAX_MOSAIC_IMAGES = 4;
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
 * Fetch image bytes from a URL and decode into a PhotonImage.
 * Falls back to a white placeholder cell on any failure:
 *   - Network/body-read errors
 *   - WASM JPEG decoder panics (RuntimeError: unreachable on corrupt images)
 */
async function fetchPhotonImage(url: string): Promise<PhotonImage> {
  try {
    const response = await fetch(url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return PhotonImage.new_from_byteslice(bytes);
  } catch {
    return createWhiteCanvas(CELL_W, CELL_H);
  }
}

/**
 * Composite up to 4 image URLs into a mosaic grid and return JPEG bytes.
 *
 * Layout:
 *   1–2 images → 1 row × 2 cols  (1200 × 400)
 *   3–4 images → 2 rows × 2 cols (1200 × 800)
 */
export async function buildMosaic(urls: string[]): Promise<Uint8Array> {
  await initPhoton.ensure();

  const capped = urls.slice(0, MAX_MOSAIC_IMAGES);
  const count = capped.length;

  const cols = 2;
  const rows = count <= 2 ? 1 : 2;
  const canvasW = cols * CELL_W;
  const canvasH = rows * CELL_H;

  const canvas = createWhiteCanvas(canvasW, canvasH);

  // Fetch sequentially to avoid body-already-read errors when a shared mock
  // Response is returned (test environment) or CDN rate-limits concurrency.
  const images: PhotonImage[] = [];
  for (const url of capped) {
    images.push(await fetchPhotonImage(url));
  }

  for (let i = 0; i < images.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * CELL_W;
    const y = row * CELL_H;

    const cell = resize(images[i], CELL_W, CELL_H, SamplingFilter.Lanczos3);
    watermark(canvas, cell, BigInt(x), BigInt(y));
    cell.free();
    images[i].free();
  }

  const jpeg = canvas.get_bytes_jpeg(85);
  canvas.free();
  return jpeg;
}

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMosaic, getMosaicDimensions } from '../src/mosaic';

afterEach(() => vi.restoreAllMocks());

// 1×1 white JPEG as a minimal valid image fixture
const TINY_JPEG = new Uint8Array([
  0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,
  0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,
  0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,
  0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,
  0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,
  0x24,0x2e,0x27,0x20,0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,
  0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,0x39,0x3d,0x38,0x32,
  0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,
  0x01,0x05,0x01,0x01,0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,
  0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,
  0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7d,
  0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,
  0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,
  0x23,0x42,0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,
  0x82,0xff,0xda,0x00,0x08,0x01,0x01,0x00,0x00,0x3f,0x00,0xfb,
  0xd4,0xff,0xd9,
]);

function mockImageFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(TINY_JPEG.slice(), {
        headers: { 'Content-Type': 'image/jpeg' },
      }))
    )
  );
}

/** Build a minimal ImageInput array for testing — dimensions default to 1280×720 (landscape). */
function imgs(
  count: number,
  w = 1280,
  h = 720,
): { url: string; width: number; height: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://cdn.tg/${String.fromCharCode(97 + i)}.jpg`,
    width: w,
    height: h,
  }));
}

describe('buildMosaic', () => {
  it('returns a non-empty Uint8Array for 2 images', async () => {
    mockImageFetch();
    const result = await buildMosaic(imgs(2));
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it.each([3, 4, 5, 6, 7])('handles %i images without throwing', async (n) => {
    mockImageFetch();
    const result = await buildMosaic(imgs(n));
    expect(result.length).toBeGreaterThan(0);
  });

  it('caps at 7 images even if more are passed', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(TINY_JPEG.slice(), { headers: { 'Content-Type': 'image/jpeg' } })
    );
    vi.stubGlobal('fetch', fetchSpy);
    await buildMosaic(imgs(9));
    expect(fetchSpy).toHaveBeenCalledTimes(7);
  });

  it('portrait images produce a taller canvas than landscape', () => {
    const landscape = getMosaicDimensions(imgs(2, 1920, 1080).map(({ width, height }) => ({ width, height })));
    const portrait  = getMosaicDimensions(imgs(2, 1080, 1920).map(({ width, height }) => ({ width, height })));
    expect(portrait.height).toBeGreaterThan(landscape.height);
  });

  it('unknown dimensions (0×0) fall back to default cell height', () => {
    const dims = getMosaicDimensions([{ width: 0, height: 0 }, { width: 0, height: 0 }]);
    expect(dims.height).toBe(400); // MOSAIC_CELL_H default
  });

  it('mixed portrait+landscape rows produce different row heights (4-image 2×2)', () => {
    // Row 0: two landscape images; row 1: two portrait images
    const mixed = getMosaicDimensions([
      { width: 1920, height: 1080 }, // landscape
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 }, // portrait
      { width: 1080, height: 1920 },
    ]);
    // Canvas height should be > portrait-only canvas (row 0 is shorter, row 1 taller)
    const allPortrait = getMosaicDimensions([
      { width: 1080, height: 1920 }, { width: 1080, height: 1920 },
      { width: 1080, height: 1920 }, { width: 1080, height: 1920 },
    ]);
    const allLandscape = getMosaicDimensions([
      { width: 1920, height: 1080 }, { width: 1920, height: 1080 },
      { width: 1920, height: 1080 }, { width: 1920, height: 1080 },
    ]);
    // Mixed canvas height should be between all-landscape and all-portrait
    expect(mixed.height).toBeGreaterThan(allLandscape.height);
    expect(mixed.height).toBeLessThan(allPortrait.height);
  });
});

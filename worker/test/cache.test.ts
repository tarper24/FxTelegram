import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCached, setCache, getCachedBinary, setCacheBinary, postKey, channelKey, videoKey, mosaicKey } from '../src/cache';

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getWithMetadata: vi.fn(),
} as unknown as KVNamespace;

beforeEach(() => vi.clearAllMocks());

describe('getCached', () => {
  it('returns null on cache miss', async () => {
    vi.mocked(kv.get).mockResolvedValue(null);
    expect(await getCached(kv, 'key')).toBeNull();
  });

  it('returns parsed value on hit', async () => {
    vi.mocked(kv.get).mockResolvedValue({ text: 'hello' });
    expect(await getCached(kv, 'key')).toEqual({ text: 'hello' });
  });
});

describe('setCache', () => {
  it('puts JSON-serialised value with TTL', async () => {
    vi.mocked(kv.put).mockResolvedValue(undefined);
    await setCache(kv, 'key', { a: 1 }, 3600);
    expect(kv.put).toHaveBeenCalledWith('key', JSON.stringify({ a: 1 }), { expirationTtl: 3600 });
  });
});

describe('key builders', () => {
  it('postKey', () => expect(postKey('durov', 5)).toBe('msg:durov:5'));
  it('channelKey', () => expect(channelKey('durov')).toBe('chan:durov'));
  it('videoKey', () => expect(videoKey('durov', 5)).toBe('video:durov:5'));
  it('mosaicKey', () => expect(mosaicKey('durov', 5)).toBe('mosaic:durov:5'));
});

describe('getCachedBinary / setCacheBinary binary round-trip', () => {
  it('stores and retrieves Uint8Array with identical bytes', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const buf = bytes.buffer;

    const putSpy = vi.fn().mockResolvedValue(undefined);
    const getSpy = vi.fn().mockResolvedValue(buf);
    const roundTripKv = {
      get: getSpy,
      put: putSpy,
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;

    await setCacheBinary(roundTripKv, 'bin-key', bytes, 3600);
    expect(putSpy).toHaveBeenCalledWith('bin-key', bytes, { expirationTtl: 3600 });

    const result = await getCachedBinary(roundTripKv, 'bin-key');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(bytes);
  });

  it('returns null on cache miss', async () => {
    const missKv = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;
    expect(await getCachedBinary(missKv, 'missing-key')).toBeNull();
  });
});

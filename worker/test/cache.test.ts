import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCached, setCache, postKey, channelKey, videoKey, mosaicKey } from '../src/cache';

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

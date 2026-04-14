import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleVideoProxy } from '../src/video';
import type { Env } from '../src/types';

afterEach(() => vi.restoreAllMocks());

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getWithMetadata: vi.fn(),
} as unknown as KVNamespace;

const env: Env = { KV: kv };

describe('handleVideoProxy', () => {
  it('returns 404 when video URL not in KV', async () => {
    vi.mocked(kv.get).mockResolvedValue(null);
    const res = await handleVideoProxy('durov', 1, new Request('https://fxtelegram.me/video/durov/1'), env);
    expect(res.status).toBe(404);
  });

  it('returns 302 redirect for large videos', async () => {
    vi.mocked(kv.get).mockResolvedValue('https://cdn.tg/big.mp4');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(null, { headers: { 'Content-Length': String(200 * 1024 * 1024) } })
    ));
    const res = await handleVideoProxy('durov', 1, new Request('https://fxtelegram.me/video/durov/1'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://cdn.tg/big.mp4');
  });

  it('streams small video with correct headers', async () => {
    vi.mocked(kv.get).mockResolvedValue('https://cdn.tg/small.mp4');
    const videoBody = new ReadableStream();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '1024' } }))
      .mockResolvedValueOnce(new Response(videoBody, { status: 200, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '1024' } }))
    );
    const res = await handleVideoProxy('durov', 1, new Request('https://fxtelegram.me/video/durov/1'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('passes Range header through to upstream', async () => {
    vi.mocked(kv.get).mockResolvedValue('https://cdn.tg/small.mp4');
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(new Response(null, { headers: { 'Content-Length': '1024' } }))
      .mockResolvedValueOnce(new Response(null, { status: 206, headers: { 'Content-Range': 'bytes 0-511/1024', 'Content-Type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetchSpy);
    const req = new Request('https://fxtelegram.me/video/durov/1', { headers: { Range: 'bytes=0-511' } });
    const res = await handleVideoProxy('durov', 1, req, env);
    expect(fetchSpy.mock.calls[1]?.[1]?.headers?.Range).toBe('bytes=0-511');
    expect(res.status).toBe(206);
  });
});

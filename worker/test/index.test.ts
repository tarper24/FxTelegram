import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker from '../src/index';
import type { MessageData, Env } from '../src/types';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../src/scraper', () => ({
  scrapePost: vi.fn(),
}));

vi.mock('../src/mosaic', () => ({
  buildMosaic: vi.fn(),
}));

vi.mock('../src/video', () => ({
  handleVideoProxy: vi.fn(),
}));

vi.mock('../src/translate', () => ({
  translateText: vi.fn(),
}));

import { scrapePost } from '../src/scraper';
import { buildMosaic } from '../src/mosaic';
import { handleVideoProxy } from '../src/video';
import { translateText } from '../src/translate';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_MSG: MessageData = {
  channelUsername: 'durov',
  channelName: "Durov's Channel",
  channelAvatarUrl: null,
  messageId: 123,
  text: 'Hello world',
  images: [{ url: 'https://cdn.tg/img.jpg', width: 1280, height: 720 }],
  video: null,
  file: null,
  hasAlbum: false,
};

const ALBUM_MSG: MessageData = {
  ...BASE_MSG,
  images: [
    { url: 'https://cdn.tg/a.jpg', width: 1280, height: 720 },
    { url: 'https://cdn.tg/b.jpg', width: 1280, height: 720 },
    { url: 'https://cdn.tg/c.jpg', width: 1280, height: 720 },
  ],
  hasAlbum: true,
};

const VIDEO_MSG: MessageData = {
  ...BASE_MSG,
  images: [],
  video: {
    url: 'https://cdn.tg/vid.mp4',
    thumbnailUrl: 'https://cdn.tg/thumb.jpg',
    width: 1280,
    height: 720,
    durationSeconds: 30,
  },
};

// ── KV + ExecutionContext mocks ───────────────────────────────────────────────

function makeKv(jsonValue: unknown = null, arrayBufferValue: ArrayBuffer | null = null) {
  return {
    get: vi.fn().mockImplementation((_key: string, type?: string) => {
      if (type === 'arrayBuffer') return Promise.resolve(arrayBufferValue);
      return Promise.resolve(jsonValue);
    }),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: jsonValue, metadata: null }),
  } as unknown as KVNamespace;
}

function makeCtx() {
  return { waitUntil: vi.fn() } as unknown as ExecutionContext;
}

const BOT_UA = 'Discordbot/2.0';
const SLACK_UA = 'Slackbot-LinkExpanding 1.0';
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const ORIGIN = 'https://fxtelegram.org';

function req(path: string, ua = BOT_UA, base = ORIGIN) {
  return new Request(`${base}${path}`, { headers: { 'User-Agent': ua } });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(() => vi.clearAllMocks());

describe('Human browser redirect', () => {
  it('redirects to t.me for regular browser UA', async () => {
    const env: Env = { FXTELEGRAM_KV: makeKv() };
    const res = await worker.fetch(req('/durov/123', HUMAN_UA), env, makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://t.me/durov/123');
  });
});

describe('Bot — cache hit', () => {
  it('returns 200 embed HTML without calling scrapePost', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const ctx = makeCtx();
    const res = await worker.fetch(req('/durov/123'), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('og:title');
    expect(vi.mocked(scrapePost)).not.toHaveBeenCalled();
  });
});

describe('Bot — cache miss, scrape success', () => {
  it('returns 200 embed HTML and schedules KV write', async () => {
    const kv = makeKv(null);
    vi.mocked(scrapePost).mockResolvedValue(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const ctx = makeCtx();
    const res = await worker.fetch(req('/durov/123'), env, ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('og:title');
    expect(vi.mocked(scrapePost)).toHaveBeenCalledWith('durov', 123);
    expect(ctx.waitUntil).toHaveBeenCalled();
  });
});

describe('Bot — scrape failure (fallback embed)', () => {
  it('returns 200 with fallback embed containing channel name', async () => {
    const kv = makeKv(null);
    vi.mocked(scrapePost).mockResolvedValue(null);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123'), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('@durov');
  });
});

describe('Discord native gallery', () => {
  it('returns multiple og:image tags for Discordbot + album', async () => {
    const kv = makeKv(ALBUM_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123', 'Discordbot/2.0'), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    const imageMatches = html.match(/property="og:image"/g) ?? [];
    expect(imageMatches.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('https://cdn.tg/a.jpg');
    expect(html).toContain('https://cdn.tg/b.jpg');
  });
});

describe('Mosaic path (non-Discord bot)', () => {
  it('uses /mosaic/ URL in embed for Slackbot + album', async () => {
    const kv = makeKv(ALBUM_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123', SLACK_UA), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('/mosaic/durov/123');
    // Should NOT have three separate og:image tags
    const imageMatches = html.match(/property="og:image"/g) ?? [];
    expect(imageMatches.length).toBe(1);
  });
});

describe('Video path', () => {
  it('includes og:video proxy URL in embed', async () => {
    const kv = makeKv(VIDEO_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123'), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('og:video');
    expect(html).toContain('/video/durov/123');
  });
});

describe('Text-only subdomain (t. prefix)', () => {
  it('returns summary card with no og:image', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    // t. subdomain → t.fxtelegram.org
    const res = await worker.fetch(
      new Request('https://t.fxtelegram.org/durov/123', { headers: { 'User-Agent': BOT_UA } }),
      env, makeCtx()
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('twitter:card');
    expect(html).toContain('summary');
    expect(html).not.toContain('og:image');
  });
});

describe('Direct media subdomain (d. prefix)', () => {
  it('redirects to CDN image URL for bot + image message', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(
      new Request('https://d.fxtelegram.org/durov/123', { headers: { 'User-Agent': BOT_UA } }),
      env, makeCtx()
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://cdn.tg/img.jpg');
  });
});

describe('API subdomain (api. prefix)', () => {
  it('returns 200 JSON response with message data', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(
      new Request('https://api.fxtelegram.org/durov/123', { headers: { 'User-Agent': BOT_UA } }),
      env, makeCtx()
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const json = await res.json() as MessageData;
    expect(json.channelUsername).toBe('durov');
    expect(json.messageId).toBe(123);
  });
});

describe('oEmbed endpoint', () => {
  it('returns 200 JSON with provider_url matching request origin', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(
      new Request(`${ORIGIN}/oembed?url=https://t.me/durov/123`, { headers: { 'User-Agent': BOT_UA } }),
      env, makeCtx()
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const json = await res.json() as Record<string, string>;
    expect(json.provider_url).toBe('https://github.com/tarper24/FxTelegram');
    expect(json.type).toBe('link');
  });
});

describe('Profile redirect for bots', () => {
  it('redirects to t.me/<username> for profile path', async () => {
    const env: Env = { FXTELEGRAM_KV: makeKv() };
    const res = await worker.fetch(req('/durov', BOT_UA), env, makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://t.me/durov');
  });
});

describe('Invite redirect for bots', () => {
  it('redirects to t.me/+hash for invite path', async () => {
    const env: Env = { FXTELEGRAM_KV: makeKv() };
    const res = await worker.fetch(req('/+AbCdEfGh', BOT_UA), env, makeCtx());
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://t.me/+AbCdEfGh');
  });
});

describe('Private post fallback embed', () => {
  it('returns 200 with embed HTML for private-post path', async () => {
    const env: Env = { FXTELEGRAM_KV: makeKv() };
    const res = await worker.fetch(req('/c/-100123/456', BOT_UA), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Private channel post');
  });
});

describe('Photo modifier', () => {
  it('selects the specified photo index from album', async () => {
    const kv = makeKv(ALBUM_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123/photo/2'), env, makeCtx());
    expect(res.status).toBe(200);
    const html = await res.text();
    // photo/2 → index 1 → b.jpg
    expect(html).toContain('https://cdn.tg/b.jpg');
    expect(html).not.toContain('https://cdn.tg/a.jpg');
    expect(html).not.toContain('https://cdn.tg/c.jpg');
  });
});

describe('Language modifier', () => {
  it('calls translateText with correct target language', async () => {
    const kv = makeKv(BASE_MSG);
    vi.mocked(translateText).mockResolvedValue('Bonjour le monde');
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(req('/durov/123/fr'), env, makeCtx());
    expect(res.status).toBe(200);
    expect(vi.mocked(translateText)).toHaveBeenCalledWith('Hello world', 'fr', kv);
    const html = await res.text();
    expect(html).toContain('Bonjour le monde');
  });
});

describe('Mosaic endpoint (/mosaic/channel/id)', () => {
  it('calls buildMosaic and returns image/jpeg', async () => {
    const mosaicBytes = new Uint8Array([0xff, 0xd8, 0xff]);
    vi.mocked(buildMosaic).mockResolvedValue(mosaicBytes);
    // KV: mosaic cache miss (arrayBuffer null), post cache hit
    const kv = {
      get: vi.fn().mockImplementation((_key: string, type?: string) => {
        if (type === 'arrayBuffer') return Promise.resolve(null);
        return Promise.resolve(ALBUM_MSG);
      }),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    } as unknown as KVNamespace;
    const env: Env = { FXTELEGRAM_KV: kv };
    const ctx = makeCtx();
    const res = await worker.fetch(req('/mosaic/durov/123'), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(vi.mocked(buildMosaic)).toHaveBeenCalled();
  });
});

describe('Video endpoint (/video/channel/id)', () => {
  it('delegates to handleVideoProxy', async () => {
    vi.mocked(handleVideoProxy).mockResolvedValue(new Response('video', { status: 200 }));
    const env: Env = { FXTELEGRAM_KV: makeKv() };
    const res = await worker.fetch(req('/video/durov/123'), env, makeCtx());
    expect(vi.mocked(handleVideoProxy)).toHaveBeenCalledWith('durov', 123, expect.any(Request), env);
    expect(res.status).toBe(200);
  });
});

describe('Origin propagation', () => {
  it('oEmbed URL in embed HTML uses request origin, not hardcoded fxtelegram.me', async () => {
    const kv = makeKv(BASE_MSG);
    const env: Env = { FXTELEGRAM_KV: kv };
    const res = await worker.fetch(
      new Request('https://fx-t.me/durov/123', { headers: { 'User-Agent': BOT_UA } }),
      env, makeCtx()
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('https://fx-t.me/oembed');
    expect(html).not.toContain('https://fxtelegram.me/oembed');
  });
});

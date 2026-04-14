import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrapePost } from '../src/scraper';

afterEach(() => vi.restoreAllMocks());

function mockFetch(html: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(html, { status })));
}

const SIMPLE_POST_HTML = `<!DOCTYPE html><html><head>
  <meta property="og:title" content="Durov's Channel"/>
  <meta property="og:description" content="Hello world"/>
  <meta property="og:image" content="https://cdn.telegram.org/img1.jpg"/>
  <meta property="og:site_name" content="Telegram"/>
</head><body>
  <div class="tgme_widget_message_text">Hello world</div>
</body></html>`;

const VIDEO_POST_HTML = `<!DOCTYPE html><html><head>
  <meta property="og:title" content="News Channel"/>
  <meta property="og:description" content="Watch this"/>
</head><body>
  <video class="tgme_widget_message_video" src="https://cdn.telegram.org/vid.mp4"></video>
  <i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn.telegram.org/thumb.jpg')"></i>
</body></html>`;

const ALBUM_HTML = `<!DOCTYPE html><html><head>
  <meta property="og:title" content="Photo Channel"/>
  <meta property="og:description" content="Album"/>
</head><body>
  <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/a.jpg')"></a>
  <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/b.jpg')"></a>
  <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/c.jpg')"></a>
</body></html>`;

describe('scrapePost', () => {
  it('returns null on non-200 response', async () => {
    mockFetch('Not found', 404);
    expect(await scrapePost('durov', 999)).toBeNull();
  });

  it('extracts channel name and message text from meta tags', async () => {
    mockFetch(SIMPLE_POST_HTML);
    const data = await scrapePost('durov', 1);
    expect(data?.channelName).toBe("Durov's Channel");
    expect(data?.text).toBe('Hello world');
    expect(data?.channelUsername).toBe('durov');
    expect(data?.messageId).toBe(1);
  });

  it('extracts single image from og:image', async () => {
    mockFetch(SIMPLE_POST_HTML);
    const data = await scrapePost('durov', 1);
    expect(data?.images).toHaveLength(1);
    expect(data?.images[0]?.url).toBe('https://cdn.telegram.org/img1.jpg');
    expect(data?.hasAlbum).toBe(false);
  });

  it('extracts video URL and thumbnail', async () => {
    mockFetch(VIDEO_POST_HTML);
    const data = await scrapePost('news', 2);
    expect(data?.video?.url).toBe('https://cdn.telegram.org/vid.mp4');
    expect(data?.video?.thumbnailUrl).toBe('https://cdn.telegram.org/thumb.jpg');
    expect(data?.images).toHaveLength(0);
  });

  it('extracts album images and sets hasAlbum', async () => {
    mockFetch(ALBUM_HTML);
    const data = await scrapePost('photos', 3);
    expect(data?.images).toHaveLength(3);
    expect(data?.hasAlbum).toBe(true);
    expect(data?.images[0]?.url).toBe('https://cdn.telegram.org/a.jpg');
    expect(data?.images[2]?.url).toBe('https://cdn.telegram.org/c.jpg');
  });

  it('extracts album images when style precedes class', async () => {
    const html = `<!DOCTYPE html><html><head>
    <meta property="og:title" content="Photo Channel"/>
  </head><body>
    <a style="background-image:url('https://cdn.telegram.org/x.jpg')" class="tgme_widget_message_photo_wrap"></a>
    <a style="background-image:url('https://cdn.telegram.org/y.jpg')" class="tgme_widget_message_photo_wrap"></a>
  </body></html>`;
    mockFetch(html);
    const data = await scrapePost('photos', 10);
    expect(data?.images).toHaveLength(2);
    expect(data?.hasAlbum).toBe(true);
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
    expect(await scrapePost('durov', 1)).toBeNull();
  });
});

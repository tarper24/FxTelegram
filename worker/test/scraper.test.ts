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
  <div class="tgme_widget_message" data-post="durov/1">
    <div class="tgme_widget_message_text">Hello world</div>
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/img1.jpg')"></a>
  </div>
</body></html>`;

const VIDEO_POST_HTML = `<!DOCTYPE html><html><head>
  <meta property="og:title" content="News Channel"/>
  <meta property="og:description" content="Watch this"/>
</head><body>
  <div class="tgme_widget_message" data-post="news/2">
    <video class="tgme_widget_message_video" src="https://cdn.telegram.org/vid.mp4"></video>
    <i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn.telegram.org/thumb.jpg')"></i>
  </div>
</body></html>`;

const ALBUM_HTML = `<!DOCTYPE html><html><head>
  <meta property="og:title" content="Photo Channel"/>
  <meta property="og:description" content="Album"/>
</head><body>
  <div class="tgme_widget_message" data-post="photos/3">
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/a.jpg')"></a>
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/b.jpg')"></a>
    <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/c.jpg')"></a>
  </div>
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

  it('extracts video URL when src precedes class in tag', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="News Channel"/>
    </head><body>
      <video src="https://cdn.telegram.org/vid.mp4" class="tgme_widget_message_video"></video>
      <i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn.telegram.org/thumb.jpg')"></i>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('news', 5);
    expect(data?.video?.url).toBe('https://cdn.telegram.org/vid.mp4');
  });

  it('uses DOM div text over og:description when div is present', async () => {
    const truncated = 'A'.repeat(147) + '...';
    const full = 'A'.repeat(300);
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Test Channel"/>
      <meta property="og:description" content="${truncated}"/>
    </head><body>
      <div class="tgme_widget_message_text">${full}</div>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('test', 6);
    expect(data?.text).toBe(full);
    expect(data?.text).not.toContain('...');
  });

  it('extractMessageText shows "text (url)" for external links with distinct display text', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Test Channel"/>
    </head><body>
      <div class="tgme_widget_message_text">Hello <a href="https://example.com">world</a></div>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('test', 7);
    expect(data?.text).toBe('Hello world (https://example.com)');
  });

  it('handles all link types: bare URL kept as-is, t.me links text-only, external links get (url) suffix', async () => {
    const html = `<!DOCTYPE html><html><head><meta property="og:title" content="Test"/></head><body>
      <div class="tgme_widget_message" data-post="ch/1">
        <div class="tgme_widget_message_text">Shop: <a href="https://example.com">https://example.com</a> and <a href="https://t.me/other">@other</a> and <a href="https://shop.example.com">my shop</a></div>
      </div></body></html>`;
    mockFetch(html);
    const data = await scrapePost('ch', 1);
    expect(data?.text).toBe('Shop: https://example.com and @other and my shop (https://shop.example.com)');
  });

  it('extracts the correct post when multiple messages appear on the page', async () => {
    // Regression: t.me/s/ returns a multi-message page; scraper must use data-post
    // to scope extraction to the requested message, not the first one on the page.
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="My Channel"/>
      <meta property="og:image" content="https://cdn.telegram.org/wrong.jpg"/>
    </head><body>
      <div class="tgme_widget_message" data-post="mychannel/228">
        <div class="tgme_widget_message_text">Wrong post</div>
        <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/wrong.jpg')"></a>
      </div>
      <div class="tgme_widget_message" data-post="mychannel/241">
        <div class="tgme_widget_message_text">Correct post</div>
        <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telegram.org/correct.jpg')"></a>
      </div>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('mychannel', 241);
    expect(data?.text).toBe('Correct post');
    expect(data?.images[0]?.url).toBe('https://cdn.telegram.org/correct.jpg');
  });

  it('extracts bold opener as title and keeps full text in text field', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Art Channel"/>
    </head><body>
      <div class="tgme_widget_message" data-post="art/9">
        <div class="tgme_widget_message_text"><b>Big Sale Today!</b><br><br>Come check out our store for great deals.</div>
      </div>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('art', 9);
    expect(data?.title).toBe('Big Sale Today!');
    expect(data?.text).toContain('Big Sale Today!');
    expect(data?.text).toContain('Come check out our store');
  });

  it('returns null title when no bold opener', async () => {
    mockFetch(SIMPLE_POST_HTML);
    const data = await scrapePost('durov', 1);
    expect(data?.title).toBeNull();
  });

  it('extractMessageText handles nested divs in message text without truncating', async () => {
    const html = `<!DOCTYPE html><html><head>
      <meta property="og:title" content="Test Channel"/>
    </head><body>
      <div class="tgme_widget_message_text">Before nested <div class="inner">nested content</div> after nested</div>
    </body></html>`;
    mockFetch(html);
    const data = await scrapePost('test', 8);
    // Text should include content from both before and after the nested div
    expect(data?.text).toContain('Before nested');
    expect(data?.text).toContain('after nested');
  });
});

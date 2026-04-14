import { describe, it, expect } from 'vitest';
import { buildEmbed, buildOEmbedJson } from '../src/embed';
import type { MessageData } from '../src/types';

const baseMessage: MessageData = {
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

describe('buildEmbed', () => {
  it('includes og:title with channel name', () => {
    const html = buildEmbed(baseMessage, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain("Durov&#x27;s Channel");
  });

  it('includes og:description with post text', () => {
    const html = buildEmbed(baseMessage, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('Hello world');
  });

  it('includes og:image for single image', () => {
    const html = buildEmbed(baseMessage, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('https://cdn.tg/img.jpg');
    expect(html).toContain('og:image:width');
  });

  it('Discord + album: outputs one og:image per image', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 1280, height: 720 },
      { url: 'https://cdn.tg/b.jpg', width: 1280, height: 720 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { forceMosaic: false, textOnly: false, isDiscord: true });
    expect(html.match(/property="og:image"/g)?.length).toBe(2);
    expect(html).toContain('https://cdn.tg/a.jpg');
    expect(html).toContain('https://cdn.tg/b.jpg');
  });

  it('non-Discord + album: outputs mosaic URL as single og:image', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 0, height: 0 },
      { url: 'https://cdn.tg/b.jpg', width: 0, height: 0 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('/mosaic/durov/123');
    expect(html.match(/property="og:image"/g)?.length).toBe(1);
  });

  it('Discord + forceMosaic: uses mosaic URL even for Discord', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 0, height: 0 },
      { url: 'https://cdn.tg/b.jpg', width: 0, height: 0 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { forceMosaic: true, textOnly: false, isDiscord: true });
    expect(html).toContain('/mosaic/durov/123');
    expect(html.match(/property="og:image"/g)?.length).toBe(1);
  });

  it('video: includes og:video pointing to proxy URL', () => {
    const msg = { ...baseMessage, images: [], video: {
      url: 'https://cdn.tg/vid.mp4',
      thumbnailUrl: 'https://cdn.tg/thumb.jpg',
      width: 1280, height: 720, durationSeconds: 30,
    }};
    const html = buildEmbed(msg, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('/video/durov/123');
    expect(html).toContain('og:video');
    expect(html).toContain('https://cdn.tg/thumb.jpg');
    expect(html).toContain('video/mp4');
  });

  it('textOnly: no og:image or og:video', () => {
    const html = buildEmbed(baseMessage, { forceMosaic: false, textOnly: true, isDiscord: false });
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('og:video');
  });

  it('includes oEmbed link tag', () => {
    const html = buildEmbed(baseMessage, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).toContain('application/json+oembed');
  });

  it('escapes all HTML entities in channel name and text', () => {
    const msg = { ...baseMessage, text: '&<>"\'', channelName: '&<>"\'' };
    const html = buildEmbed(msg, { forceMosaic: false, textOnly: false, isDiscord: false });
    expect(html).not.toMatch(/content="&[^a]/); // no unescaped & in attributes
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#x27;');
  });
});

describe('buildOEmbedJson', () => {
  it('returns correct structure', () => {
    const json = buildOEmbedJson('durov', "Durov's Channel", 123);
    expect(json.type).toBe('link');
    expect(json.version).toBe('1.0');
    expect(json.provider_name).toBe('FxTelegram');
    expect(json.author_name).toBe("Durov's Channel");
    expect(json.provider_url).toBe('https://fxtelegram.me');
    expect(json.author_url).toBe('https://t.me/durov/123');
  });
});

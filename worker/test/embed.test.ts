import { describe, it, expect } from 'vitest';
import { buildEmbed, buildOEmbedJson } from '../src/embed';
import type { MessageData } from '../src/types';

const baseMessage: MessageData = {
  channelUsername: 'FxTelegram24',
  channelName: 'FxTelegram',
  channelAvatarUrl: null,
  messageId: 123,
  publishedAt: null,
  text: 'Hello world',
  contentHtml: '<p>Hello world</p>',
  images: [{ url: 'https://cdn.tg/img.jpg', width: 1280, height: 720 }],
  video: null,
  file: null,
  hasAlbum: false,
  views: null,
  commentsCount: null,
  reactions: [],
};

const ORIGIN = 'https://fxtelegram.org';

describe('buildEmbed', () => {
  it('og:title uses post text (not channel name) when text is present', () => {
    const html = buildEmbed(baseMessage, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('Hello world');
    // Channel name should NOT appear in og:title when text is available
    expect(html).not.toMatch(/property="og:title"[^>]*content="[^"]*FxTelegram"/);
  });

  it('og:title falls back to channel name for media-only posts (no text)', () => {
    const msg = { ...baseMessage, text: '' };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('FxTelegram');
  });

  it('og:description is empty for short text without bold opener', () => {
    const html = buildEmbed(baseMessage, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).not.toContain('og:description');
  });

  it('og:title truncated and og:description set for long text without bold opener', () => {
    const longText = 'A'.repeat(300);
    const msg = { ...baseMessage, text: longText };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
    expect(html).toContain('…');
  });

  it('bold opener: og:title = title, og:description = body text', () => {
    const msg = { ...baseMessage, title: 'Big Announcement', text: 'Big Announcement\n\nThe full body text here.' };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('content="Big Announcement"');
    expect(html).toContain('og:description');
    expect(html).toContain('The full body text here.');
  });

  it('paragraph split: first paragraph → og:title, rest → og:description', () => {
    const msg = { ...baseMessage, text: 'First paragraph summary.\n\nThe rest of the post body here.' };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('content="First paragraph summary."');
    expect(html).toContain('og:description');
    expect(html).toContain('The rest of the post body here.');
  });

  it('no paragraph break: full text as og:title, no og:description for short text', () => {
    const msg = { ...baseMessage, text: 'Just a single line with no paragraph break.' };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('content="Just a single line with no paragraph break."');
    expect(html).not.toContain('og:description');
  });

  it('includes og:image for single image', () => {
    const html = buildEmbed(baseMessage, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('https://cdn.tg/img.jpg');
    expect(html).toContain('og:image:width');
  });

  it('Discord + album: outputs one og:image per image', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 1280, height: 720 },
      { url: 'https://cdn.tg/b.jpg', width: 1280, height: 720 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: true, mastodonId: null });
    expect(html.match(/property="og:image"/g)?.length).toBe(2);
    expect(html).toContain('https://cdn.tg/a.jpg');
    expect(html).toContain('https://cdn.tg/b.jpg');
  });

  it('non-Discord + album: outputs mosaic URL as single og:image', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 0, height: 0 },
      { url: 'https://cdn.tg/b.jpg', width: 0, height: 0 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('/mosaic/FxTelegram24/123');
    expect(html.match(/property="og:image"/g)?.length).toBe(1);
  });

  it('Discord + forceMosaic: uses mosaic URL even for Discord', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 0, height: 0 },
      { url: 'https://cdn.tg/b.jpg', width: 0, height: 0 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: true, textOnly: false, isDiscord: true, mastodonId: null });
    expect(html).toContain('/mosaic/FxTelegram24/123');
    expect(html.match(/property="og:image"/g)?.length).toBe(1);
  });

  it('video: includes og:video pointing to proxy URL', () => {
    const msg = { ...baseMessage, images: [], video: {
      url: 'https://cdn.tg/vid.mp4',
      thumbnailUrl: 'https://cdn.tg/thumb.jpg',
      width: 1280, height: 720, durationSeconds: 30,
    }};
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('/video/FxTelegram24/123');
    expect(html).toContain('og:video');
    expect(html).toContain('https://cdn.tg/thumb.jpg');
    expect(html).toContain('video/mp4');
  });

  it('textOnly: no og:image or og:video', () => {
    const html = buildEmbed(baseMessage, { origin: ORIGIN, forceMosaic: false, textOnly: true, isDiscord: false, mastodonId: null });
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('og:video');
  });

  it('includes oEmbed link tag', () => {
    const html = buildEmbed(baseMessage, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('application/json+oembed');
  });

  it('escapes all HTML entities in channel name and text', () => {
    const msg = { ...baseMessage, text: '&<>"\'', channelName: '&<>"\'' };
    const html = buildEmbed(msg, { origin: ORIGIN, forceMosaic: false, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).not.toMatch(/content="&[^a]/); // no unescaped & in attributes
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&quot;');
    expect(html).toContain('&#x27;');
  });

  it('mosaic URL uses provided origin', () => {
    const msg = { ...baseMessage, images: [
      { url: 'https://cdn.tg/a.jpg', width: 0, height: 0 },
      { url: 'https://cdn.tg/b.jpg', width: 0, height: 0 },
    ], hasAlbum: true };
    const html = buildEmbed(msg, { origin: 'https://fx-t.me', forceMosaic: true, textOnly: false, isDiscord: false, mastodonId: null });
    expect(html).toContain('https://fx-t.me/mosaic/');
    expect(html).not.toContain('https://fxtelegram.me/mosaic/');
  });
});

describe('buildOEmbedJson', () => {
  it('returns correct structure', () => {
    const json = buildOEmbedJson('FxTelegram24', 'FxTelegram', 123, 'https://fxtelegram.org');
    expect(json.type).toBe('rich');
    expect(json.version).toBe('1.0');
    expect(json.provider_name).toBe('FxTelegram');
    expect(json.author_name).toBe('FxTelegram');
    expect(json.provider_url).toBe('https://github.com/tarper24/FxTelegram');
    expect(json.author_url).toBe('https://t.me/FxTelegram24');
  });
});

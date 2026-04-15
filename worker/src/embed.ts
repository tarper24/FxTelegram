import type { MessageData, ReactionData } from './types';

interface EmbedOptions {
  origin: string;
  forceMosaic: boolean;
  textOnly: boolean;
  isDiscord: boolean;
  mastodonId: string | null;
}

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function meta(property: string, content: string): string {
  return `<meta property="${property}" content="${esc(content)}"/>`;
}

function nameMeta(name: string, content: string): string {
  return `<meta name="${name}" content="${esc(content)}"/>`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function formatStats(reactions: ReactionData[], commentsCount: number | null, views: number | null): string {
  const parts: string[] = [];
  const top = (reactions ?? []).slice(0, 3);
  if (top.length > 0) parts.push(top.map(r => `${r.emoji} ${formatCount(r.count)}`).join(' '));
  if (commentsCount !== null) parts.push(`💬 ${formatCount(commentsCount)}`);
  if (views !== null) parts.push(`👁 ${formatCount(views)}`);
  return parts.join('  ');
}

export function buildEmbed(msg: MessageData, opts: EmbedOptions): string {
  const { origin } = opts;
  const telegramUrl = `https://t.me/${msg.channelUsername}/${msg.messageId}`;
  const oEmbedUrl = `${origin}/OwOembed?url=${encodeURIComponent(telegramUrl)}`;

  // og:title: use the scraped bold opener when available; otherwise full text
  // (truncated). Channel name is the fallback for media-only posts.
  const TITLE_LIMIT = 256;
  let title: string;
  let bodyText = '';

  if (msg.title) {
    // Bold opener detected by scraper — use as title; body = remainder
    title = msg.title.length <= TITLE_LIMIT ? msg.title : msg.title.slice(0, TITLE_LIMIT - 1) + '…';
    bodyText = msg.text.replace(msg.title, '').trimStart();
  } else if (msg.text) {
    const nnIdx = msg.text.indexOf('\n\n');
    if (nnIdx !== -1) {
      // First paragraph → title, rest → description
      const head = msg.text.slice(0, nnIdx).trim();
      title = head.length <= TITLE_LIMIT ? head : head.slice(0, TITLE_LIMIT - 1) + '…';
      bodyText = msg.text.slice(nnIdx).trim();
    } else {
      // No paragraph break — full text as title (original behaviour)
      title = msg.text.length <= TITLE_LIMIT ? msg.text : msg.text.slice(0, TITLE_LIMIT - 1) + '…';
      bodyText = msg.text.length > TITLE_LIMIT ? msg.text : '';
    }
  } else {
    title = msg.channelName;
  }

  // og:description: body text (after title) + file metadata + engagement stats
  const bodyParts: string[] = [];
  if (bodyText) bodyParts.push(bodyText);
  if (msg.file && !opts.textOnly) bodyParts.push(`📎 ${msg.file.name} · ${msg.file.mimeType}`);
  const stats = formatStats(msg.reactions, msg.commentsCount, msg.views);
  if (stats) bodyParts.push(stats);
  const description = bodyParts.join('\n');

  const tags: string[] = [
    // og:site_name is kept solely to trigger Discord's theme-color left border;
    // oEmbed provider_name takes display priority so it won't show as a duplicate.
    meta('og:site_name', 'FxTelegram'),
    meta('og:title', title),
    ...(description ? [meta('og:description', description)] : []),
    meta('og:url', telegramUrl),
    nameMeta('twitter:card', opts.textOnly ? 'summary' : 'summary_large_image'),
  ];

  if (!opts.textOnly) {
    // Multi-image album
    if (msg.hasAlbum && msg.images.length > 1 && !opts.forceMosaic && opts.isDiscord) {
      // Discord native gallery: one og:image + twitter:image per photo
      for (const img of msg.images) {
        tags.push(meta('og:image', img.url));
        if (img.width) tags.push(meta('og:image:width', String(img.width)));
        if (img.height) tags.push(meta('og:image:height', String(img.height)));
        tags.push(meta('twitter:image', img.url));
      }
    } else if (msg.hasAlbum && msg.images.length > 1) {
      // Non-Discord or forceMosaic: serve mosaic URL
      const mosaicUrl = `${origin}/mosaic/${msg.channelUsername}/${msg.messageId}`;
      tags.push(meta('og:image', mosaicUrl));
      tags.push(meta('twitter:image', mosaicUrl));
    } else if (msg.images.length > 0) {
      // Single image
      const img = msg.images[0]!;
      tags.push(meta('og:image', img.url));
      if (img.width) tags.push(meta('og:image:width', String(img.width)));
      if (img.height) tags.push(meta('og:image:height', String(img.height)));
      tags.push(meta('twitter:image', img.url));
    } else if (msg.video) {
      // Video: thumbnail as og:image + og:video proxy
      const videoProxyUrl = `${origin}/video/${msg.channelUsername}/${msg.messageId}`;
      tags.push(meta('og:image', msg.video.thumbnailUrl));
      tags.push(meta('twitter:image', msg.video.thumbnailUrl));
      if (msg.video.width) tags.push(meta('og:image:width', String(msg.video.width)));
      if (msg.video.height) tags.push(meta('og:image:height', String(msg.video.height)));
      tags.push(meta('og:video', videoProxyUrl));
      tags.push(meta('og:video:type', 'video/mp4'));
      if (msg.video.width) tags.push(meta('og:video:width', String(msg.video.width)));
      if (msg.video.height) tags.push(meta('og:video:height', String(msg.video.height)));
    }
  }

  // ActivityPub link uses Mastodon's /users/:channel/statuses/:snowflake path.
  // Discord recognises this pattern and fetches /api/v1/statuses/:snowflake for the content.
  const activityPubUrl = opts.mastodonId
    ? `${origin}/users/${msg.channelUsername}/statuses/${opts.mastodonId}`
    : `${origin}/users/${msg.channelUsername}/statuses/${msg.messageId}`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="theme-color" content="#2AABEE"/>${tags.join('')}<link rel="alternate" type="application/json+oembed" href="${esc(oEmbedUrl)}" title="${esc(msg.channelName)}"/><link rel="alternate" type="application/activity+json" href="${esc(activityPubUrl)}"/></head><body><a href="${esc(telegramUrl)}">View on Telegram</a></body></html>`;

  return html;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

export function buildOEmbedJson(
  channelUsername: string,
  channelName: string,
  messageId: number,
  _origin = 'https://fxtelegram.me',
  publishedAt: string | null = null,
) {
  const date = formatDate(publishedAt);
  return {
    type: 'rich' as const,
    version: '1.0' as const,
    provider_name: date ? `FxTelegram • ${date}` : 'FxTelegram',
    provider_url: 'https://github.com/tarper24/FxTelegram',
    author_name: channelName,
    author_url: `https://t.me/${channelUsername}`,
  };
}

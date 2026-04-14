import type { MessageData } from './types';

interface EmbedOptions {
  forceMosaic: boolean;
  textOnly: boolean;
  isDiscord: boolean;
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

export function buildEmbed(msg: MessageData, opts: EmbedOptions): string {
  const origin = 'https://fxtelegram.me';
  const telegramUrl = `https://t.me/${msg.channelUsername}/${msg.messageId}`;
  const oEmbedUrl = `${origin}/oembed?url=${encodeURIComponent(telegramUrl)}`;

  const tags: string[] = [
    meta('og:site_name', 'FxTelegram'),
    meta('og:title', msg.channelName),
    meta('og:description', msg.text),
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
${tags.join('\n')}
<link rel="alternate" type="application/json+oembed" href="${esc(oEmbedUrl)}" title="${esc(msg.channelName)}"/>
</head>
<body><a href="${esc(telegramUrl)}">View on Telegram</a></body>
</html>`;

  return html;
}

export function buildOEmbedJson(channelUsername: string, channelName: string, messageId: number) {
  return {
    type: 'link' as const,
    version: '1.0' as const,
    provider_name: 'FxTelegram',
    provider_url: 'https://fxtelegram.me',
    author_name: channelName,
    author_url: `https://t.me/${channelUsername}/${messageId}`,
  };
}

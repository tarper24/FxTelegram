import type { MessageData, ImageData, VideoData, ReactionData } from './types';

/** Extract URL from CSS background-image style attribute */
function extractBgUrl(style: string | null): string | null {
  if (!style) return null;
  const m = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
  return m?.[1] ?? null;
}

/** Decode common HTML entities to plain-text characters */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Escape HTML special characters for safe insertion into element content */
function escCh(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build sanitized HTML for the Mastodon content field from the raw inner HTML
 * of a tgme_widget_message_text div.
 * Keeps <a> links and <b>/<strong> bold; decodes entities; wraps in <p> tags.
 */
function extractContentHtml(innerHtml: string): string {
  if (!innerHtml.trim()) return '';

  // Normalize <br> to newlines
  let html = innerHtml.replace(/<br\s*\/?>/gi, '\n');

  // Stash <a> links (SOH = \x01 as placeholder delimiter, safe in HTML)
  const links: string[] = [];
  html = html.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
    const text = escCh(decodeEntities(inner.replace(/<[^>]+>/g, '').trim()));
    const idx = links.length;
    links.push(`<a href="${href}">${text}</a>`);
    return `\x01L${idx}\x01`;
  });

  // Stash <b>/<strong> bold spans
  const bolds: string[] = [];
  html = html.replace(/<(b|strong)\b[^>]*>([\s\S]*?)<\/(b|strong)>/gi, (_, _t, inner) => {
    const text = escCh(decodeEntities(inner.replace(/<[^>]+>/g, '').trim()));
    const idx = bolds.length;
    bolds.push(`<strong>${text}</strong>`);
    return `\x01B${idx}\x01`;
  });

  // Strip remaining tags, decode entities in text nodes, re-escape
  html = escCh(decodeEntities(html.replace(/<[^>]+>/g, '')));

  // Restore stashed elements
  html = html.replace(/\x01L(\d+)\x01/g, (_, i) => links[Number(i)]!);
  html = html.replace(/\x01B(\d+)\x01/g, (_, i) => bolds[Number(i)]!);

  // Wrap in <p> paragraphs (double newline = paragraph break)
  return html
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function extractMeta(html: string, property: string): string | null {
  // Match property before content
  let m = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content="([^"]+)"`, 'i'));
  if (!m) m = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content='([^']+)'`, 'i'));
  // Match content before property
  if (!m) m = html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property=["']${property}["']`, 'i'));
  if (!m) m = html.match(new RegExp(`<meta[^>]+content='([^']+)'[^>]+property=["']${property}["']`, 'i'));
  return m?.[1] ?? null;
}

function extractVideoUrl(html: string): string | undefined {
  const tagMatch = html.match(/<video\b[^>]*tgme_widget_message_video[^>]*>/);
  if (!tagMatch) return undefined;
  const srcMatch = tagMatch[0].match(/\bsrc="([^"]+)"/);
  return srcMatch?.[1];
}

function extractVideoThumb(html: string): { url: string; width?: number; height?: number } | undefined {
  const tagMatch = html.match(/<[a-z]+\b[^>]*tgme_widget_message_video_thumb[^>]*>/);
  if (!tagMatch || !tagMatch[0]) return undefined;
  const styleMatch = tagMatch[0].match(/\bstyle="([^"]+)"/);
  if (!styleMatch || !styleMatch[1]) return undefined;
  const style = styleMatch[1];
  const bgMatch = style.match(/background-image:url\('([^']+)'\)/);
  if (!bgMatch || !bgMatch[1]) return undefined;
  const widthMatch = style.match(/width:(\d+)px/);
  const heightMatch = style.match(/height:(\d+)px/);
  return {
    url: bgMatch[1],
    width: widthMatch?.[1] !== undefined ? parseInt(widthMatch[1], 10) : undefined,
    height: heightMatch?.[1] !== undefined ? parseInt(heightMatch[1], 10) : undefined,
  };
}

function extractMessageText(html: string): string {
  // Greedy match so nested </div> tags inside the message div don't prematurely
  // terminate the capture. The outer div is the last one before </body>, so
  // backtracking to the last </div> that precedes a block-level boundary is safe.
  const divMatch = html.match(/<div[^>]*class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\b|<\/div|<\/body|$)/);
  if (divMatch?.[1]) {
    const text = divMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      // For external links with display text: show "text (url)" so the URL is
      // visible and auto-linkable by Discord. Internal t.me links keep display text only.
      .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').trim();
        const norm = (s: string) => s.replace(/\/+$/, '');
        if (!href.startsWith('http') || href.includes('//t.me/') || href.startsWith('tg://') || norm(text) === norm(href)) {
          return text;
        }
        return `${text} (${href})`;
      })
      .replace(/<[^>]+>/g, '')
      .trim();
    return decodeEntities(text);
  }
  return decodeEntities(extractMeta(html, 'og:description') ?? '');
}

/**
 * Detect a bold/strong opener as a de-facto post title.
 * Returns the plain text of the opener if the message HTML starts with a
 * <b> or <strong> block followed by a <br> or newline; otherwise null.
 */
function extractMessageTitle(innerHtml: string): string | null {
  const m = innerHtml.match(/^\s*<(b|strong)\b[^>]*>([\s\S]*?)<\/\1\s*>/i);
  if (!m) return null;
  const rest = innerHtml.slice(m[0].length);
  // Require a <br>, newline, or end of content immediately after the bold block
  if (rest.trim() && !/^\s*(?:<br\s*\/?>|\n)/.test(rest)) return null;
  return m[2]!.replace(/<[^>]+>/g, '').trim() || null;
}

/** Parse Telegram count strings like "1.4K", "2.0M", "2,043" to an integer */
function parseViewCount(s: string): number {
  const clean = s.replace(/,/g, '').trim();
  const n = parseFloat(clean);
  if (isNaN(n)) return 0;
  const lower = clean.toLowerCase();
  if (lower.endsWith('k')) return Math.round(n * 1_000);
  if (lower.endsWith('m')) return Math.round(n * 1_000_000);
  return Math.round(n);
}

function extractViews(html: string): number | null {
  const m = html.match(/<span\b[^>]*class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([^<]+)</);
  if (!m?.[1]) return null;
  const n = parseViewCount(m[1].trim());
  return n > 0 ? n : null;
}


function extractReactions(html: string): { reactions: ReactionData[]; total: number } {
  // Actual structure: <span class="tgme_reaction"><i class="emoji" ...><b>❤</b></i>53</span>
  const reactions: ReactionData[] = [];
  let total = 0;
  const reactionRe = /<span\b[^>]*class="[^"]*tgme_reaction[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = reactionRe.exec(html)) !== null) {
    const inner = m[1]!;
    // Emoji text is inside <b> within <i class="emoji">
    const emojiMatch = inner.match(/<b>([^<]+)<\/b>/);
    // Count is the text node immediately after </i>
    const countText = inner.match(/<\/i>\s*([^<\s][^<]*)/)?.[1]?.trim();
    if (!emojiMatch?.[1] || !countText) continue;
    // Add VS-16 (U+FE0F) after chars in the Miscellaneous Symbols range (U+2600–27FF)
    // that default to text presentation — turns ❤ → ❤️, ❤‍🔥 → ❤️‍🔥, etc.
    const emoji = emojiMatch[1].trim().replace(/([\u2600-\u27FF])(?!\uFE0F)/g, '$1\uFE0F');
    const count = parseViewCount(countText);
    total += count;
    // Custom Telegram emoji have no standard Unicode in <b> — count them in total but skip display
    if (count > 0 && /\p{Emoji}/u.test(emoji)) reactions.push({ emoji, count });
  }
  return { reactions, total };
}

function extractChannelAvatar(html: string): string | null {
  // Channel avatar: <i class="tgme_page_photo_image ..."><img src="..."></i>
  const block = html.match(/<i\b[^>]*class="[^"]*tgme_page_photo_image[^"]*"[^>]*>[\s\S]*?<\/i>/i);
  if (!block) return null;
  return block[0].match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] ?? null;
}

function extractPublishedAt(html: string): string | null {
  const m = html.match(/<time\b[^>]*\bdatetime="([^"]+)"[^>]*>/i);
  return m?.[1] ?? null;
}

function extractAlbumImages(html: string): ImageData[] {
  const images: ImageData[] = [];
  // Match <a> tags containing the photo_wrap class — handles any attribute order
  const tagRe = /<a\b[^>]*tgme_widget_message_photo_wrap[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const styleMatch = m[0].match(/style="([^"]*)"/);
    const style = styleMatch?.[1] ?? null;
    const url = extractBgUrl(style);
    if (url) {
      const w = style?.match(/width:(\d+)px/)?.[1];
      const h = style?.match(/height:(\d+)px/)?.[1];
      images.push({
        url,
        width: w ? parseInt(w, 10) : 0,
        height: h ? parseInt(h, 10) : 0,
      });
    }
  }
  return images;
}

/**
 * Extract the HTML block for a specific message by its data-post attribute.
 * t.me/s/ returns a multi-message page; we must scope extraction to the
 * requested message ID to avoid pulling content from adjacent posts.
 *
 * For album photos that are not the first in their group, Telegram renders all
 * photos under the first photo's data-post block — later photos have no block
 * of their own. We fall back to finding the album block that contains a
 * ?single link to the requested messageId.
 */
function extractMessageBlock(html: string, channelUsername: string, messageId: number): string {
  const marker = `data-post="${channelUsername}/${messageId}"`;
  const markerLower = `data-post="${channelUsername.toLowerCase()}/${messageId}"`;
  let idx = html.indexOf(marker);
  if (idx === -1) idx = html.toLowerCase().indexOf(markerLower);

  if (idx !== -1) {
    const nextPost = html.indexOf('data-post=', idx + marker.length);
    return nextPost !== -1 ? html.slice(idx, nextPost) : html.slice(idx);
  }

  // Fallback: non-first album photo — find the album block containing ?single link
  const singleLink = `/${channelUsername.toLowerCase()}/${messageId}?single`;
  const linkIdx = html.toLowerCase().indexOf(singleLink);
  if (linkIdx !== -1) {
    const blockStart = html.slice(0, linkIdx).lastIndexOf('data-post="');
    if (blockStart !== -1) {
      const nextPost = html.indexOf('data-post=', blockStart + 11);
      return nextPost !== -1 ? html.slice(blockStart, nextPost) : html.slice(blockStart);
    }
  }

  return html; // final fallback: full page
}

export async function scrapePost(channelUsername: string, messageId: number): Promise<MessageData | null> {
  const url = `https://t.me/s/${channelUsername}/${messageId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        Accept: 'text/html',
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const html = await response.text();

  // Channel name lives in <head> og:title — safe to read from full page
  const channelName = extractMeta(html, 'og:title') ?? channelUsername;

  // All content extraction must be scoped to the specific message block
  const msgHtml = extractMessageBlock(html, channelUsername, messageId);

  const text = extractMessageText(msgHtml);

  // Extract the raw inner HTML of the text div to detect a bold opener (title)
  // and to build sanitized HTML for the Mastodon content field
  const textDivMatch = msgHtml.match(/<div[^>]*class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\b|<\/div|<\/body|$)/);
  const title = textDivMatch?.[1] ? extractMessageTitle(textDivMatch[1]) : null;
  const contentHtml = textDivMatch?.[1] ? extractContentHtml(textDivMatch[1]) : '';

  // og:image is page-level and may reflect a different post — only use as a
  // last resort if the message block contains no photo_wrap elements
  const ogImage = extractMeta(html, 'og:image');
  const ogImageWidth  = extractMeta(html, 'og:image:width');
  const ogImageHeight = extractMeta(html, 'og:image:height');

  // Album images
  const albumImages = extractAlbumImages(msgHtml);

  // Video
  const videoUrl = extractVideoUrl(msgHtml) ?? null;
  const videoThumbData = extractVideoThumb(msgHtml);
  const videoThumb = videoThumbData?.url ?? null;

  // File
  const fileNameMatch = msgHtml.match(/class="tgme_widget_message_document_title"[^>]*>([^<]+)</);
  const fileExtraMatch = msgHtml.match(/class="tgme_widget_message_document_extra"[^>]*>([^<]+)</);

  const publishedAt = extractPublishedAt(msgHtml);
  const views = extractViews(msgHtml);
  const { reactions, total: reactionsTotal } = extractReactions(msgHtml);
  // commentsCount requires MTProto — not available in the web preview

  const data: MessageData = {
    channelUsername,
    channelName,
    channelAvatarUrl: extractChannelAvatar(html),
    messageId,
    publishedAt,
    title,
    text,
    contentHtml,
    images: [],
    video: null,
    file: null,
    hasAlbum: false,
    views,
    commentsCount: null,
    reactions,
    reactionsTotal,
  };

  // Resolve images
  if (albumImages.length > 1) {
    data.images = albumImages;
    data.hasAlbum = true;
  } else if (albumImages.length === 1) {
    data.images = albumImages;
  } else if (ogImage) {
    data.images = [{
      url: ogImage,
      width:  ogImageWidth  ? parseInt(ogImageWidth,  10) : 0,
      height: ogImageHeight ? parseInt(ogImageHeight, 10) : 0,
    }];
  }

  // Resolve video (clears images)
  if (videoUrl) {
    data.video = {
      url: videoUrl,
      thumbnailUrl: videoThumb ?? '',
      width: videoThumbData?.width ?? 0,
      height: videoThumbData?.height ?? 0,
      durationSeconds: 0,
    };
    data.images = [];
  }

  // Resolve file
  if (fileNameMatch?.[1]) {
    const mimeMatch = fileExtraMatch?.[1]?.match(/·\s*(.+)$/);
    data.file = {
      name: fileNameMatch[1].trim(),
      sizeBytes: 0,
      mimeType: mimeMatch?.[1]?.trim() ?? 'application/octet-stream',
    };
  }

  return data;
}

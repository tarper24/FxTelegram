import type { MessageData, ImageData, VideoData } from './types';

/** Extract URL from CSS background-image style attribute */
function extractBgUrl(style: string | null): string | null {
  if (!style) return null;
  const m = style.match(/url\(['"]?([^'")\s]+)['"]?\)/);
  return m?.[1] ?? null;
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
    return divMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      // Preserve URLs from <a> tags so they remain clickable in Discord embeds.
      // - If anchor text is already a URL → keep text (it's the URL itself)
      // - If href is a t.me / tg:// link → keep display text (@mention, hashtag, etc.)
      // - External link with display text (e.g. "Shop link") → use the href URL
      .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
        const text = inner.replace(/<[^>]+>/g, '').trim();
        if (text.startsWith('http') || !href.startsWith('http') || href.includes('//t.me/') || href.startsWith('tg://')) {
          return text;
        }
        return href;
      })
      .replace(/<[^>]+>/g, '')
      .trim();
  }
  return extractMeta(html, 'og:description') ?? '';
}

function extractAlbumImages(html: string): ImageData[] {
  const images: ImageData[] = [];
  // Match <a> tags containing the photo_wrap class — handles any attribute order
  const tagRe = /<a\b[^>]*tgme_widget_message_photo_wrap[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const styleMatch = m[0].match(/style="([^"]*)"/);
    const url = extractBgUrl(styleMatch?.[1] ?? null);
    if (url) images.push({ url, width: 0, height: 0 });
  }
  return images;
}

/**
 * Extract the HTML block for a specific message by its data-post attribute.
 * t.me/s/ returns a multi-message page; we must scope extraction to the
 * requested message ID to avoid pulling content from adjacent posts.
 */
function extractMessageBlock(html: string, channelUsername: string, messageId: number): string {
  const marker = `data-post="${channelUsername}/${messageId}"`;
  const markerLower = `data-post="${channelUsername.toLowerCase()}/${messageId}"`;
  let idx = html.indexOf(marker);
  if (idx === -1) idx = html.toLowerCase().indexOf(markerLower);
  if (idx === -1) return html; // fallback: full page (shouldn't happen for valid posts)

  // Slice from this message's marker to the next data-post= (next message) or end of page
  const nextPost = html.indexOf('data-post=', idx + marker.length);
  return nextPost !== -1 ? html.slice(idx, nextPost) : html.slice(idx);
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
  // og:image is page-level and may reflect a different post — only use as a
  // last resort if the message block contains no photo_wrap elements
  const ogImage = extractMeta(html, 'og:image');

  // Album images
  const albumImages = extractAlbumImages(msgHtml);

  // Video
  const videoUrl = extractVideoUrl(msgHtml) ?? null;
  const videoThumbData = extractVideoThumb(msgHtml);
  const videoThumb = videoThumbData?.url ?? null;

  // File
  const fileNameMatch = msgHtml.match(/class="tgme_widget_message_document_title"[^>]*>([^<]+)</);
  const fileExtraMatch = msgHtml.match(/class="tgme_widget_message_document_extra"[^>]*>([^<]+)</);

  const data: MessageData = {
    channelUsername,
    channelName,
    channelAvatarUrl: null,
    messageId,
    text,
    images: [],
    video: null,
    file: null,
    hasAlbum: false,
  };

  // Resolve images
  if (albumImages.length > 1) {
    data.images = albumImages;
    data.hasAlbum = true;
  } else if (albumImages.length === 1) {
    data.images = albumImages;
  } else if (ogImage) {
    data.images = [{ url: ogImage, width: 0, height: 0 }];
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

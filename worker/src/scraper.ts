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

  const channelName = extractMeta(html, 'og:title') ?? channelUsername;
  const text = extractMeta(html, 'og:description') ?? '';
  const ogImage = extractMeta(html, 'og:image');

  // Album images
  const albumImages = extractAlbumImages(html);

  // Video
  const videoSrcMatch = html.match(/class="tgme_widget_message_video"[^>]*src="([^"]+)"/);
  const videoThumbMatch = html.match(/class="tgme_widget_message_video_thumb"[^>]*style="([^"]+)"/);
  const videoUrl = videoSrcMatch?.[1] ?? null;
  const videoThumb = extractBgUrl(videoThumbMatch?.[1] ?? null);

  // File
  const fileNameMatch = html.match(/class="tgme_widget_message_document_title"[^>]*>([^<]+)</);
  const fileExtraMatch = html.match(/class="tgme_widget_message_document_extra"[^>]*>([^<]+)</);

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
      width: 0,
      height: 0,
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

import type { MessageData } from './types';

/** Escape HTML special characters for use inside element content */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert plain-text post body to a minimal HTML string suitable for the
 * Mastodon `content` field. Paragraph breaks (double newline) become <p>
 * tags; single newlines become <br>. Bare https:// URLs are linked.
 */
function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => {
      const inner = p
        .split('\n')
        .map(line => {
          const escaped = escHtml(line);
          // Auto-link bare https:// URLs
          return escaped.replace(
            /(https?:\/\/[^\s<>"()]+)/g,
            '<a href="$1">$1</a>',
          );
        })
        .join('<br>');
      return `<p>${inner}</p>`;
    })
    .join('');
}

export function buildMastodonStatus(msg: MessageData, origin: string): Record<string, unknown> {
  const telegramUrl = `https://t.me/${msg.channelUsername}/${msg.messageId}`;

  // Use pre-sanitized HTML from scraper (preserves <strong> title + <a> links).
  // For data cached before contentHtml was added, fall back to explicit title
  // handling so the bold opener is not lost.
  let contentHtml = msg.contentHtml;
  if (!contentHtml && msg.text) {
    if (msg.title) {
      contentHtml = `<p><strong>${escHtml(msg.title)}</strong></p>`;
      const body = msg.text.replace(msg.title, '').trimStart();
      if (body) contentHtml += textToHtml(body);
    } else {
      contentHtml = textToHtml(msg.text);
    }
  }

  // Media attachments
  const mediaAttachments: Record<string, unknown>[] = [];

  if (msg.video) {
    const w = msg.video.width || undefined;
    const h = msg.video.height || undefined;
    mediaAttachments.push({
      id: `${msg.channelUsername}_${msg.messageId}_video`,
      type: 'video',
      url: `${origin}/video/${msg.channelUsername}/${msg.messageId}`,
      preview_url: msg.video.thumbnailUrl || null,
      remote_url: null,
      preview_remote_url: null,
      text_url: null,
      description: null,
      blurhash: null,
      meta: {
        original: {
          ...(w ? { width: w } : {}),
          ...(h ? { height: h } : {}),
          ...(w && h ? { size: `${w}x${h}`, aspect: w / h } : {}),
        },
        focus: { x: 0.0, y: 0.0 },
      },
    });
  } else {
    msg.images.forEach((img, i) => {
      const w = img.width || undefined;
      const h = img.height || undefined;
      mediaAttachments.push({
        id: `${msg.channelUsername}_${msg.messageId}_img${i}`,
        type: 'image',
        url: img.url,
        preview_url: img.url,
        remote_url: null,
        preview_remote_url: null,
        text_url: null,
        description: img.altText ?? null,
        blurhash: null,
        meta: {
          original: {
            ...(w ? { width: w } : {}),
            ...(h ? { height: h } : {}),
            ...(w && h ? { size: `${w}x${h}`, aspect: w / h } : {}),
          },
          focus: { x: 0.0, y: 0.0 },
        },
      });
    });
  }

  return {
    id: String(msg.messageId),
    url: telegramUrl,
    uri: telegramUrl,
    created_at: msg.publishedAt ?? new Date().toISOString(),
    edited_at: null,
    reblog: null,
    in_reply_to_id: null,
    in_reply_to_account_id: null,
    language: null,
    content: contentHtml,
    spoiler_text: '',
    sensitive: false,
    visibility: 'public',
    replies_count: msg.commentsCount ?? 0,
    reblogs_count: 0,
    favourites_count: (msg.reactions ?? []).reduce((s, r) => s + r.count, 0),
    quotes_count: 0,
    account: {
      id: msg.channelUsername,
      display_name: msg.channelName,
      username: msg.channelUsername,
      acct: msg.channelUsername,
      note: '',
      url: `${origin}/@${msg.channelUsername}`,
      uri: `${origin}/users/${msg.channelUsername}`,
      created_at: null,
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      noindex: false,
      hide_collections: false,
      avatar: msg.channelAvatarUrl,
      avatar_static: msg.channelAvatarUrl,
      avatar_description: '',
      header: null,
      header_static: null,
      header_description: '',
      emojis: [],
      roles: [],
      fields: [],
    },
    media_attachments: mediaAttachments,
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
    application: null,
  };
}

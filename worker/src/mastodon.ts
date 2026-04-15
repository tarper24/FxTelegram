import type { MessageData } from './types';

/** FNV-1a 32-bit hash → stable numeric string for account.id */
function hashUsername(username: string): string {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < username.length; i++) {
    hash ^= username.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0; // FNV prime, 32-bit unsigned
  }
  return String(hash);
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function buildMastodonStatus(msg: MessageData, origin: string): Record<string, unknown> {
  const telegramUrl = `https://t.me/${msg.channelUsername}/${msg.messageId}`;

  const statsParts: string[] = [];
  if (msg.reactionsTotal > 0) {
    const emoji = msg.reactions.length > 0
      ? msg.reactions.slice(0, 3).map(r => r.emoji).join(' ')
      : '❤️';
    statsParts.push(`${emoji} ${formatCount(msg.reactionsTotal)}`);
  }
  if (msg.views !== null) statsParts.push(`👁️ ${formatCount(msg.views)}`);
  const statsHtml = statsParts.length > 0 ? `<p>${statsParts.join('&ensp;')}</p>` : '';
  const contentHtml = msg.contentHtml + statsHtml;

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
    favourites_count: msg.reactionsTotal,
    quotes_count: 0,
    account: {
      id: hashUsername(msg.channelUsername),
      display_name: msg.channelName,
      username: msg.channelUsername,
      acct: msg.channelUsername,
      note: '',
      url: telegramUrl,
      uri: telegramUrl,
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

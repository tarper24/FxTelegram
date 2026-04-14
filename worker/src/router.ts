import { LANG_CODE_RE, SUBDOMAINS, TELEGRAM_USERNAME_RE } from './constants';
import type { ContentType, ParsedRequest } from './types';

function parseFlags(hostname: string, search: URLSearchParams) {
  const parts = hostname.split('.');
  // fx-t.me has 2 parts, fxtelegram.me has 2, m.fxtelegram.me has 3
  const subdomain = parts.length >= 3 ? parts[0]!.toLowerCase() : null;

  return {
    forceMosaic: subdomain === SUBDOMAINS.MOSAIC || search.has('m') || search.has('mosaic'),
    directMedia: subdomain === SUBDOMAINS.DIRECT,
    textOnly: subdomain === SUBDOMAINS.TEXT,
    jsonApi: subdomain === SUBDOMAINS.API,
  };
}

function nullFields(): Omit<ParsedRequest, 'contentType' | 'flags'> {
  return {
    channelUsername: null,
    messageId: null,
    chatId: null,
    inviteHash: null,
    photoIndex: null,
    langCode: null,
    isPrivate: false,
  };
}

export function parseRequest(request: Request): ParsedRequest {
  const url = new URL(request.url);
  const flags = parseFlags(url.hostname, url.searchParams);
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { contentType: 'unknown', ...nullFields(), flags };
  }

  const first = segments[0]!;
  const decodedFirst = decodeURIComponent(first);

  // oEmbed endpoint (Discord Mastodon-compatible path)
  if (first === 'OwOembed') {
    return { contentType: 'oembed', ...nullFields(), flags };
  }

  // Mastodon/ActivityPub status API: /api/v1/statuses/:channel/:id
  if (
    first === 'api' &&
    segments[1] === 'v1' &&
    segments[2] === 'statuses' &&
    segments.length >= 5
  ) {
    const channel = segments[3]!;
    const id = segments[4]!;
    if (!TELEGRAM_USERNAME_RE.test(channel) || !/^\d+$/.test(id)) {
      return { contentType: 'unknown', ...nullFields(), flags };
    }
    return {
      contentType: 'mastodon-status',
      channelUsername: channel,
      messageId: parseInt(id, 10),
      chatId: null,
      inviteHash: null,
      photoIndex: null,
      langCode: null,
      isPrivate: false,
      flags,
    };
  }

  // Internal proxy: /video/channel/msgId
  if (first === 'video' && segments.length >= 3) {
    if (!/^\d+$/.test(segments[2]!)) return { contentType: 'unknown', ...nullFields(), flags };
    if (!TELEGRAM_USERNAME_RE.test(segments[1]!)) return { contentType: 'unknown', ...nullFields(), flags };
    const messageId = parseInt(segments[2]!, 10);
    return {
      contentType: 'video',
      channelUsername: segments[1]!,
      messageId,
      chatId: null,
      inviteHash: null,
      photoIndex: null,
      langCode: null,
      isPrivate: false,
      flags,
    };
  }

  // Internal proxy: /mosaic/channel/msgId
  if (first === 'mosaic' && segments.length >= 3) {
    if (!/^\d+$/.test(segments[2]!)) return { contentType: 'unknown', ...nullFields(), flags };
    if (!TELEGRAM_USERNAME_RE.test(segments[1]!)) return { contentType: 'unknown', ...nullFields(), flags };
    const messageId = parseInt(segments[2]!, 10);
    return {
      contentType: 'mosaic',
      channelUsername: segments[1]!,
      messageId,
      chatId: null,
      inviteHash: null,
      photoIndex: null,
      langCode: null,
      isPrivate: false,
      flags,
    };
  }

  // Private channel: /c/chatId/msgId
  if (first === 'c' && segments.length >= 3) {
    if (!/^\d+$/.test(segments[2]!)) return { contentType: 'unknown', ...nullFields(), flags };
    const messageId = parseInt(segments[2]!, 10);
    return {
      contentType: 'private-post',
      channelUsername: null,
      messageId,
      chatId: segments[1]!,
      inviteHash: null,
      photoIndex: null,
      langCode: null,
      isPrivate: true,
      flags,
    };
  }

  // Invite link: /+hash (also handles %2B-encoded +)
  if (decodedFirst.startsWith('+')) {
    return {
      contentType: 'invite',
      channelUsername: null,
      messageId: null,
      chatId: null,
      inviteHash: decodedFirst.slice(1),
      photoIndex: null,
      langCode: null,
      isPrivate: false,
      flags,
    };
  }

  // Public post: /channelname/msgId[/photo/N | /lang]
  if (segments.length >= 2 && /^\d+$/.test(segments[1]!)) {
    if (!TELEGRAM_USERNAME_RE.test(first)) return { contentType: 'unknown', ...nullFields(), flags };
    const channelUsername = first;
    const messageId = parseInt(segments[1]!, 10);
    let photoIndex: number | null = null;
    let langCode: string | null = null;

    if (segments[2] === 'photo' && segments[3]) {
      photoIndex = parseInt(segments[3], 10);
      if (isNaN(photoIndex)) photoIndex = null;
    } else if (segments[2] && LANG_CODE_RE.test(segments[2])) {
      langCode = segments[2];
    }

    return {
      contentType: 'post',
      channelUsername,
      messageId,
      chatId: null,
      inviteHash: null,
      photoIndex,
      langCode,
      isPrivate: false,
      flags,
    };
  }

  // Profile: /username (single segment, not a number)
  if (segments.length === 1 && !/^\d+$/.test(first)) {
    return {
      contentType: 'profile',
      channelUsername: first,
      messageId: null,
      chatId: null,
      inviteHash: null,
      photoIndex: null,
      langCode: null,
      isPrivate: false,
      flags,
    };
  }

  return { contentType: 'unknown', ...nullFields(), flags };
}

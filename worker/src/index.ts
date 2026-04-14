import { parseRequest } from './router';
import { getCached, setCache, postKey, videoKey, mosaicKey } from './cache';
import { scrapePost } from './scraper';
import { buildEmbed, buildOEmbedJson } from './embed';
import { handleVideoProxy } from './video';
import { buildMosaic } from './mosaic';
import { translateText } from './translate';
import { UA, TTL } from './constants';
import type { Env, MessageData } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const parsed = parseRequest(request);
    const ua = request.headers.get('User-Agent') ?? '';
    const isBot = UA.BOT.test(ua);
    const isDiscord = UA.DISCORD.test(ua);

    // ── Internal proxy: video stream ──────────────────────────────────────
    if (parsed.contentType === 'video' && parsed.channelUsername && parsed.messageId) {
      return handleVideoProxy(parsed.channelUsername, parsed.messageId, request, env);
    }

    // ── Internal proxy: mosaic image ──────────────────────────────────────
    if (parsed.contentType === 'mosaic' && parsed.channelUsername && parsed.messageId) {
      const cached = await getCached<Uint8Array>(env.KV, mosaicKey(parsed.channelUsername, parsed.messageId));
      if (cached) {
        return new Response(cached, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
      }
      const msgData = await fetchOrScrape(parsed.channelUsername, parsed.messageId, env, ctx);
      if (!msgData || msgData.images.length < 2) return new Response('Not found', { status: 404 });
      const mosaicBytes = await buildMosaic(msgData.images.map(i => i.url));
      ctx.waitUntil(setCache(env.KV, mosaicKey(parsed.channelUsername, parsed.messageId), mosaicBytes, TTL.MOSAIC));
      return new Response(mosaicBytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
    }

    // ── oEmbed endpoint ───────────────────────────────────────────────────
    if (parsed.contentType === 'oembed') {
      const url = new URL(request.url);
      const targetUrl = url.searchParams.get('url') ?? '';
      const match = targetUrl.match(/t\.me\/([^/]+)\/(\d+)/);
      if (!match) return new Response('Bad Request', { status: 400 });
      const [, ch, id] = match;
      const msg = await fetchOrScrape(ch!, parseInt(id!, 10), env, ctx);
      const json = buildOEmbedJson(ch!, msg?.channelName ?? ch!, parseInt(id!, 10));
      return new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Human browser redirect ────────────────────────────────────────────
    if (!isBot) {
      const telegramUrl = buildTelegramUrl(parsed);
      return telegramUrl
        ? Response.redirect(telegramUrl, 302)
        : new Response('Not Found', { status: 404 });
    }

    // ── Bot path: fetch message data ──────────────────────────────────────
    if (parsed.contentType !== 'post' || !parsed.channelUsername || !parsed.messageId) {
      return new Response('Not supported yet', { status: 404 });
    }

    let msg = await fetchOrScrape(parsed.channelUsername, parsed.messageId, env, ctx);

    if (!msg) {
      const fallback = buildFallbackEmbed(parsed.channelUsername, parsed.messageId);
      return htmlResponse(fallback);
    }

    // ── Path modifier: select specific photo ──────────────────────────────
    if (parsed.photoIndex !== null && msg.images.length > 0) {
      const idx = parsed.photoIndex - 1;
      const photo = msg.images[idx] ?? msg.images[0]!;
      msg = { ...msg, images: [photo], hasAlbum: false, video: null };
    }

    // ── Path modifier: translate ──────────────────────────────────────────
    if (parsed.langCode && msg.text) {
      msg = { ...msg, text: await translateText(msg.text, parsed.langCode) };
    }

    // ── Subdomain: direct media ───────────────────────────────────────────
    if (parsed.flags.directMedia) {
      const mediaUrl = msg.video?.url ?? msg.images[0]?.url;
      return mediaUrl ? Response.redirect(mediaUrl, 302) : new Response('No media', { status: 404 });
    }

    // ── Subdomain: JSON API ───────────────────────────────────────────────
    if (parsed.flags.jsonApi) {
      return new Response(JSON.stringify(msg), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Build embed HTML ──────────────────────────────────────────────────
    const html = buildEmbed(msg, {
      forceMosaic: parsed.flags.forceMosaic,
      textOnly: parsed.flags.textOnly,
      isDiscord,
    });

    return htmlResponse(html);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchOrScrape(
  channelUsername: string,
  messageId: number,
  env: Env,
  ctx: ExecutionContext
): Promise<MessageData | null> {
  const key = postKey(channelUsername, messageId);
  const cached = await getCached<MessageData>(env.KV, key);
  if (cached) return cached;

  const fresh = await scrapePost(channelUsername, messageId);
  if (fresh) {
    ctx.waitUntil(setCache(env.KV, key, fresh, TTL.POST));
    if (fresh.video?.url) {
      ctx.waitUntil(setCache(env.KV, videoKey(channelUsername, messageId), fresh.video.url, TTL.VIDEO));
    }
  }
  return fresh;
}

function buildTelegramUrl(parsed: ReturnType<typeof parseRequest>): string | null {
  if (parsed.channelUsername && parsed.messageId) {
    return `https://t.me/${parsed.channelUsername}/${parsed.messageId}`;
  }
  if (parsed.inviteHash) return `https://t.me/+${parsed.inviteHash}`;
  if (parsed.channelUsername) return `https://t.me/${parsed.channelUsername}`;
  return null;
}

function buildFallbackEmbed(channelUsername: string, messageId: number): string {
  const telegramUrl = `https://t.me/${channelUsername}/${messageId}`;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/>
<meta property="og:title" content="@${channelUsername}"/>
<meta property="og:description" content="View this post on Telegram"/>
<meta property="og:site_name" content="FxTelegram"/>
</head><body><a href="${telegramUrl}">View on Telegram</a></body></html>`;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}

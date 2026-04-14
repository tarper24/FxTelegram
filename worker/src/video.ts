import { getCached } from './cache';
import { videoKey } from './cache';
import { LIMITS } from './constants';
import type { Env } from './types';

export async function handleVideoProxy(
  channelUsername: string,
  messageId: number,
  request: Request,
  env: Env
): Promise<Response> {
  const cdnUrl = await getCached<string>(env.KV, videoKey(channelUsername, messageId));

  if (!cdnUrl) {
    return new Response('Video not found', { status: 404 });
  }

  // HEAD request to check file size
  const head = await fetch(cdnUrl, { method: 'HEAD' });
  const contentLength = parseInt(head.headers.get('Content-Length') ?? '0', 10);

  if (contentLength > LIMITS.VIDEO_REDIRECT_BYTES) {
    return Response.redirect(cdnUrl, 302);
  }

  // Forward Range header if present (enables seeking)
  const upstreamHeaders: Record<string, string> = {};
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  const upstream = await fetch(cdnUrl, { headers: upstreamHeaders });

  const responseHeaders = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=1800',
  });

  const contentRange = upstream.headers.get('Content-Range');
  if (contentRange) responseHeaders.set('Content-Range', contentRange);

  const upstreamLength = upstream.headers.get('Content-Length');
  if (upstreamLength) responseHeaders.set('Content-Length', upstreamLength);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

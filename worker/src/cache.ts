export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return kv.get<T>(key, 'json');
}

export async function setCache(kv: KVNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export async function getCachedBinary(kv: KVNamespace, key: string): Promise<Uint8Array | null> {
  const buf = await kv.get(key, 'arrayBuffer');
  return buf ? new Uint8Array(buf) : null;
}

export async function setCacheBinary(kv: KVNamespace, key: string, bytes: Uint8Array, ttlSeconds: number): Promise<void> {
  await kv.put(key, bytes, { expirationTtl: ttlSeconds });
}

export const postKey      = (ch: string, id: number) => `msg:${ch}:${id}`;
export const channelKey   = (ch: string)             => `chan:${ch}`;
export const videoKey     = (ch: string, id: number) => `video:${ch}:${id}`;
export const mosaicKey    = (ch: string, id: number) => `mosaic:${ch}:${id}`;
export const midRevKey = (mid: string) => `mpost:${mid}`; // mastodon ID → config

/**
 * Full configuration stored for each Mastodon status ID.
 * Encodes every parameter that affects the content of the status response so
 * that /api/v1/statuses/:id returns exactly the same data Discord embedded.
 */
export interface MastodonPostConfig {
  channelUsername: string;
  messageId: number;
  photoIndex: number | null; // 1-based; null = full album
  forceMosaic: boolean;
  textOnly: boolean;
  mediaCount: number;        // images.length + (video ? 1 : 0) at embed time
}

/**
 * Compute a deterministic 64-bit Mastodon-style numeric ID via FNV-1a 64-bit.
 * All embed parameters are folded in so different views of the same post produce
 * distinct IDs and distinct ActivityPub responses.
 *
 * Returns a decimal string (up to 20 digits), matching real Mastodon's format.
 * The same inputs always produce the same ID — no KV read required.
 */
export function computeMastodonId(cfg: MastodonPostConfig): string {
  const { channelUsername, messageId, photoIndex, forceMosaic, textOnly, mediaCount } = cfg;
  const input = [
    channelUsername,
    messageId,
    photoIndex ?? 0,
    forceMosaic ? 1 : 0,
    textOnly ? 1 : 0,
    mediaCount,
  ].join(':');

  // FNV-1a 64-bit — offset basis and prime from the FNV spec
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString();
}

/** Retrieve the config stored for a Mastodon ID. */
export async function getMastodonPost(kv: KVNamespace, mid: string): Promise<MastodonPostConfig | null> {
  return kv.get<MastodonPostConfig>(midRevKey(mid), 'json');
}

/** Persist the reverse mapping (mastodon ID → config) with no TTL. */
export async function storeMastodonPost(kv: KVNamespace, mid: string, cfg: MastodonPostConfig): Promise<void> {
  await kv.put(midRevKey(mid), JSON.stringify(cfg));
}

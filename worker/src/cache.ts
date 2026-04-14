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
export const midRevKey = (mid: string) => `mpost:${mid}`; // mastodon ID → (channel, post)

/**
 * Compute a deterministic 64-bit Mastodon-style numeric ID for a (channel, messageId)
 * pair using FNV-1a. Returns a decimal string (up to 20 digits) matching the format
 * real Mastodon uses for status IDs.
 *
 * Deterministic: same inputs always produce the same ID — no KV read required.
 * A reverse mapping (midRevKey) is stored separately so we can resolve incoming
 * ActivityPub requests back to the original (channel, messageId).
 */
export function computeMastodonId(ch: string, id: number): string {
  // FNV-1a 64-bit — offset basis and prime from the FNV spec
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = (1n << 64n) - 1n;
  const input = `${ch}:${id}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString();
}

/** Retrieve the (channelUsername, messageId) stored for a Mastodon ID. */
export async function getMastodonPost(kv: KVNamespace, mid: string): Promise<{ channelUsername: string; messageId: number } | null> {
  return kv.get<{ channelUsername: string; messageId: number }>(midRevKey(mid), 'json');
}

/** Persist the reverse mapping (mastodon ID → channel/post) with no TTL. */
export async function storeMastodonPost(kv: KVNamespace, mid: string, ch: string, id: number): Promise<void> {
  await kv.put(midRevKey(mid), JSON.stringify({ channelUsername: ch, messageId: id }));
}

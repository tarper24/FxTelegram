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

export const postKey    = (ch: string, id: number) => `msg:${ch}:${id}`;
export const channelKey = (ch: string)             => `chan:${ch}`;
export const videoKey   = (ch: string, id: number) => `video:${ch}:${id}`;
export const mosaicKey  = (ch: string, id: number) => `mosaic:${ch}:${id}`;

export async function getCached<T>(kv: KVNamespace, key: string): Promise<T | null> {
  return kv.get<T>(key, 'json');
}

export async function setCache(kv: KVNamespace, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
}

export const postKey    = (ch: string, id: number) => `msg:${ch}:${id}`;
export const channelKey = (ch: string)             => `chan:${ch}`;
export const videoKey   = (ch: string, id: number) => `video:${ch}:${id}`;
export const mosaicKey  = (ch: string, id: number) => `mosaic:${ch}:${id}`;

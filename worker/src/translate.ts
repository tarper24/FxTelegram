interface MyMemoryResponse {
  responseStatus: number;
  responseData: { translatedText: string };
}

/**
 * Translate `text` to `targetLang` (ISO 639-1 code, e.g. "en", "fr").
 * Source language is auto-detected by MyMemory.
 * Returns the original text if translation fails for any reason.
 * Optionally caches results in KV (TTL: 3600s).
 */
export async function translateText(text: string, targetLang: string, kv?: KVNamespace): Promise<string> {
  const textToTranslate = text.length > 500 ? text.slice(0, 497) + '...' : text;
  const cacheKey = `tr:${targetLang}:${text.slice(0, 50)}`;

  if (kv) {
    const cached = await kv.get(cacheKey, 'text');
    if (cached !== null) return cached;
  }

  try {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', textToTranslate);
    url.searchParams.set('langpair', `auto|${targetLang}`);

    const res = await fetch(url.toString());
    if (!res.ok) return text;
    const json: MyMemoryResponse = await res.json();

    if (json.responseStatus !== 200) return text;
    const translated = json.responseData?.translatedText || text;

    if (kv) {
      await kv.put(cacheKey, translated, { expirationTtl: 3600 });
    }

    return translated;
  } catch {
    return text;
  }
}

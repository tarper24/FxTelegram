interface MyMemoryResponse {
  responseStatus: number;
  responseData: { translatedText: string };
}

/**
 * Translate `text` to `targetLang` (ISO 639-1 code, e.g. "en", "fr").
 * Source language is auto-detected by MyMemory.
 * Returns the original text if translation fails for any reason.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  try {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `auto|${targetLang}`);

    const res = await fetch(url.toString());
    if (!res.ok) return text;
    const json: MyMemoryResponse = await res.json();

    if (json.responseStatus !== 200) return text;
    return json.responseData?.translatedText || text;
  } catch {
    return text;
  }
}

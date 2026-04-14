import { describe, it, expect, vi, afterEach } from 'vitest';
import { translateText } from '../src/translate';

afterEach(() => vi.restoreAllMocks());

function mockMyMemory(translatedText: string, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ responseStatus: status, responseData: { translatedText } }), {
      headers: { 'Content-Type': 'application/json' },
    })
  ));
}

describe('translateText', () => {
  it('returns translated text on success', async () => {
    mockMyMemory('Hello world');
    const result = await translateText('Привет мир', 'en');
    expect(result).toBe('Hello world');
  });

  it('calls MyMemory API with correct params', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'hi' } }))
    );
    vi.stubGlobal('fetch', fetchSpy);
    await translateText('Bonjour', 'en');
    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.hostname).toBe('api.mymemory.translated.net');
    expect(calledUrl.searchParams.get('q')).toBe('Bonjour');
    expect(calledUrl.searchParams.get('langpair')).toContain('en');
  });

  it('returns original text when API returns non-200 status', async () => {
    mockMyMemory('', 429);
    const result = await translateText('Привет', 'en');
    expect(result).toBe('Привет');
  });

  it('returns original text when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
    const result = await translateText('Привет', 'en');
    expect(result).toBe('Привет');
  });

  it('truncates input over 500 chars before sending to API', async () => {
    const longText = 'x'.repeat(600);
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'translated' } }))
    );
    vi.stubGlobal('fetch', fetchSpy);
    await translateText(longText, 'en');
    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    const sentText = calledUrl.searchParams.get('q') ?? '';
    expect(sentText.length).toBeLessThanOrEqual(500);
  });
});

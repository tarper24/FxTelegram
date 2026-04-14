import { describe, it, expect } from 'vitest';
import { parseRequest } from '../src/router';

describe('parseRequest', () => {
  const req = (url: string) => new Request(url);

  it('parses a standard public post', () => {
    const r = parseRequest(req('https://fxtelegram.me/durov/123'));
    expect(r.contentType).toBe('post');
    expect(r.channelUsername).toBe('durov');
    expect(r.messageId).toBe(123);
    expect(r.flags.forceMosaic).toBe(false);
    expect(r.flags.directMedia).toBe(false);
    expect(r.flags.textOnly).toBe(false);
    expect(r.flags.jsonApi).toBe(false);
    expect(r.langCode).toBeNull();
    expect(r.photoIndex).toBeNull();
  });

  it('parses m. subdomain as forceMosaic', () => {
    const r = parseRequest(req('https://m.fxtelegram.me/durov/123'));
    expect(r.flags.forceMosaic).toBe(true);
    expect(r.channelUsername).toBe('durov');
  });

  it('parses ?m query flag as forceMosaic', () => {
    const r = parseRequest(req('https://fxtelegram.me/durov/123?m'));
    expect(r.flags.forceMosaic).toBe(true);
  });

  it('parses ?mosaic query flag as forceMosaic', () => {
    const r = parseRequest(req('https://fxtelegram.me/durov/123?mosaic'));
    expect(r.flags.forceMosaic).toBe(true);
  });

  it('parses d. subdomain as directMedia', () => {
    const r = parseRequest(req('https://d.fxtelegram.me/durov/123'));
    expect(r.flags.directMedia).toBe(true);
  });

  it('parses t. subdomain as textOnly', () => {
    const r = parseRequest(req('https://t.fxtelegram.me/durov/123'));
    expect(r.flags.textOnly).toBe(true);
  });

  it('parses api. subdomain as jsonApi', () => {
    const r = parseRequest(req('https://api.fxtelegram.me/durov/123'));
    expect(r.flags.jsonApi).toBe(true);
  });

  it('parses language path modifier', () => {
    const r = parseRequest(req('https://fxtelegram.me/durov/123/fr'));
    expect(r.langCode).toBe('fr');
    expect(r.photoIndex).toBeNull();
  });

  it('parses /photo/N path modifier', () => {
    const r = parseRequest(req('https://fxtelegram.me/durov/123/photo/2'));
    expect(r.photoIndex).toBe(2);
    expect(r.langCode).toBeNull();
  });

  it('parses /video/ proxy path', () => {
    const r = parseRequest(req('https://fxtelegram.me/video/durov/123'));
    expect(r.contentType).toBe('video');
    expect(r.channelUsername).toBe('durov');
    expect(r.messageId).toBe(123);
  });

  it('parses /mosaic/ proxy path', () => {
    const r = parseRequest(req('https://fxtelegram.me/mosaic/durov/123'));
    expect(r.contentType).toBe('mosaic');
    expect(r.channelUsername).toBe('durov');
    expect(r.messageId).toBe(123);
  });

  it('parses private channel post /c/chatID/msgID', () => {
    const r = parseRequest(req('https://fxtelegram.me/c/-100123456/789'));
    expect(r.contentType).toBe('private-post');
    expect(r.chatId).toBe('-100123456');
    expect(r.messageId).toBe(789);
    expect(r.isPrivate).toBe(true);
  });

  it('parses invite link /+hash', () => {
    const r = parseRequest(req('https://fxtelegram.me/+AbCdEfGh'));
    expect(r.contentType).toBe('invite');
    expect(r.inviteHash).toBe('AbCdEfGh');
  });

  it('parses %2B-encoded invite link /%2BAbCdEfGh', () => {
    const r = parseRequest(req('https://fxtelegram.me/%2BAbCdEfGh'));
    expect(r.contentType).toBe('invite');
    expect(r.inviteHash).toBe('AbCdEfGh');
  });

  it('parses oEmbed endpoint', () => {
    const r = parseRequest(req('https://fxtelegram.me/oembed?url=https://t.me/durov/1'));
    expect(r.contentType).toBe('oembed');
  });

  it('parses profile /username', () => {
    const r = parseRequest(req('https://fxtelegram.me/telegram'));
    expect(r.contentType).toBe('profile');
    expect(r.channelUsername).toBe('telegram');
  });

  it('works on fx-t.me domain', () => {
    const r = parseRequest(req('https://fx-t.me/durov/123'));
    expect(r.contentType).toBe('post');
    expect(r.channelUsername).toBe('durov');
  });

  it('works on m.fx-t.me domain', () => {
    const r = parseRequest(req('https://m.fx-t.me/durov/123'));
    expect(r.flags.forceMosaic).toBe(true);
  });

  it('parses fixupt.me domain', () => {
    const r = parseRequest(req('https://fixupt.me/durov/123'));
    expect(r.contentType).toBe('post');
    expect(r.channelUsername).toBe('durov');
  });
});

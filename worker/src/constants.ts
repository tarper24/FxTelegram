export const UA = {
  /** User-agents that support native multi-image gallery via multiple og:image tags */
  DISCORD: /discordbot\//i,
  /** Any bot/crawler that should receive embed HTML instead of a redirect */
  BOT: /discordbot\/|slackbot|twitterbot|facebookexternalhit|telegrambot|linkedinbot|whatsapp\/|applebot|iframely/i,
};

/** CF KV TTL values in seconds */
export const TTL = {
  POST: 60 * 60,           // 1 hour — post content
  CHANNEL: 60 * 60 * 24,  // 24 hours — channel name/avatar
  VIDEO: 60 * 30,          // 30 minutes — Telegram CDN video URLs expire
  MOSAIC: 60 * 60,         // 1 hour — composited mosaic images
  TRANSLATE: 60 * 60,      // 1 hour — translated post text
} as const;

/** Size/count limits */
export const LIMITS = {
  VIDEO_REDIRECT_BYTES: 100 * 1024 * 1024,  // 100 MB
  MAX_ALBUM_IMAGES: 10,                       // cap mosaic/gallery at 10 images
  MAX_MOSAIC_IMAGES: 7,                       // max images composited into one mosaic
  MOSAIC_CELL_W: 600,                         // width per cell in mosaic grid
  MOSAIC_CELL_H: 400,                         // height per cell in mosaic grid
} as const;

/** ISO 639-1 two-letter codes recognised as language path modifiers */
export const LANG_CODE_RE = /^[a-z]{2}$/;

/** Valid Telegram public username: 5–32 chars, starts with a letter, alphanumeric + underscores only */
export const TELEGRAM_USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;

/** Subdomains that trigger special modes */
export const SUBDOMAINS = {
  MOSAIC: 'm',
  DIRECT: 'd',
  TEXT: 't',
  API: 'api',
} as const;

export type ContentType =
  | 'post'
  | 'private-post'
  | 'invite'
  | 'profile'
  | 'video'
  | 'mosaic'
  | 'oembed'
  | 'unknown';

export interface ParsedRequest {
  contentType: ContentType;
  channelUsername: string | null;
  messageId: number | null;
  chatId: string | null;
  inviteHash: string | null;
  photoIndex: number | null;
  langCode: string | null;
  isPrivate: boolean;
  flags: {
    forceMosaic: boolean;
    directMedia: boolean;
    textOnly: boolean;
    jsonApi: boolean;
  };
}

export interface ImageData {
  url: string;
  width: number;
  height: number;
  altText?: string;
}

export interface VideoData {
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
}

export interface FileData {
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export interface MessageData {
  channelUsername: string;
  channelName: string;
  channelAvatarUrl: string | null;
  messageId: number;
  publishedAt: string | null; // ISO 8601 from <time datetime="...">
  text: string;
  images: ImageData[];
  video: VideoData | null;
  file: FileData | null;
  hasAlbum: boolean;
}

export interface Env {
  KV: KVNamespace;
  VPS_API_URL?: string;
  VPS_API_SECRET?: string;
}

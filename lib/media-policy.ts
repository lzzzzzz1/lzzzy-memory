import type { MediaKind } from "./types";

export type MediaPolicy = {
  maxImages: number;
  maxVideos: number;
  maxImageBytes: number;
  maxVideoBytes: number;
};

export const DEFAULT_MEDIA_POLICY: MediaPolicy = {
  maxImages: 20,
  maxVideos: 2,
  maxImageBytes: 20 * 1024 * 1024,
  maxVideoBytes: 512 * 1024 * 1024,
};

const MIME_KIND: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
};

const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export function resolveMediaType(file?: File | null): string | null {
  if (!file?.size) return null;
  const declaredType = file.type.toLowerCase();
  if (MIME_KIND[declaredType]) return declaredType;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[extension] ?? null;
}

export function mediaKindForType(mimeType: string): MediaKind | null {
  return MIME_KIND[mimeType] ?? null;
}

export function extensionForType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/webm") return "webm";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

export function validateMediaFiles(files: File[], policy: MediaPolicy = DEFAULT_MEDIA_POLICY): void {
  let images = 0;
  let videos = 0;

  for (const file of files) {
    const mimeType = resolveMediaType(file);
    const kind = mimeType ? mediaKindForType(mimeType) : null;
    if (!mimeType || !kind) throw new Error("UNSUPPORTED_MEDIA");
    if (kind === "image") {
      images += 1;
      if (file.size > policy.maxImageBytes) throw new Error("IMAGE_TOO_LARGE");
    } else {
      videos += 1;
      if (file.size > policy.maxVideoBytes) throw new Error("VIDEO_TOO_LARGE");
    }
  }

  if (images > policy.maxImages) throw new Error("IMAGE_LIMIT_EXCEEDED");
  if (videos > policy.maxVideos) throw new Error("VIDEO_LIMIT_EXCEEDED");
}

import { openImage } from "@/images";

/** Longest side of a thumbnail, in pixels. */
const THUMBNAIL_SIZE = 256;

export const THUMBNAIL_MIME_TYPE = "image/webp";

/**
 * Re-encodes an image as a WebP that fits `THUMBNAIL_SIZE`, turned upright
 * and never enlarged. sharp writes no metadata unless asked, so the output
 * has no EXIF, GPS, or ICC profile.
 */
export async function encodeThumbnail(
  content: Buffer,
  mimeType: string
): Promise<Buffer> {
  const image = await openImage(content, mimeType);
  return image
    .rotate()
    .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
}

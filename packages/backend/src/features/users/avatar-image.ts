import { AVATAR_MIME_TYPES, AvatarMimeType } from "@homesplit/contracts";
import { fileTypeFromBuffer } from "file-type";
import { AppError } from "@/http/app-error";
import { openImage } from "@/images";

/** Width and height of every stored avatar, in pixels. */
export const AVATAR_SIZE = 512;

const unsupportedType = (): AppError =>
  new AppError(415, "UNSUPPORTED_FILE_TYPE", "Unsupported file type", {
    allowed: AVATAR_MIME_TYPES,
  });

/**
 * Re-encodes an upload as a square WebP of `AVATAR_SIZE`, cropped to its
 * center and turned upright. sharp writes no metadata unless asked, so the
 * output has no EXIF, GPS, or ICC profile.
 */
export async function encodeAvatar(content: Buffer): Promise<Buffer> {
  // Detected from the content; the type the client declared is ignored.
  const detected = await fileTypeFromBuffer(content).catch(() => undefined);
  const type = AvatarMimeType.safeParse(detected?.mime);
  // Content that can't be decoded as its type is a bad file too.
  const output = type.success
    ? await reencode(content, type.data).catch(() => undefined)
    : undefined;
  if (!output) {
    throw unsupportedType();
  }
  return output;
}

async function reencode(
  content: Buffer,
  type: AvatarMimeType
): Promise<Buffer> {
  const image = await openImage(content, type);
  return image
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp()
    .toBuffer();
}

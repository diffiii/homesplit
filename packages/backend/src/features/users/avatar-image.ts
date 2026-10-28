import { AVATAR_MIME_TYPES, AvatarMimeType } from "@homesplit/contracts";
import { fileTypeFromBuffer } from "file-type";
import { all as decodeHeicImages } from "heic-decode";
import sharp, { type Sharp } from "sharp";
import { AppError } from "@/http/app-error";

/** Width and height of every stored avatar, in pixels. */
export const AVATAR_SIZE = 512;

/** So a small file can't decode into gigabytes. Fits a 48 MP phone photo. */
const MAX_INPUT_PIXELS = 50_000_000;

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
  const image =
    type === "image/heic"
      ? await decodeHeic(content)
      : sharp(content, { limitInputPixels: MAX_INPUT_PIXELS });
  return image
    .rotate()
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover" })
    .webp()
    .toBuffer();
}

/** sharp's prebuilt binaries can't decode HEIC, so libheif (WebAssembly) does. */
async function decodeHeic(content: Buffer): Promise<Sharp> {
  const images = await decodeHeicImages({ buffer: content });
  try {
    const [primary] = images;
    // Checked before decoding, which allocates every pixel at once.
    if (!primary || primary.width * primary.height > MAX_INPUT_PIXELS) {
      throw new Error("Unsupported HEIC image");
    }
    const { width, height, data } = await primary.decode();
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
      raw: { width, height, channels: 4 },
    });
  } finally {
    images.dispose();
  }
}

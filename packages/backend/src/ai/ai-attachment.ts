import type { AttachmentMimeType } from "@homesplit/contracts";
import { AppError } from "@/http/app-error";
import { openImage } from "@/images";
import type { AiInput } from "./ai-client";

/** Long edge of images sent to the vision model, enough for a receipt's small print. */
const MAX_IMAGE_EDGE = 2048;

/**
 * Turns a stored attachment into model input. A PDF goes as it is. An image
 * is turned upright, shrunk to `MAX_IMAGE_EDGE`, and re-encoded as JPEG,
 * which every vision model reads (HEIC included) and which drops EXIF and GPS
 * metadata.
 */
export async function attachmentInput(
  content: Buffer,
  mimeType: AttachmentMimeType
): Promise<AiInput> {
  if (mimeType === "application/pdf") {
    return { type: "file", mimeType, data: content };
  }
  // Content that can't be decoded as its type is a bad file.
  const data = await toJpeg(content, mimeType).catch(() => undefined);
  if (!data) {
    throw new AppError(
      415,
      "UNSUPPORTED_FILE_TYPE",
      "The attachment can't be read as an image"
    );
  }
  return { type: "image", mimeType: "image/jpeg", data };
}

async function toJpeg(content: Buffer, mimeType: string): Promise<Buffer> {
  const image = await openImage(content, mimeType);
  return image
    .rotate()
    .resize(MAX_IMAGE_EDGE, MAX_IMAGE_EDGE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

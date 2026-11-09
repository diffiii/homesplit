import { all as decodeHeicImages } from "heic-decode";
import sharp, { type Sharp } from "sharp";

/** So a small file can't decode into gigabytes. Fits a 48 MP phone photo. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Opens an image of a type detected from its content. Decoding is lazy for
 * everything but HEIC, so content that isn't a valid image may only fail once
 * the result is encoded.
 */
export function openImage(content: Buffer, mimeType: string): Promise<Sharp> {
  return mimeType === "image/heic"
    ? decodeHeic(content)
    : Promise.resolve(sharp(content, { limitInputPixels: MAX_INPUT_PIXELS }));
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

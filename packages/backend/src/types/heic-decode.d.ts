declare module "heic-decode" {
  interface HeicImage {
    /** RGBA pixels, four bytes each. */
    decode: () => Promise<{
      data: Uint8ClampedArray;
      height: number;
      width: number;
    }>;
    height: number;
    width: number;
  }

  /** Reads every image's size without decoding it; throws for non-HEIF. */
  export function all(input: {
    buffer: Uint8Array;
  }): Promise<HeicImage[] & { dispose: () => void }>;
}

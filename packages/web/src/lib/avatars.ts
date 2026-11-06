import {
  AVATAR_MIME_TYPES,
  type AvatarMimeType,
  DEFAULT_AVATAR_MAX_BYTES,
} from "@homesplit/contracts";
import type { Area } from "react-easy-crop";
import { isApiRequestError } from "./api/api-error";
import { errorMessage } from "./api/error-message";
import { attachmentTypeOf, tooLargeMessage } from "./attachments";

/** Match the backend's `AVATAR_MAX_BYTES` with `NEXT_PUBLIC_AVATAR_MAX_BYTES` when it isn't the default. */
export const AVATAR_MAX_BYTES =
  Number(process.env.NEXT_PUBLIC_AVATAR_MAX_BYTES) || DEFAULT_AVATAR_MAX_BYTES;

const UNSUPPORTED_TYPE =
  "This type of image isn't supported. Use JPEG, PNG, WebP, or HEIC.";

/** The size the backend stores avatars at. */
const AVATAR_SIZE = 512;

export function avatarTypeOf(
  file: Pick<File, "name" | "type">
): AvatarMimeType | null {
  const type = attachmentTypeOf(file);
  return AVATAR_MIME_TYPES.find((allowed) => allowed === type) ?? null;
}

/** Why `file` can't be an avatar, or `null` when it can. */
export function avatarFileError(
  file: Pick<File, "name" | "size" | "type">
): string | null {
  if (!avatarTypeOf(file)) {
    return UNSUPPORTED_TYPE;
  }
  return file.size > AVATAR_MAX_BYTES
    ? tooLargeMessage(AVATAR_MAX_BYTES)
    : null;
}

export function avatarUploadErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.status === 413) {
    return tooLargeMessage(AVATAR_MAX_BYTES);
  }
  if (isApiRequestError(error) && error.status === 415) {
    return UNSUPPORTED_TYPE;
  }
  return errorMessage(error);
}

/** The `area` of a loaded image, as WebP, or PNG where the browser can't write WebP. */
export async function croppedAvatar(
  image: HTMLImageElement,
  area: Area
): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas isn't available");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE
  );
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9)
  );
  if (!blob) {
    throw new Error("Couldn't encode the image");
  }
  return new File([blob], "avatar", { type: blob.type });
}

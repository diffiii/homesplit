import { DEFAULT_AVATAR_MAX_BYTES } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api/api-error";
import {
  AVATAR_MAX_BYTES,
  avatarFileError,
  avatarTypeOf,
  avatarUploadErrorMessage,
} from "./avatars";

const file = (name: string, type: string, size = 1024) => ({
  name,
  type,
  size,
});

describe("avatarTypeOf", () => {
  it("goes by the MIME type, then the extension", () => {
    expect(avatarTypeOf(file("me.png", "image/png"))).toBe("image/png");
    expect(avatarTypeOf(file("IMG_0001.HEIC", ""))).toBe("image/heic");
  });

  it("rejects PDFs and other types", () => {
    expect(avatarTypeOf(file("scan.pdf", "application/pdf"))).toBeNull();
    expect(avatarTypeOf(file("anim.gif", "image/gif"))).toBeNull();
  });
});

describe("avatarFileError", () => {
  it("accepts images up to the limit", () => {
    expect(AVATAR_MAX_BYTES).toBe(DEFAULT_AVATAR_MAX_BYTES);
    expect(
      avatarFileError(file("me.jpg", "image/jpeg", AVATAR_MAX_BYTES))
    ).toBeNull();
  });

  it("explains a wrong type and a large file", () => {
    expect(avatarFileError(file("scan.pdf", "application/pdf"))).toBe(
      "This type of image isn't supported. Use JPEG, PNG, WebP, or HEIC."
    );
    expect(
      avatarFileError(file("me.jpg", "image/jpeg", AVATAR_MAX_BYTES + 1))
    ).toBe("This file is too large. Files can be up to 10 MB.");
  });
});

describe("avatarUploadErrorMessage", () => {
  it("explains what the server rejected", () => {
    expect(
      avatarUploadErrorMessage(
        ApiRequestError.fromBody("api", 415, {
          code: "UNSUPPORTED_FILE_TYPE",
          message: "Unsupported file type",
        })
      )
    ).toBe("This type of image isn't supported. Use JPEG, PNG, WebP, or HEIC.");
    expect(
      avatarUploadErrorMessage(
        ApiRequestError.fromBody("api", 413, {
          code: "PAYLOAD_TOO_LARGE",
          message: "Request body is too large",
        })
      )
    ).toBe("This file is too large. Files can be up to 10 MB.");
  });
});

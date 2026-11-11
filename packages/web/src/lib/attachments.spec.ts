import { DEFAULT_ATTACHMENT_MAX_BYTES } from "@homesplit/contracts";
import { describe, expect, it } from "vitest";
import { ApiRequestError } from "./api/api-error";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  attachErrorMessage,
  attachmentFileError,
  attachmentTypeOf,
  formatFileSize,
  isImageType,
  uploadErrorMessage,
} from "./attachments";

const file = (name: string, type: string, size = 1024) => ({
  name,
  type,
  size,
});

describe("attachmentTypeOf", () => {
  it("goes by the MIME type, then the extension", () => {
    expect(attachmentTypeOf(file("scan", "application/pdf"))).toBe(
      "application/pdf"
    );
    expect(attachmentTypeOf(file("IMG_0001.HEIC", ""))).toBe("image/heic");
    expect(
      attachmentTypeOf(file("photo.jpg", "application/octet-stream"))
    ).toBe("image/jpeg");
  });

  it("rejects other types", () => {
    expect(attachmentTypeOf(file("anim.gif", "image/gif"))).toBeNull();
    expect(attachmentTypeOf(file("notes", ""))).toBeNull();
  });
});

describe("attachmentFileError", () => {
  it("accepts allowed files up to the limit", () => {
    expect(
      attachmentFileError(
        file("receipt.png", "image/png", ATTACHMENT_MAX_BYTES)
      )
    ).toBeNull();
  });

  it("explains a type, size, or empty file the backend would refuse", () => {
    expect(attachmentFileError(file("anim.gif", "image/gif"))).toBe(
      "This type of file isn't supported. Use JPEG, PNG, WebP, HEIC, or PDF."
    );
    expect(
      attachmentFileError(
        file("big.pdf", "application/pdf", ATTACHMENT_MAX_BYTES + 1)
      )
    ).toBe("This file is too large. Files can be up to 10 MB.");
    expect(attachmentFileError(file("empty.pdf", "application/pdf", 0))).toBe(
      "This file is empty."
    );
  });

  it("defaults to the backend's default limit", () => {
    expect(ATTACHMENT_MAX_BYTES).toBe(DEFAULT_ATTACHMENT_MAX_BYTES);
  });
});

describe("ATTACHMENT_ACCEPT", () => {
  it("lists the allowed MIME types and extensions", () => {
    expect(ATTACHMENT_ACCEPT.split(",")).toEqual(
      expect.arrayContaining([
        "image/heic",
        ".heic",
        "application/pdf",
        ".jpeg",
      ])
    );
  });
});

describe("uploadErrorMessage", () => {
  it("explains the file the server refused", () => {
    expect(
      uploadErrorMessage(ApiRequestError.fromBody("api", 413, undefined))
    ).toBe("This file is too large. Files can be up to 10 MB.");
    expect(
      uploadErrorMessage(
        ApiRequestError.fromBody("api", 415, {
          code: "UNSUPPORTED_FILE_TYPE",
          message: "Unsupported file type",
        })
      )
    ).toBe(
      "This type of file isn't supported. Use JPEG, PNG, WebP, HEIC, or PDF."
    );
  });

  it("falls back to the shared messages", () => {
    expect(
      uploadErrorMessage(ApiRequestError.network("api", new Error("offline")))
    ).toBe("Couldn't reach HomeSplit. Check your connection and try again.");
  });
});

describe("attachErrorMessage", () => {
  const limitReached = (details?: unknown) =>
    ApiRequestError.fromBody("api", 409, {
      code: "EXPENSE_ATTACHMENT_LIMIT_REACHED",
      message: "Limit reached",
      details,
    });

  it("says the limit when the expense has as many files as it can", () => {
    expect(attachErrorMessage(limitReached({ limit: 10 }))).toBe(
      "An expense can have up to 10 files."
    );
    expect(attachErrorMessage(limitReached())).toBe(
      "This expense can't have any more files."
    );
  });

  it("falls back to the shared messages", () => {
    expect(
      attachErrorMessage(
        ApiRequestError.fromBody("api", 403, {
          code: "MODULE_DISABLED",
          message: "Disabled",
        })
      )
    ).toBe(
      "This module is turned off for the household. An admin can turn it back on in settings."
    );
  });
});

describe("isImageType", () => {
  it("is true for images only", () => {
    expect(isImageType("image/heic")).toBe(true);
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType(null)).toBe(false);
  });
});

describe("formatFileSize", () => {
  it("counts 1024 bytes to a KB", () => {
    expect(formatFileSize(512, "en")).toBe("0.5 kB");
    expect(formatFileSize(1536 * 1024, "en")).toBe("1.5 MB");
    expect(formatFileSize(DEFAULT_ATTACHMENT_MAX_BYTES, "en")).toBe("10 MB");
    expect(formatFileSize(250 * 1024, "en")).toBe("250 kB");
  });
});

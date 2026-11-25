import { describe, expect, it } from "vitest";
import { ATTACHMENT_MIME_TYPES, isImageType } from ".";

describe("isImageType", () => {
  it("is true for images only", () => {
    expect(ATTACHMENT_MIME_TYPES.filter(isImageType)).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
    ]);
    expect(isImageType(null)).toBe(false);
  });
});

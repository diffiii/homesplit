import { describe, expect, it } from "vitest";

import { Emoji } from "./emoji";

describe("Emoji", () => {
  it.each([
    ["pictograph", "🛒"],
    ["text symbol with presentation selector", "❤️"],
    ["skin tone", "👍🏽"],
    ["joined sequence", "👨‍👩‍👧"],
    ["joined sequence with selectors", "🏳️‍🌈"],
    ["flag", "🇵🇱"],
    ["subdivision flag", "🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
    ["keycap", "1️⃣"],
  ])("accepts a %s", (_, value) => {
    expect(Emoji.safeParse(value).success).toBe(true);
  });

  it.each([
    ["an empty string", ""],
    ["text", "cart"],
    ["a digit", "1"],
    ["two emoji", "🛒🛒"],
    ["an emoji with text", "🛒 shop"],
    ["surrounding whitespace", " 🛒"],
    ["half a flag", "🇵"],
    ["a lone skin tone", "🏽"],
    ["a dangling joiner", "👨\u200D"],
    ["an overlong joined sequence", "🛒\u200D".repeat(12).slice(0, -1)],
  ])("rejects %s", (_, value) => {
    expect(Emoji.safeParse(value).success).toBe(false);
  });
});

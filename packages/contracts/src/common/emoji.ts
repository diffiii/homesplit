import { z } from "zod";

// A flag, a keycap, or a pictograph with an optional presentation selector or
// skin tone, and an optional subdivision tag (🏴󠁧󠁢󠁳󠁣󠁴󠁿).
const ELEMENT =
  "(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:[\\u{E0020}-\\u{E007E}]+\\u{E007F})?)";

// Elements joined by zero-width joiners render as one emoji (👨‍👩‍👧).
const SINGLE_EMOJI = new RegExp(`^${ELEMENT}(?:\\u200D${ELEMENT})*$`, "u");

/** In code points, as Zod counts them; the longest emoji today has 10. */
const MAX_EMOJI_LENGTH = 16;

/**
 * Exactly one emoji, as the user sees it. `Extended_Pictographic` also covers
 * code points reserved for future emoji, so one added by a newer keyboard
 * passes on an older runtime.
 */
export const Emoji = z
  .string()
  .max(MAX_EMOJI_LENGTH)
  .regex(SINGLE_EMOJI, "Must be a single emoji");
export type Emoji = z.infer<typeof Emoji>;

const WORD_SEPARATOR = /[\s\-_.]+/u;

/**
 * Up to two letters for an avatar without a picture: the first letters of the
 * first and last words, so `Anna Maria Nowak` is `AN`. Whole characters, so a
 * name starting with an emoji or an accented letter isn't cut in half.
 */
export function initials(name: string): string {
  const words = name.trim().split(WORD_SEPARATOR).filter(Boolean);
  const first = words.at(0);
  if (!first) {
    return "?";
  }
  const last = words.length > 1 ? words.at(-1) : undefined;
  return [first, last]
    .map((word) => (word ? firstCharacter(word) : ""))
    .join("")
    .toLocaleUpperCase("en");
}

const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });

function firstCharacter(word: string): string {
  return segmenter.segment(word)[Symbol.iterator]().next().value?.segment ?? "";
}

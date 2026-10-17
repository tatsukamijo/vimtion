/**
 * Vim "word" characters: letters, digits, marks and underscore in any script.
 * The ASCII-only /\w/ made a line of Japanese text contain no word at all,
 * so dw / cw wiped the whole line, yiw yanked "" and w left the line.
 * (Vim also splits kanji / hiragana / katakana runs into separate words; not
 * modelled yet.)
 */
export const WORD_CHAR = new RegExp("[\\p{L}\\p{N}\\p{M}_]", "u");

/** Leading run of word characters (replacement for /^\w+/). */
export const WORD_RUN_PREFIX = new RegExp("^[\\p{L}\\p{N}\\p{M}_]+", "u");

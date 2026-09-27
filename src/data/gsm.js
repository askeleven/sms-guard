/**
 * The GSM 03.38 default alphabet (3GPP TS 23.038), in code order, without the escape
 * at 0x1B. Non-ASCII characters are written as escapes so no lookalike can creep in.
 * Note that it is not ASCII: 0x24 is the currency sign, and the backtick is missing.
 */
export const GSM_BASIC = new Set(
  [
    // 0x00
    '@\u00A3$\u00A5\u00E8\u00E9\u00F9\u00EC\u00F2\u00C7\n\u00D8\u00F8\r\u00C5\u00E5',
    // 0x10, escape at 0x1B left out
    '\u0394_\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039E\u00C6\u00E6\u00DF\u00C9',
    // 0x20
    ' !"#\u00A4%&\'()*+,-./0123456789:;<=>?',
    // 0x40
    '\u00A1ABCDEFGHIJKLMNOPQRSTUVWXYZ\u00C4\u00D6\u00D1\u00DC\u00A7',
    // 0x60
    '\u00BFabcdefghijklmnopqrstuvwxyz\u00E4\u00F6\u00F1\u00FC\u00E0',
  ].join(''),
)

/**
 * The extension table: each is sent as the escape plus one septet, so it costs two.
 */
export const GSM_EXTENSION = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '\u20AC'])

/**
 * Typographic characters with a GSM-7 equivalent that reads the same. Only these are
 * ever offered as replacements. Accented letters are real text and are left alone.
 *
 * @type {Map<string, string>}
 */
export const GSM_REPLACEMENTS = new Map([
  // Single quotes and primes
  ['\u2018', "'"], ['\u2019', "'"], ['\u201A', "'"], ['\u201B', "'"], ['\u2032', "'"],
  ['\u2039', "'"], ['\u203A', "'"],
  // Double quotes, guillemets
  ['\u201C', '"'], ['\u201D', '"'], ['\u201E', '"'], ['\u201F', '"'], ['\u2033', '"'],
  ['\u00AB', '"'], ['\u00BB', '"'],
  // Dashes and the minus sign
  ['\u2010', '-'], ['\u2011', '-'], ['\u2012', '-'], ['\u2013', '-'], ['\u2014', '-'],
  ['\u2015', '-'], ['\u2212', '-'],
  // Ellipsis
  ['\u2026', '...'],
  // Bullets
  ['\u2022', '-'], ['\u2023', '-'], ['\u2043', '-'],
  // Tab, no-break and other spaces
  ['\t', ' '], ['\u00A0', ' '], ['\u2000', ' '], ['\u2001', ' '], ['\u2002', ' '],
  ['\u2003', ' '], ['\u2004', ' '], ['\u2005', ' '], ['\u2006', ' '], ['\u2007', ' '],
  ['\u2008', ' '], ['\u2009', ' '], ['\u200A', ' '], ['\u202F', ' '], ['\u205F', ' '],
  ['\u3000', ' '],
  // Invisible: zero-width space, word joiner, byte order mark
  ['\u200B', ''], ['\u2060', ''], ['\uFEFF', ''],
])

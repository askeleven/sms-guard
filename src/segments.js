import { GSM_BASIC, GSM_EXTENSION, GSM_REPLACEMENTS } from './data/gsm.js'

/**
 * @typedef {'GSM-7'|'UCS-2'} Encoding
 *
 * @typedef {object} SegmentCount
 * @property {Encoding} encoding
 * @property {number} characters Unicode code points, what a person would count.
 * @property {number} units What the network counts: septets for GSM-7 (an extension
 *   character is two), UTF-16 code units for UCS-2 (an emoji is usually two).
 * @property {number} segments Parts the message is sent as. 0 for an empty message.
 * @property {number} perSegment Units that fit in each part: 160 or 70 alone, 153 or
 *   67 once a message is split, since the rest of each part carries the header that
 *   joins them back together.
 *
 * @typedef {object} Ucs2Character
 * @property {string} char
 * @property {string} codePoint As U+XXXX.
 * @property {number} count Times it appears.
 * @property {string | null} replacement A GSM-7 equivalent, offered only for
 *   typographic characters such as curly quotes, dashes and odd spaces.
 */

/** Units per message: [single, per part once concatenated]. */
export const LIMITS = {
  'GSM-7': { single: 160, part: 153 },
  'UCS-2': { single: 70, part: 67 },
}

/**
 * GSM-7 when every character is in the default alphabet or its extension table,
 * UCS-2 otherwise. One character outside both is enough to switch the whole message.
 *
 * @param {string} text
 * @returns {Encoding}
 */
export function encodingOf(text) {
  for (const char of text) {
    if (!GSM_BASIC.has(char) && !GSM_EXTENSION.has(char)) return 'UCS-2'
  }
  return 'GSM-7'
}

/**
 * What one character costs in the given encoding.
 *
 * @param {string} char One code point.
 * @param {Encoding} encoding
 * @returns {number}
 */
export function unitCost(char, encoding) {
  if (encoding === 'GSM-7') return GSM_EXTENSION.has(char) ? 2 : 1
  return char.length // 2 for anything outside the Basic Multilingual Plane
}

/**
 * Counts segments the way the network does. A GSM-7 escape pair, or a UTF-16
 * surrogate pair, is never cut across two parts: when it does not fit in what is left
 * of a part, the part is sent short and the pair starts the next one.
 *
 * @param {string} text
 * @returns {SegmentCount}
 */
export function countSegments(text) {
  const encoding = encodingOf(text)
  const { single, part } = LIMITS[encoding]
  let characters = 0
  let units = 0
  /** @type {number[]} */
  const costs = []
  for (const char of text) {
    const cost = unitCost(char, encoding)
    characters++
    units += cost
    costs.push(cost)
  }

  if (units === 0) return { encoding, characters, units, segments: 0, perSegment: single }
  if (units <= single) return { encoding, characters, units, segments: 1, perSegment: single }

  let segments = 1
  let used = 0
  for (const cost of costs) {
    if (used + cost > part) {
      segments++
      used = cost
    } else {
      used += cost
    }
  }
  return { encoding, characters, units, segments, perSegment: part }
}

/**
 * The characters that force a message into UCS-2, each once, in order of first
 * appearance, with a GSM-7 replacement where one reads the same.
 *
 * @param {string} text
 * @returns {Ucs2Character[]}
 */
export function ucs2Characters(text) {
  /** @type {Map<string, Ucs2Character>} */
  const found = new Map()
  for (const char of text) {
    if (GSM_BASIC.has(char) || GSM_EXTENSION.has(char)) continue
    const entry = found.get(char)
    if (entry) {
      entry.count++
    } else {
      found.set(char, {
        char,
        codePoint: codePointOf(char),
        count: 1,
        replacement: GSM_REPLACEMENTS.get(char) ?? null,
      })
    }
  }
  return [...found.values()]
}

/**
 * Applies the typographic replacements, and nothing else.
 *
 * @param {string} text
 * @returns {string}
 */
export function replaceTypographic(text) {
  let out = ''
  for (const char of text) out += GSM_REPLACEMENTS.get(char) ?? char
  return out
}

/**
 * @param {string} char
 * @returns {string}
 */
export function codePointOf(char) {
  return `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
}

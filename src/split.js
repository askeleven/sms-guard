import { countSegments } from './segments.js'

/**
 * @typedef {import('./segments.js').Encoding} Encoding
 *
 * @typedef {object} Part
 * @property {string} text
 * @property {Encoding} encoding Worked out for this part alone: a part with no
 *   accented letters can go back to GSM-7.
 * @property {number} characters
 * @property {number} units
 * @property {number} segments
 *
 * @typedef {object} SplitOptions
 * @property {number} [maxSegments] Most segments any one part may use. Default 5.
 */

export const DEFAULT_MAX_SEGMENTS = 5

/**
 * Where a message may be broken, from the most natural to the last resort, and what
 * goes back between two pieces when they are packed into the same part.
 *
 * @type {Array<{ split: (text: string) => string[], join: string }>}
 */
const LEVELS = [
  { split: (t) => t.split(/\n[ \t]*\n\s*/), join: '\n\n' }, // paragraphs
  { split: (t) => t.split(/\n/), join: '\n' }, // lines
  { split: (t) => t.split(/(?<=[.!?\u2026])\s+/), join: ' ' }, // sentences
  { split: (t) => t.split(/\s+/), join: ' ' }, // words
]

/**
 * Splits a message into parts that each fit within maxSegments, to be sent in order
 * as separate texts. Breaks at a blank line where it can, then a line, then a
 * sentence, then a word, and only cuts inside a word when a single word is too long.
 * Parts are packed greedily, so there are as few as the breaks allow. Whitespace at
 * each break is dropped. A GSM-7 escape pair or a surrogate pair is never cut, since
 * the text is only ever cut between whole characters.
 *
 * @param {string} text
 * @param {SplitOptions} [options]
 * @returns {Part[]} Empty for a message with nothing but whitespace.
 */
export function splitMessage(text, options = {}) {
  const { maxSegments = DEFAULT_MAX_SEGMENTS } = options
  if (!Number.isInteger(maxSegments) || maxSegments < 1) {
    throw new RangeError(`maxSegments must be a whole number of 1 or more, got ${maxSegments}`)
  }
  const fits = (/** @type {string} */ t) => countSegments(t).segments <= maxSegments
  const body = String(text).trim()
  if (!body) return []
  return pack(body, 0, fits).map(describe)
}

/**
 * @param {string} text Trimmed, not empty.
 * @param {number} level
 * @param {(text: string) => boolean} fits
 * @returns {string[]}
 */
function pack(text, level, fits) {
  if (fits(text)) return [text]
  if (level >= LEVELS.length) return hardSplit(text, fits)

  const { split, join } = LEVELS[level]
  const pieces = split(text)
    .map((p) => p.trim())
    .filter(Boolean)
  if (pieces.length <= 1) return pack(text, level + 1, fits)

  /** @type {string[]} */
  const out = []
  /** @type {string | null} */
  let current = null
  for (const piece of pieces) {
    if (!fits(piece)) {
      if (current !== null) out.push(current)
      const sub = pack(piece, level + 1, fits)
      out.push(...sub.slice(0, -1))
      current = sub[sub.length - 1]
      continue
    }
    if (current === null) {
      current = piece
    } else if (fits(current + join + piece)) {
      current = current + join + piece
    } else {
      out.push(current)
      current = piece
    }
  }
  if (current !== null) out.push(current)
  return out
}

/**
 * Cuts between characters, filling each part as far as it goes.
 *
 * @param {string} text
 * @param {(text: string) => boolean} fits
 * @returns {string[]}
 */
function hardSplit(text, fits) {
  /** @type {string[]} */
  const out = []
  let current = ''
  for (const char of text) {
    if (current && !fits(current + char)) {
      out.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current) out.push(current)
  return out.map((p) => p.trim()).filter(Boolean)
}

/**
 * @param {string} text
 * @returns {Part}
 */
function describe(text) {
  const { encoding, characters, units, segments } = countSegments(text)
  return { text, encoding, characters, units, segments }
}

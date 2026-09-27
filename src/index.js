import { countSegments, ucs2Characters, replaceTypographic, LIMITS } from './segments.js'
import { splitMessage, DEFAULT_MAX_SEGMENTS } from './split.js'
import {
  parseNumber,
  zonesFor,
  parseWindow,
  inWindow,
  localTime,
  nextWindowStart,
} from './phone.js'
import { SHORTENER_DOMAINS } from './data/shorteners.js'

export { encodingOf, countSegments, ucs2Characters, LIMITS } from './segments.js'
export { splitMessage, DEFAULT_MAX_SEGMENTS } from './split.js'
export { parseNumber } from './phone.js'

/**
 * @typedef {import('./segments.js').Encoding} Encoding
 * @typedef {import('./segments.js').SegmentCount} SegmentCount
 * @typedef {import('./segments.js').Ucs2Character} Ucs2Character
 * @typedef {import('./split.js').Part} Part
 * @typedef {import('./split.js').SplitOptions} SplitOptions
 * @typedef {import('./phone.js').LocalTime} LocalTime
 *
 * @typedef {'keep'|'review'|'fail'} Verdict
 *
 * @typedef {'empty'|'too_many_segments'|'invalid_number'|'quiet_hours'
 *   |'timezone_ambiguous'|'timezone_unknown'|'url_shortener'|'no_opt_out'
 *   |'ucs2'} ReasonCode
 *
 * @typedef {object} Reason
 * @property {ReasonCode} code Stable, safe to match on.
 * @property {Verdict} verdict What this reason alone would make of the message.
 * @property {string} detail Plain English.
 *
 * @typedef {object} Recipient
 * @property {string} input As given.
 * @property {string | null} number E.164, or null when it could not be read.
 * @property {boolean} assumedNanp Read as +1 because it had no country code and
 *   10 digits (or 11 starting with 1).
 * @property {string | null} region State, province or country, when known.
 * @property {string[]} timezones Every IANA zone the number could be in.
 * @property {string | null} timezone The zone, when there is exactly one.
 * @property {Array<LocalTime & { inWindow: boolean }>} local Local send time in each
 *   of the zones.
 * @property {boolean | null} inWindow Whether the send time is inside the window in
 *   every zone; null when no zone is known.
 * @property {string | null} nextWindowStart ISO 8601, the first minute after the send
 *   time that is inside the window in every zone, when the send time is not.
 *
 * @typedef {object} Facts
 * @property {Encoding} encoding
 * @property {number} characters Unicode code points.
 * @property {number} units Septets for GSM-7, UTF-16 code units for UCS-2.
 * @property {number} segments
 * @property {number} perSegment Units per segment at this length.
 * @property {number} maxSegments
 * @property {Ucs2Character[]} ucs2Characters What forces UCS-2, if anything.
 * @property {string} sendAt ISO 8601.
 * @property {string} window HH:MM-HH:MM, recipient local time.
 * @property {'checked'|'skipped'} timeCheck Whether the send time was checked
 *   against the recipient's local time. Skipped with no recipient, or when their
 *   time zone is not known.
 * @property {Recipient | null} recipient
 *
 * @typedef {object} Result
 * @property {Verdict} verdict The worst verdict among the reasons; 'keep' with none.
 * @property {Reason[]} reasons
 * @property {Facts} facts
 * @property {string[]} notes What the reader needs to know to trust the result,
 *   such as checks that did not run.
 *
 * @typedef {object} CheckOptions
 * @property {string} [to] Recipient phone number, E.164 preferred.
 * @property {Date | string | number} [sendAt] When it will be sent. A string must be
 *   ISO 8601 with an offset or Z. Default now.
 * @property {number} [maxSegments] Fail above this many segments. Default 5.
 * @property {string} [window] Allowed local send time, HH:MM-HH:MM, start inclusive,
 *   end exclusive. Default 08:00-21:00.
 * @property {boolean} [firstMessage] The first text to this person: look for opt-out
 *   wording. Default false.
 * @property {Date | (() => Date)} [now] The clock, for tests.
 */

export const DEFAULT_WINDOW = '08:00-21:00'

const VERDICT_ORDER = { keep: 0, review: 1, fail: 2 }

export class GuardError extends Error {
  /**
   * @param {'invalid_option'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.name = 'GuardError'
    this.code = code
  }
}

/**
 * Checks one text message before it is sent: how many segments it will be, what
 * forces it into UCS-2, whether it lands inside the recipient's allowed hours, and
 * a few things carriers and recipients object to. Runs locally, touches no network.
 *
 * @param {string} text
 * @param {CheckOptions} [options]
 * @returns {Result}
 */
export function checkMessage(text, options = {}) {
  const {
    to,
    maxSegments = DEFAULT_MAX_SEGMENTS,
    window = DEFAULT_WINDOW,
    firstMessage = false,
  } = options
  if (!Number.isInteger(maxSegments) || maxSegments < 1) {
    throw new GuardError('invalid_option', `maxSegments must be a whole number of 1 or more, got ${maxSegments}.`)
  }
  const win = parseWindow(window)
  if (!win) {
    throw new GuardError('invalid_option', `window must be HH:MM-HH:MM, such as ${DEFAULT_WINDOW}, got ${window}.`)
  }
  const sendAt = resolveSendAt(options.sendAt, options.now)

  const body = String(text ?? '')
  const count = countSegments(body)
  const ucs2 = ucs2Characters(body)

  /** @type {Reason[]} */
  const reasons = []
  /** @type {string[]} */
  const notes = []
  const add = (/** @type {ReasonCode} */ code, /** @type {Verdict} */ verdict, /** @type {string} */ detail) =>
    reasons.push({ code, verdict, detail })

  if (!body.trim()) {
    add('empty', 'fail', 'The message is empty. Nothing would arrive, or a blank text would.')
  } else {
    if (count.segments > maxSegments) {
      add('too_many_segments', 'fail', segmentsDetail(body, count, ucs2, maxSegments))
    }
    if (ucs2.length > 0) add('ucs2', 'keep', ucs2Detail(body, count, ucs2))

    const shorteners = findShorteners(body)
    if (shorteners.length > 0) {
      add(
        'url_shortener',
        'review',
        `Links on ${shorteners.join(', ')}: carriers filter public shorteners, since anyone ` +
          'can hide anything behind one, and the text can be dropped without an error. ' +
          'Use the full link, or a short link on your own domain.',
      )
    }
    if (firstMessage && !hasOptOut(body)) {
      add(
        'no_opt_out',
        'review',
        'This is the first text to this person and it does not say how to stop them, such ' +
          'as "Reply STOP to opt out" (or "Responde STOP para no recibir más mensajes"). ' +
          'Carriers and the recipient both expect it on a first message.',
      )
    }
  }

  /** @type {Facts['timeCheck']} */
  let timeCheck = 'skipped'
  /** @type {Recipient | null} */
  let recipient = null
  if (to === undefined || to === null || String(to).trim() === '') {
    notes.push('No recipient was given, so the send time was not checked against their local time.')
  } else {
    ;({ recipient, timeCheck } = checkRecipient(String(to), sendAt, win, add, notes))
  }

  const verdict = reasons.reduce(
    (worst, r) => (VERDICT_ORDER[r.verdict] > VERDICT_ORDER[worst] ? r.verdict : worst),
    /** @type {Verdict} */ ('keep'),
  )

  return {
    verdict,
    reasons,
    facts: {
      encoding: count.encoding,
      characters: count.characters,
      units: count.units,
      segments: count.segments,
      perSegment: count.perSegment,
      maxSegments,
      ucs2Characters: ucs2,
      sendAt: sendAt.toISOString(),
      window: win.label,
      timeCheck,
      recipient,
    },
    notes,
  }
}

/**
 * @param {string} to
 * @param {Date} sendAt
 * @param {import('./phone.js').Window} win
 * @param {(code: ReasonCode, verdict: Verdict, detail: string) => void} add
 * @param {string[]} notes
 * @returns {{ recipient: Recipient, timeCheck: Facts['timeCheck'] }}
 */
function checkRecipient(to, sendAt, win, add, notes) {
  /** @type {Recipient} */
  const recipient = {
    input: to,
    number: null,
    assumedNanp: false,
    region: null,
    timezones: [],
    timezone: null,
    local: [],
    inWindow: null,
    nextWindowStart: null,
  }

  const parsed = parseNumber(to)
  if (!parsed.ok) {
    add('invalid_number', 'fail', parsed.error)
    return { recipient, timeCheck: 'skipped' }
  }
  recipient.number = parsed.number.e164
  recipient.assumedNanp = parsed.number.assumedNanp
  if (parsed.number.assumedNanp) {
    notes.push(`${to} had no country code, so it was read as a US or Canadian number, ${parsed.number.e164}.`)
  }

  const { region, zones, basis } = zonesFor(parsed.number)
  recipient.region = region
  recipient.timezones = zones
  recipient.timezone = zones.length === 1 ? zones[0] : null

  if (zones.length === 0) {
    add(
      'timezone_unknown',
      'review',
      `${basis} Its local time is unknown, so whether ${sendAt.toISOString()} is inside ` +
        `${win.label} there could not be checked.`,
    )
    return { recipient, timeCheck: 'skipped' }
  }

  recipient.local = zones.map((z) => {
    const t = localTime(sendAt, z)
    return { ...t, inWindow: inWindow(t.minutes, win) }
  })
  const inside = recipient.local.filter((t) => t.inWindow)
  recipient.inWindow = inside.length === recipient.local.length
  if (!recipient.inWindow) {
    recipient.nextWindowStart = nextWindowStart(sendAt, zones, win)?.toISOString() ?? null
  }
  const where = region ? ` (${region})` : ''
  const times = recipient.local.map((t) => `${t.label} in ${t.timezone}`).join(', ')
  let next = ''
  if (recipient.nextWindowStart) {
    const opens = new Date(recipient.nextWindowStart)
    const at = zones.map((z) => localTime(opens, z).label).join(', ')
    next =
      zones.length === 1
        ? ` The window next opens at ${recipient.nextWindowStart} (${at}).`
        : ` The earliest time inside it in every one of them is ${recipient.nextWindowStart} (${at}).`
  }

  if (inside.length === 0) {
    add(
      'quiet_hours',
      'fail',
      `It would arrive at ${times}, outside ${win.label}. The federal TCPA window for ` +
        'telephone solicitations, which covers texts, is 8am to 9pm at the recipient\'s ' +
        'location, and some states are stricter. Schedule it for the recipient\'s ' +
        `morning instead.${next}`,
    )
  } else if (zones.length > 1 && inside.length < zones.length) {
    add(
      'timezone_ambiguous',
      'review',
      `${parsed.number.e164}${where} could be in ${zones.length} time zones and the number ` +
        `alone does not say which. It would arrive at ${times}: inside ${win.label} in ` +
        `some, outside it in others.${next}`,
    )
  } else if (zones.length > 1) {
    notes.push(
      `${parsed.number.e164}${where} could be in ${zones.join(', ')}. The send time is ` +
        `inside ${win.label} in every one of them.`,
    )
  }
  return { recipient, timeCheck: 'checked' }
}

/**
 * @param {Date | string | number | undefined} sendAt
 * @param {Date | (() => Date) | undefined} now
 * @returns {Date}
 */
function resolveSendAt(sendAt, now) {
  if (sendAt === undefined || sendAt === null) {
    const d = typeof now === 'function' ? now() : (now ?? new Date())
    return new Date(d.getTime())
  }
  if (typeof sendAt === 'string') {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i
    if (!iso.test(sendAt.trim())) {
      throw new GuardError(
        'invalid_option',
        `sendAt must be ISO 8601 with an offset or Z, such as 2026-09-27T14:30:00Z, got ${sendAt}.`,
      )
    }
  }
  const date = sendAt instanceof Date ? new Date(sendAt.getTime()) : new Date(sendAt)
  if (Number.isNaN(date.getTime())) {
    throw new GuardError('invalid_option', `sendAt is not a valid time: ${String(sendAt)}.`)
  }
  return date
}

/**
 * @param {string} body
 * @param {SegmentCount} count
 * @param {Ucs2Character[]} ucs2
 * @param {number} maxSegments
 * @returns {string}
 */
function segmentsDetail(body, count, ucs2, maxSegments) {
  const unitName = count.encoding === 'GSM-7' ? 'septets' : 'UTF-16 units'
  let detail =
    `${count.segments} segments (${count.units} ${unitName}, ${count.perSegment} per ` +
    `segment in ${count.encoding}), over the limit of ${maxSegments}. Providers usually ` +
    'accept a long message and bill every segment, but some carriers refuse long ' +
    'multi-part messages later and the recipient never gets it, so a success response ' +
    'from the API tells you nothing.'
  if (ucs2.length > 0 && ucs2.every((c) => c.replacement !== null)) {
    const gsm = countSegments(replaceTypographic(body))
    detail +=
      ` Replacing the typographic characters listed would make it GSM-7, ${gsm.segments} ` +
      `segment${gsm.segments === 1 ? '' : 's'}.`
  }
  const parts = splitMessage(body, { maxSegments }).length
  detail += ` Send it as ${parts} shorter messages instead (splitMessage, or --split), or cut it.`
  return detail
}

/**
 * @param {string} body
 * @param {SegmentCount} count
 * @param {Ucs2Character[]} ucs2
 * @returns {string}
 */
function ucs2Detail(body, count, ucs2) {
  const list = ucs2.map((c) => `${displayChar(c)} (${c.count})`).join(', ')
  const replaceable = ucs2.filter((c) => c.replacement !== null)
  const letters = ucs2.filter((c) => c.replacement === null)
  let detail =
    `UCS-2, because of ${list}. UCS-2 fits ${LIMITS['UCS-2'].single} characters in one ` +
    `segment instead of ${LIMITS['GSM-7'].single}, and ${LIMITS['UCS-2'].part} per part ` +
    `instead of ${LIMITS['GSM-7'].part}.`
  if (replaceable.length > 0) {
    const swaps = replaceable
      .map((c) => `${displayChar(c)} with ${c.replacement === '' ? 'nothing' : `"${c.replacement}"`}`)
      .join(', ')
    detail += ` Typographic characters can be swapped for GSM-7 ones that read the same: ${swaps}.`
    if (letters.length === 0) {
      const gsm = countSegments(replaceTypographic(body))
      detail += ` That makes it GSM-7, ${gsm.segments} segment${gsm.segments === 1 ? '' : 's'} instead of ${count.segments}.`
    }
  }
  if (letters.length > 0) {
    detail +=
      ' Letters are never replaced: they are the words. A message in Spanish will ' +
      'usually be UCS-2, and that is fine; just budget segments for it.'
  }
  return detail
}

/**
 * Shows invisible and whitespace characters by code point, the rest as themselves.
 *
 * @param {Ucs2Character} c
 * @returns {string}
 */
export function displayChar(c) {
  return /^[\s\p{Cf}\p{Cc}]$/u.test(c.char) ? c.codePoint : `${c.char} ${c.codePoint}`
}

const SHORTENER_PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}.@-])(?:[a-z0-9-]+\\.)*(${[...SHORTENER_DOMAINS]
    .map((d) => d.replace(/\./g, '\\.'))
    .join('|')})(?![\\p{L}\\p{N}-]|\\.[\\p{L}\\p{N}])`,
  'giu',
)

/**
 * @param {string} text
 * @returns {string[]} Shortener domains linked to, each once.
 */
function findShorteners(text) {
  return [...new Set([...text.matchAll(SHORTENER_PATTERN)].map((m) => m[1].toLowerCase()))]
}

/** Opt-out wording, in English and Spanish. */
const OPT_OUT_PATTERNS = [
  // A keyword in capitals is an instruction, not a word in a sentence.
  /\b(?:STOP|STOPALL|UNSUBSCRIBE|BAJA|ALTO|CANCELAR)\b/,
  /\b(?:reply|text|txt|send|respond|responde|responda|contesta|conteste|env[ií]a|escribe|escriba)\s+(?:with\s+|con\s+)?["'\u2018\u2019\u201C\u201D\u00AB]?(?:stop|end|quit|cancel|unsubscribe|baja|alto|parar|salir)\b/i,
  /\bopt[\s-]?out\b/i,
  /\bdarte de baja\b|\bdarse de baja\b/i,
]

/**
 * @param {string} text
 * @returns {boolean}
 */
function hasOptOut(text) {
  return OPT_OUT_PATTERNS.some((p) => p.test(text))
}

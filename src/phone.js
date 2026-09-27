import { NANP_AREA_CODES } from './data/nanp.js'
import { COUNTRY_CODES } from './data/countries.js'

/**
 * @typedef {object} ParsedNumber
 * @property {string} e164 The number as +<digits>.
 * @property {string} countryCode '1' for NANP, otherwise as matched in the country
 *   table, or an empty string when no row matches.
 * @property {boolean} assumedNanp True when the number had no + and was read as a
 *   US or Canadian number because it had 10 digits (or 11 starting with 1).
 *
 * @typedef {object} ZoneLookup
 * @property {string | null} region State, province or country, when known.
 * @property {string[]} zones IANA zones. None means unknown; more than one, ambiguous.
 * @property {string} basis What the zones were worked out from, in plain English.
 */

/** Formatting people type around a phone number, stripped before parsing. */
const FORMATTING = /[\s().\-/\u00A0]/g

/**
 * Reads a phone number. Accepts E.164 with or without formatting (+1 (305) 555-0100,
 * +44 20 7946 0000). Without a leading +, only a 10-digit number, or an 11-digit
 * number starting with 1, is accepted, and it is read as NANP (US, Canada and the
 * rest of +1). Anything else without a + is refused rather than guessed at.
 *
 * @param {string} raw
 * @returns {{ ok: true, number: ParsedNumber } | { ok: false, error: string }}
 */
export function parseNumber(raw) {
  const input = String(raw).trim()
  const hasPlus = input.startsWith('+')
  const rest = (hasPlus ? input.slice(1) : input).replace(FORMATTING, '')
  if (!/^\d+$/.test(rest)) {
    return { ok: false, error: `${input || 'An empty string'} is not a phone number.` }
  }

  let digits = rest
  let assumedNanp = false
  if (!hasPlus) {
    if (digits.length === 10) {
      digits = `1${digits}`
      assumedNanp = true
    } else if (digits.length === 11 && digits.startsWith('1')) {
      assumedNanp = true
    } else {
      return {
        ok: false,
        error:
          `${input} has no country code. Write it in E.164, starting with + and the ` +
          'country code, such as +44 20 7946 0000.',
      }
    }
  }

  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: `${input} is not a valid E.164 number (7 to 15 digits).` }
  }
  if (digits.startsWith('1')) {
    if (!/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      return {
        ok: false,
        error: `${input} is not a valid US or Canadian number: +1, then 10 digits.`,
      }
    }
    return { ok: true, number: { e164: `+${digits}`, countryCode: '1', assumedNanp } }
  }
  const countryCode =
    [3, 2, 1].map((n) => digits.slice(0, n)).find((prefix) => COUNTRY_CODES.has(prefix)) ?? null
  return {
    ok: true,
    number: { e164: `+${digits}`, countryCode: countryCode ?? '', assumedNanp },
  }
}

/**
 * The time zone, or zones, a number could be in.
 *
 * @param {ParsedNumber} number
 * @returns {ZoneLookup}
 */
export function zonesFor(number) {
  if (number.countryCode === '1') {
    const areaCode = number.e164.slice(2, 5)
    const entry = NANP_AREA_CODES.get(areaCode)
    if (!entry) {
      return {
        region: null,
        zones: [],
        basis: `Area code ${areaCode} is not a geographic area code sms-guard knows.`,
      }
    }
    return { region: entry.region, zones: entry.zones, basis: `area code ${areaCode}` }
  }
  const entry = number.countryCode ? COUNTRY_CODES.get(number.countryCode) : undefined
  if (!entry) {
    return {
      region: null,
      zones: [],
      basis: `The country for ${number.e164} is not in sms-guard's table.`,
    }
  }
  return { region: entry.region, zones: entry.zones, basis: `country code +${number.countryCode}` }
}

/**
 * @typedef {object} Window
 * @property {number} start Minutes after local midnight, inclusive.
 * @property {number} end Minutes after local midnight, exclusive.
 * @property {string} label As given, HH:MM-HH:MM.
 */

/**
 * Parses HH:MM-HH:MM. The start is inclusive and the end exclusive, so 08:00-21:00
 * allows 08:00 and 20:59 but not 21:00. A window that wraps midnight (22:00-06:00)
 * is allowed.
 *
 * @param {string} window
 * @returns {Window | null}
 */
export function parseWindow(window) {
  const m = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(String(window).trim())
  if (!m) return null
  const [sh, sm, eh, em] = m.slice(1).map(Number)
  if (sm > 59 || em > 59 || sh > 23 || eh > 24 || (eh === 24 && em > 0)) return null
  const start = sh * 60 + sm
  const end = eh * 60 + em
  if (start === end) return null
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return { start, end, label: `${pad(sh)}:${pad(sm)}-${pad(eh)}:${pad(em)}` }
}

/**
 * @param {number} minutes Minutes after local midnight.
 * @param {Window} window
 * @returns {boolean}
 */
export function inWindow(minutes, window) {
  return window.start < window.end
    ? minutes >= window.start && minutes < window.end
    : minutes >= window.start || minutes < window.end
}

/**
 * @typedef {object} LocalTime
 * @property {string} timezone
 * @property {string} time Local wall-clock time, YYYY-MM-DDTHH:MM.
 * @property {string} label Such as "Sun 19:30 EDT".
 * @property {number} minutes Minutes after local midnight.
 */

/** @type {Map<string, Intl.DateTimeFormat>} */
const formatters = new Map()

/**
 * The wall-clock time in a zone, from the runtime's own time zone data.
 *
 * @param {Date} date
 * @param {string} timezone
 * @returns {LocalTime}
 */
export function localTime(date, timezone) {
  let format = formatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
      timeZoneName: 'short',
    })
    formatters.set(timezone, format)
  }
  /** @type {Record<string, string>} */
  const p = {}
  for (const part of format.formatToParts(date)) p[part.type] = part.value
  const hour = p.hour === '24' ? '00' : p.hour
  return {
    timezone,
    time: `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`,
    label: `${p.weekday} ${hour}:${p.minute} ${p.timeZoneName}`,
    minutes: Number(hour) * 60 + Number(p.minute),
  }
}

/**
 * The first minute at or after `from` when it is inside the window in every one of
 * the zones, or null if there is none in the next two days.
 *
 * @param {Date} from
 * @param {string[]} zones
 * @param {Window} window
 * @returns {Date | null}
 */
export function nextWindowStart(from, zones, window) {
  const MINUTE = 60_000
  const ok = (/** @type {number} */ t) =>
    zones.every((z) => inWindow(localTime(new Date(t), z).minutes, window))
  const start = Math.ceil(from.getTime() / MINUTE) * MINUTE
  const limit = start + 2 * 24 * 60 * MINUTE
  // Coarse steps to find the opening, then minute by minute back from it.
  for (let t = start; t <= limit; t += 15 * MINUTE) {
    if (!ok(t)) continue
    let first = t
    while (first - MINUTE >= start && ok(first - MINUTE)) first -= MINUTE
    return new Date(first)
  }
  return null
}

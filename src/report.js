/**
 * @typedef {import('./index.js').Result} Result
 * @typedef {import('./index.js').ReasonCode} ReasonCode
 * @typedef {import('./index.js').Verdict} Verdict
 * @typedef {import('./split.js').Part} Part
 */

const COLOURS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
}

/** Headings for each reason. */
const REASON_TITLES = /** @type {Record<ReasonCode, string>} */ ({
  empty: 'Empty message',
  too_many_segments: 'Too many segments',
  invalid_number: 'Not a valid phone number',
  quiet_hours: 'Outside allowed hours',
  timezone_ambiguous: 'Time zone ambiguous',
  timezone_unknown: 'Time zone unknown',
  url_shortener: 'Public link shortener',
  no_opt_out: 'No opt-out wording',
  ucs2: 'Sent as UCS-2',
})

const HEADLINES = /** @type {Record<Verdict, string>} */ ({
  keep: 'OK to send',
  review: 'A person should look at this before it is sent',
  fail: 'Do not send this as it stands',
})

/**
 * @param {boolean} enabled
 * @returns {(code: string, text: string) => string}
 */
function painter(enabled) {
  return (code, text) => (enabled ? `${code}${text}${COLOURS.reset}` : text)
}

/**
 * @param {string} text
 * @param {number} width
 * @param {string} indent
 * @returns {string}
 */
function wrap(text, width, indent) {
  /** @type {string[]} */
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.map((l) => indent + l).join('\n')
}

/**
 * @param {Result} result
 * @param {{ colour?: boolean, width?: number }} [options]
 * @returns {string}
 */
export function formatText(result, options = {}) {
  const { colour = true, width = 76 } = options
  const paint = painter(colour)
  const { facts } = result
  const lines = ['']

  const label = { keep: 'PASS', review: 'REVIEW', fail: 'FAIL' }[result.verdict]
  const tint = { keep: COLOURS.green, review: COLOURS.yellow, fail: COLOURS.red }[result.verdict]
  lines.push(`${paint(tint, label)}  ${paint(COLOURS.bold, HEADLINES[result.verdict])}`)
  lines.push('')

  const row = (/** @type {string} */ name, /** @type {string} */ value) =>
    lines.push(`      ${paint(COLOURS.dim, name.padEnd(12))} ${value}`)
  row('Encoding', facts.encoding)
  row(
    'Length',
    `${facts.characters} character${facts.characters === 1 ? '' : 's'}, ${facts.units} ` +
      (facts.encoding === 'GSM-7' ? 'septets' : 'UTF-16 units'),
  )
  const over = facts.segments > facts.maxSegments
  row(
    'Segments',
    `${over ? paint(COLOURS.red, String(facts.segments)) : facts.segments} of up to ${facts.perSegment} ` +
      `units each (limit ${facts.maxSegments})`,
  )
  const r = facts.recipient
  if (r) {
    const where = [r.number ?? r.input, r.region, r.timezone].filter(Boolean).join(', ')
    row('Recipient', where)
    if (r.local.length > 0) {
      for (const [i, t] of r.local.entries()) {
        const mark = t.inWindow ? 'inside' : paint(COLOURS.red, 'outside')
        const zone = r.local.length > 1 ? ` in ${t.timezone}` : ''
        row(i === 0 ? 'Local time' : '', `${t.label}${zone}, ${mark} ${facts.window}`)
      }
    }
  } else {
    row('Recipient', paint(COLOURS.dim, 'not given, send time not checked'))
  }

  for (const verdict of /** @type {const} */ (['fail', 'review', 'keep'])) {
    const reasons = result.reasons.filter((x) => x.verdict === verdict)
    if (reasons.length === 0) continue
    lines.push('')
    lines.push(
      verdict === 'fail'
        ? paint(COLOURS.red, 'FAIL')
        : verdict === 'review'
          ? paint(COLOURS.yellow, 'REVIEW')
          : paint(COLOURS.dim, 'NOTE'),
    )
    for (const reason of reasons) {
      lines.push(`  ${paint(COLOURS.bold, REASON_TITLES[reason.code])}`)
      lines.push(wrap(reason.detail, width - 6, '      '))
    }
  }

  if (result.notes.length) {
    lines.push('')
    for (const note of result.notes) lines.push(paint(COLOURS.dim, wrap(note, width - 2, '  ')))
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * @param {Part[]} parts
 * @param {{ maxSegments: number, colour?: boolean }} options
 * @returns {string}
 */
export function formatSplit(parts, options) {
  const { maxSegments, colour = true } = options
  const paint = painter(colour)
  const lines = ['']
  const n = parts.length
  lines.push(
    `${paint(COLOURS.green, 'PASS')}  ${paint(COLOURS.bold, `${n} message${n === 1 ? '' : 's'}`)}` +
      paint(COLOURS.dim, `, each within ${maxSegments} segment${maxSegments === 1 ? '' : 's'}. Send them in order.`),
  )
  for (const [i, part] of parts.entries()) {
    lines.push('')
    lines.push(
      `  ${paint(COLOURS.bold, `${i + 1}/${n}`)}  ` +
        paint(
          COLOURS.dim,
          `${part.segments} segment${part.segments === 1 ? '' : 's'}, ${part.encoding}, ` +
            `${part.characters} characters`,
        ),
    )
    for (const line of part.text.split('\n')) lines.push(`      ${line}`)
  }
  lines.push('')
  return lines.join('\n')
}

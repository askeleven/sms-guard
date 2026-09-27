import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough } from 'node:stream'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  checkMessage,
  splitMessage,
  encodingOf,
  countSegments,
  ucs2Characters,
  parseNumber,
  GuardError,
} from '../src/index.js'
import { formatText } from '../src/report.js'
import { serve } from '../src/mcp.js'
import { GSM_BASIC, GSM_EXTENSION } from '../src/data/gsm.js'
import { NANP_AREA_CODES } from '../src/data/nanp.js'
import { COUNTRY_CODES } from '../src/data/countries.js'

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url))

/** Written as escapes: no emoji characters in the source. */
const GRIN = '\u{1F600}'
const EURO = '\u20AC'

const SPANISH =
  'Hola María, soy Sofía de Clínica Dental Brisa. ¡Gracias por escribirnos! Vimos tu ' +
  'solicitud sobre la limpieza y el blanqueamiento, y queríamos contarte cómo funciona ' +
  'todo antes de tu primera visita.\n\nLa consulta inicial dura unos 45 minutos. ' +
  'Revisamos tu historial, hacemos una evaluación completa y te explicamos las opciones ' +
  'con precios claros, sin sorpresas. Si tienes seguro, tráelo: aceptamos la mayoría de ' +
  'los planes y te ayudamos con el papeleo.\n\nTenemos horarios disponibles este jueves a ' +
  'las 10:00 o a las 16:30, y el sábado por la mañana. Si ninguno te sirve, dinos qué día ' +
  'te queda mejor y buscamos un espacio. También puedes llamarnos o responder a este ' +
  'mensaje con cualquier pregunta. ¡Esperamos conocerte pronto!'

/** @param {import('../src/index.js').Result} r */
const codes = (r) => r.reasons.map((x) => x.code)

// Encoding

test('GSM tables: 127 basic characters plus 10 in the extension, not ASCII', () => {
  assert.equal(GSM_BASIC.size, 127)
  assert.equal(GSM_EXTENSION.size, 10)
  for (let c = 0x20; c <= 0x7e; c++) {
    const ch = String.fromCharCode(c)
    const expected = '[\\]^{|}~'.includes(ch) ? 'extension' : ch === '`' ? 'neither' : 'basic'
    const actual = GSM_BASIC.has(ch) ? 'basic' : GSM_EXTENSION.has(ch) ? 'extension' : 'neither'
    assert.equal(actual, expected, `for ${ch}`)
  }
})

test('encodingOf: GSM-7 letters, including the accented ones GSM has', () => {
  assert.equal(encodingOf('Hello, world! 100% @home $5 \u00A33'), 'GSM-7')
  assert.equal(encodingOf('¿Qué tal? Ñoño, él, über, à'), 'GSM-7')
  assert.equal(encodingOf(`{json} [x] ~ | ^ \\ ${EURO}`), 'GSM-7')
  assert.equal(encodingOf('Qué día'), 'UCS-2', 'í is not in GSM')
  assert.equal(encodingOf('It\u2019s'), 'UCS-2', 'curly apostrophe')
  assert.equal(encodingOf(`hi ${GRIN}`), 'UCS-2')
  assert.equal(encodingOf('tick `x`'), 'UCS-2', 'backtick is not GSM')
})

test('ucs2Characters: each culprit once, with a count, replacements only for typography', () => {
  const found = ucs2Characters('Qué día, \u201Csí\u201D \u2014 más\u2026 día')
  const byChar = Object.fromEntries(found.map((c) => [c.char, c]))
  assert.deepEqual(
    found.map((c) => c.char),
    ['í', '\u201C', '\u201D', '\u2014', 'á', '\u2026'],
  )
  assert.equal(byChar['í'].count, 3)
  assert.equal(byChar['í'].replacement, null)
  assert.equal(byChar['á'].replacement, null)
  assert.equal(byChar['\u201C'].replacement, '"')
  assert.equal(byChar['\u2014'].replacement, '-')
  assert.equal(byChar['\u2026'].replacement, '...')
  assert.equal(byChar['\u2014'].codePoint, 'U+2014')
  assert.equal(ucs2Characters('a\u00A0b')[0].replacement, ' ')
})

// Segments

test('countSegments: GSM-7 boundaries at 160 and 153 per part', () => {
  const at = (/** @type {number} */ n) => countSegments('a'.repeat(n))
  assert.deepEqual(at(160), { encoding: 'GSM-7', characters: 160, units: 160, segments: 1, perSegment: 160 })
  assert.equal(at(161).segments, 2)
  assert.equal(at(161).perSegment, 153)
  assert.equal(at(306).segments, 2)
  assert.equal(at(307).segments, 3)
  assert.equal(at(153 * 5).segments, 5)
  assert.equal(at(153 * 5 + 1).segments, 6)
  assert.equal(countSegments('').segments, 0)
})

test('countSegments: extension characters cost two septets', () => {
  assert.deepEqual(countSegments(EURO.repeat(80)), {
    encoding: 'GSM-7',
    characters: 80,
    units: 160,
    segments: 1,
    perSegment: 160,
  })
  assert.equal(countSegments(EURO.repeat(81)).segments, 2)
  assert.equal(countSegments(`${'a'.repeat(159)}{`).segments, 2, '161 septets')
})

test('countSegments: an escape pair never straddles two parts', () => {
  // 306 septets would be exactly 2 parts, but the euro cannot start at septet 153.
  const text = `${'a'.repeat(152)}${EURO}${'a'.repeat(152)}`
  assert.equal(countSegments(text).units, 306)
  assert.equal(countSegments(text).segments, 3)
})

test('countSegments: UCS-2 boundaries at 70 and 67 per part', () => {
  const at = (/** @type {number} */ n) => countSegments('á'.repeat(n))
  assert.deepEqual(at(70), { encoding: 'UCS-2', characters: 70, units: 70, segments: 1, perSegment: 70 })
  assert.equal(at(71).segments, 2)
  assert.equal(at(71).perSegment, 67)
  assert.equal(at(134).segments, 2)
  assert.equal(at(135).segments, 3)
})

test('countSegments: an emoji is two UTF-16 units and a surrogate pair never straddles', () => {
  assert.deepEqual(countSegments(GRIN), { encoding: 'UCS-2', characters: 1, units: 2, segments: 1, perSegment: 70 })
  assert.equal(countSegments(GRIN.repeat(35)).segments, 1)
  assert.equal(countSegments(GRIN.repeat(36)).segments, 2)
  // 134 units would be exactly 2 parts, but the emoji cannot start at unit 67.
  const text = `${'á'.repeat(66)}${GRIN}${'á'.repeat(66)}`
  assert.equal(countSegments(text).units, 134)
  assert.equal(countSegments(text).segments, 3)
})

// checkMessage: segments and encoding

test('checkMessage: a short GSM message is keep', () => {
  const r = checkMessage('Your table for 4 is booked for 7pm.')
  assert.equal(r.verdict, 'keep')
  assert.deepEqual(r.reasons, [])
  assert.equal(r.facts.timeCheck, 'skipped')
  assert.equal(r.facts.recipient, null)
  assert.match(r.notes[0], /No recipient was given/)
})

test('checkMessage: over the segment limit fails, and the limit is configurable', () => {
  const r = checkMessage('a'.repeat(153 * 5 + 1))
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(codes(r), ['too_many_segments'])
  assert.match(r.reasons[0].detail, /6 segments .* over the limit of 5/)
  assert.match(r.reasons[0].detail, /success response from the API tells you nothing/)
  assert.equal(checkMessage('a'.repeat(200), { maxSegments: 1 }).verdict, 'fail')
  assert.equal(checkMessage('a'.repeat(153 * 5)).verdict, 'keep')
})

test('checkMessage: typography-only UCS-2 says what to swap and what it saves', () => {
  const r = checkMessage(`It\u2019s ready \u2014 ${'x'.repeat(60)}`)
  assert.equal(r.verdict, 'keep')
  const ucs2 = r.reasons.find((x) => x.code === 'ucs2')
  assert.ok(ucs2)
  assert.equal(ucs2.verdict, 'keep')
  assert.match(ucs2.detail, /makes it GSM-7, 1 segment instead of 2/)
  assert.doesNotMatch(ucs2.detail, /Spanish/)
})

test('checkMessage: a 700+ character Spanish message is UCS-2, about 11 segments, fails, and splits', () => {
  assert.ok([...SPANISH].length > 700)
  const r = checkMessage(SPANISH)
  assert.equal(r.facts.encoding, 'UCS-2')
  assert.equal(r.facts.segments, 11)
  assert.equal(r.verdict, 'fail')
  assert.deepEqual(codes(r), ['too_many_segments', 'ucs2'])
  const ucs2 = r.reasons.find((x) => x.code === 'ucs2')
  assert.match(ucs2?.detail ?? '', /A message in Spanish will usually be UCS-2, and that is fine/)
  assert.ok(r.facts.ucs2Characters.every((c) => c.replacement === null), 'accents are never replaced')

  const parts = splitMessage(SPANISH)
  assert.ok(parts.length >= 3)
  for (const part of parts) {
    const again = checkMessage(part.text)
    assert.equal(again.verdict, 'keep', part.text)
    assert.ok(part.segments <= 5)
  }
  assert.equal(parts[0].text.split('\n\n').length, 1, 'broken at paragraphs')
})

test('checkMessage: empty fails', () => {
  assert.deepEqual(codes(checkMessage('')), ['empty'])
  assert.equal(checkMessage('  \n ').verdict, 'fail')
})

// splitMessage

test('splitMessage: a message that fits comes back as one part, trimmed', () => {
  assert.deepEqual(splitMessage('  Hello there.  \n'), [
    { text: 'Hello there.', encoding: 'GSM-7', characters: 12, units: 12, segments: 1 },
  ])
  assert.deepEqual(splitMessage('   '), [])
})

test('splitMessage: prefers paragraphs, then lines, then sentences, then words', () => {
  const para = (/** @type {string} */ c) => `${c.repeat(100)}.`
  const byParagraph = splitMessage(`${para('a')}\n\n${para('b')}`, { maxSegments: 1 })
  assert.deepEqual(byParagraph.map((p) => p.text), [para('a'), para('b')])

  const byLine = splitMessage(`${para('a')}\n${para('b')}`, { maxSegments: 1 })
  assert.deepEqual(byLine.map((p) => p.text), [para('a'), para('b')])

  const sentences = 'One two three four five six seven eight nine ten. '.repeat(6).trim()
  const bySentence = splitMessage(sentences, { maxSegments: 1 })
  for (const p of bySentence) assert.match(p.text, /\.$/, 'ends at a sentence')

  const words = 'word '.repeat(80).trim()
  const byWord = splitMessage(words, { maxSegments: 1 })
  for (const p of byWord) assert.match(p.text, /^word( word)*$/)
})

test('splitMessage: greedy packing, order preserved, every part passes', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of the notice.`).join('\n')
  for (const maxSegments of [1, 2, 3]) {
    const parts = splitMessage(text, { maxSegments })
    assert.equal(parts.map((p) => p.text).join('\n'), text)
    for (const p of parts) assert.ok(countSegments(p.text).segments <= maxSegments)
    // Greedy: no two neighbours would have fit together.
    for (let i = 1; i < parts.length; i++) {
      const joined = `${parts[i - 1].text}\n${parts[i].text}`
      assert.ok(countSegments(joined).segments > maxSegments)
    }
  }
})

test('splitMessage: hard split never cuts a surrogate pair or an escape pair', () => {
  const emoji = splitMessage(GRIN.repeat(400), { maxSegments: 1 })
  assert.equal(emoji.map((p) => p.text).join(''), GRIN.repeat(400))
  for (const p of emoji) {
    assert.ok(p.segments <= 1)
    assert.doesNotMatch(p.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  }
  const euros = splitMessage(EURO.repeat(200), { maxSegments: 1 })
  assert.deepEqual(euros.map((p) => p.units), [160, 160, 80])
  assert.equal(euros.map((p) => p.text).join(''), EURO.repeat(200))
})

test('splitMessage: each part gets its own encoding', () => {
  const text = `${'Plain text here. '.repeat(10).trim()}\n\n${'Qué día más largo. '.repeat(10).trim()}`
  const parts = splitMessage(text, { maxSegments: 2 })
  assert.equal(parts[0].encoding, 'GSM-7')
  assert.equal(parts.at(-1)?.encoding, 'UCS-2')
  assert.throws(() => splitMessage('x', { maxSegments: 0 }), RangeError)
})

// Phone numbers and time zones

test('parseNumber: E.164 with formatting, NANP assumed only for 10 or 11 digits', () => {
  const ok = (/** @type {string} */ s) => {
    const p = parseNumber(s)
    assert.ok(p.ok, s)
    return p.number
  }
  assert.deepEqual(ok('+1 (305) 555-0100'), { e164: '+13055550100', countryCode: '1', assumedNanp: false })
  assert.deepEqual(ok('305.555.0100'), { e164: '+13055550100', countryCode: '1', assumedNanp: true })
  assert.deepEqual(ok('1-305-555-0100'), { e164: '+13055550100', countryCode: '1', assumedNanp: true })
  assert.equal(ok('+44 20 7946 0000').countryCode, '44')
  assert.equal(ok('+57 300 123 4567').countryCode, '57')
  assert.equal(ok('+353 85 123 4567').countryCode, '353')
  assert.equal(parseNumber('020 7946 0000').ok, false, 'no country code, not 10 digits')
  assert.equal(parseNumber('+1 055 555 0100').ok, false, 'area codes do not start with 0')
  assert.equal(parseNumber('call me').ok, false)
})

test('data: every zone is a real IANA zone, every area code is geographic', () => {
  for (const table of [NANP_AREA_CODES, COUNTRY_CODES]) {
    for (const [code, entry] of table) {
      assert.ok(entry.zones.length > 0, code)
      for (const zone of entry.zones) {
        assert.doesNotThrow(() => new Intl.DateTimeFormat('en-US', { timeZone: zone }), `${code} ${zone}`)
      }
    }
  }
  for (const code of NANP_AREA_CODES.keys()) {
    assert.match(code, /^[2-9]\d\d$/)
    assert.doesNotMatch(code, /^[2-9]11$|^8(00|33|44|55|66|77|88)$|^[5-9]00$/, code)
  }
})

test('quiet hours: New York, fixed clock', () => {
  const ny = '+12125550100'
  const late = checkMessage('Your order shipped.', { to: ny, sendAt: '2026-09-28T01:30:00Z' })
  assert.equal(late.verdict, 'fail')
  assert.deepEqual(codes(late), ['quiet_hours'])
  assert.match(late.reasons[0].detail, /Sun 21:30 EDT in America\/New_York, outside 08:00-21:00/)
  assert.equal(late.facts.recipient?.timezone, 'America/New_York')
  assert.equal(late.facts.recipient?.nextWindowStart, '2026-09-28T12:00:00.000Z')
  assert.equal(late.facts.timeCheck, 'checked')

  const noon = checkMessage('Your order shipped.', { to: ny, now: () => new Date('2026-09-27T16:00:00Z') })
  assert.equal(noon.verdict, 'keep')
  assert.equal(noon.facts.recipient?.local[0].time, '2026-09-27T12:00')
  assert.equal(noon.facts.sendAt, '2026-09-27T16:00:00.000Z')

  // The window is start-inclusive, end-exclusive.
  assert.equal(checkMessage('x', { to: ny, sendAt: '2026-09-27T12:00:00Z' }).verdict, 'keep', '08:00')
  assert.equal(checkMessage('x', { to: ny, sendAt: '2026-09-28T01:00:00Z' }).verdict, 'fail', '21:00')
  assert.equal(checkMessage('x', { to: ny, sendAt: '2026-09-28T00:59:00Z' }).verdict, 'keep', '20:59')
})

test('quiet hours: Los Angeles, fixed clock, custom window', () => {
  const la = '+13105550100'
  const late = checkMessage('x', { to: la, sendAt: '2026-09-28T04:30:00Z' })
  assert.deepEqual(codes(late), ['quiet_hours'])
  assert.match(late.reasons[0].detail, /21:30 PDT/)
  assert.equal(checkMessage('x', { to: la, sendAt: '2026-09-28T01:30:00Z' }).verdict, 'keep')
  assert.equal(
    checkMessage('x', { to: la, sendAt: '2026-09-28T01:30:00Z', window: '09:00-18:00' }).verdict,
    'fail',
    '18:30 PDT is outside 09:00-18:00',
  )
  assert.throws(() => checkMessage('x', { window: '8am-9pm' }), GuardError)
  assert.throws(() => checkMessage('x', { sendAt: '2026-09-28T01:30:00' }), /offset or Z/)
})

test('time zones: an ambiguous area code is reviewed, not guessed', () => {
  // 850 spans Eastern and Central. 21:30 EDT is 20:30 CDT: the zones disagree.
  const split = checkMessage('x', { to: '+18505550100', sendAt: '2026-09-28T01:30:00Z' })
  assert.equal(split.verdict, 'review')
  assert.deepEqual(codes(split), ['timezone_ambiguous'])
  assert.deepEqual(split.facts.recipient?.timezones, ['America/New_York', 'America/Chicago'])
  assert.equal(split.facts.recipient?.timezone, null)
  assert.equal(split.facts.recipient?.inWindow, false)

  // Outside in both: a certain fail.
  const both = checkMessage('x', { to: '+18505550100', sendAt: '2026-09-28T05:00:00Z' })
  assert.deepEqual(codes(both), ['quiet_hours'])

  // Inside in both: nothing to decide.
  const fine = checkMessage('x', { to: '+18505550100', sendAt: '2026-09-27T17:00:00Z' })
  assert.equal(fine.verdict, 'keep')
  assert.match(fine.notes[0], /inside 08:00-21:00 in every one of them/)

  // A country with more than one zone.
  const spain = checkMessage('x', { to: '+34 612 345 678', sendAt: '2026-09-27T19:30:00Z' })
  assert.deepEqual(codes(spain), ['timezone_ambiguous'])
})

test('time zones: unknown, invalid, and assumed numbers', () => {
  const tollFree = checkMessage('x', { to: '+18005550100', sendAt: '2026-09-27T17:00:00Z' })
  assert.deepEqual(codes(tollFree), ['timezone_unknown'])
  assert.equal(tollFree.facts.timeCheck, 'skipped')

  const morocco = checkMessage('x', { to: '+212 600 123456', sendAt: '2026-09-27T17:00:00Z' })
  assert.deepEqual(codes(morocco), ['timezone_unknown'])

  const bad = checkMessage('x', { to: '555-0100' })
  assert.equal(bad.verdict, 'fail')
  assert.deepEqual(codes(bad), ['invalid_number'])

  const assumed = checkMessage('x', { to: '(212) 555-0100', sendAt: '2026-09-27T17:00:00Z' })
  assert.equal(assumed.verdict, 'keep')
  assert.equal(assumed.facts.recipient?.assumedNanp, true)
  assert.match(assumed.notes.join(' '), /read as a US or Canadian number, \+12125550100/)

  const uk = checkMessage('x', { to: '+447700900123', sendAt: '2026-09-27T22:30:00Z' })
  assert.deepEqual(codes(uk), ['quiet_hours'], '23:30 BST')
})

// Content

test('url_shortener: public shorteners are reviewed, lookalike domains are not', () => {
  for (const text of ['See bit.ly/3xYz', 'https://www.tinyurl.com/abc', 'go to t.co/x now', 'BIT.LY/abc']) {
    assert.deepEqual(codes(checkMessage(text)), ['url_shortener'], text)
  }
  for (const text of ['Visit att.com/deals', 'Email me at ana@bit.ly.example', 'see https://t.com/x', 'rebit.ly']) {
    assert.deepEqual(codes(checkMessage(text)), [], text)
  }
})

test('no_opt_out: only on a first message, English and Spanish wording', () => {
  const plain = 'Hi Ana, this is Sam from Brightside. Your quote is ready.'
  assert.deepEqual(codes(checkMessage(plain, { firstMessage: true })), ['no_opt_out'])
  assert.deepEqual(codes(checkMessage(plain)), [], 'not a first message')
  for (const suffix of [
    ' Reply STOP to opt out.',
    ' Text stop to unsubscribe.',
    ' Msg&data rates may apply. STOP to end.',
    ' Responde STOP para no recibir mas mensajes.',
    ' Responde BAJA para darte de baja.',
  ]) {
    assert.deepEqual(codes(checkMessage(plain + suffix, { firstMessage: true })), [], suffix)
  }
  assert.deepEqual(
    codes(checkMessage('Stop by our office any time.', { firstMessage: true })),
    ['no_opt_out'],
    'the word stop in a sentence is not an opt-out',
  )
})

// Report

test('formatText: verdict first, facts, reasons grouped', () => {
  const r = checkMessage(SPANISH, { to: '+13055550100', sendAt: '2026-09-27T23:30:00Z' })
  const text = formatText(r, { colour: false })
  assert.match(text, /^\nFAIL {2}Do not send this as it stands\n/)
  assert.match(text, /Segments +11 of up to 67 units each \(limit 5\)/)
  assert.match(text, /Local time +Sun 19:30 EDT, inside 08:00-21:00/)
  assert.match(text, /\nFAIL\n {2}Too many segments\n/)
  assert.match(text, /\nNOTE\n {2}Sent as UCS-2\n/)
})

// MCP

/**
 * @param {object[]} messages
 * @param {Parameters<typeof serve>[0]} [options]
 * @returns {Promise<any[]>}
 */
async function mcpSession(messages, options = {}) {
  const input = new PassThrough()
  const output = new PassThrough()
  /** @type {string[]} */
  const chunks = []
  output.on('data', (c) => chunks.push(String(c)))
  const done = serve({
    input,
    output,
    checkOptions: { now: () => new Date('2026-09-27T16:00:00Z') },
    ...options,
  })
  for (const m of messages) input.write(`${JSON.stringify(m)}\n`)
  input.end()
  await done
  return chunks.join('').trim().split('\n').map((l) => JSON.parse(l))
}

test('mcp: initialize, list tools, check and split', async () => {
  const replies = await mcpSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'check_sms', arguments: { text: 'Your order shipped.', to: '+12125550100' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'check_sms', arguments: { text: SPANISH } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'split_sms', arguments: { text: SPANISH } } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'check_sms', arguments: { text: 'x', window: 'nope' } } },
    { jsonrpc: '2.0', id: 7, method: 'nope' },
  ])
  const byId = Object.fromEntries(replies.map((r) => [r.id, r]))

  assert.equal(replies.length, 7, 'the notification gets no reply')
  assert.equal(byId[1].result.protocolVersion, '2025-06-18')
  assert.equal(byId[1].result.serverInfo.name, 'sms-guard')
  assert.match(byId[1].result.instructions, /never send/i)
  assert.deepEqual(byId[2].result.tools.map((/** @type {{name: string}} */ t) => t.name), ['check_sms', 'split_sms'])

  const ok = byId[3].result.structuredContent
  assert.equal(ok.verdict, 'keep')
  assert.equal(ok.passed, true)
  assert.equal(ok.facts.recipient.local[0].label, 'Sun 12:00 EDT', 'uses the injected clock')
  assert.deepEqual(JSON.parse(byId[3].result.content[0].text), ok)

  assert.equal(byId[4].result.structuredContent.verdict, 'fail')
  assert.equal(byId[4].result.structuredContent.reasons[0].code, 'too_many_segments')

  const split = byId[5].result.structuredContent
  assert.equal(split.count, split.parts.length)
  for (const p of split.parts) assert.ok(p.segments <= 5)

  assert.equal(byId[6].result.isError, true)
  assert.match(byId[6].result.content[0].text, /window must be HH:MM-HH:MM/)
  assert.equal(byId[7].error.code, -32601)
})

// CLI

/**
 * @param {string[]} args
 * @param {string} [stdin]
 */
function cli(args, stdin) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input: stdin,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

test('cli: exit codes 0 keep, 1 fail or review, 2 could not run', () => {
  const keep = cli(['Your order shipped.', '--to', '+12125550100', '--at', '2026-09-27T16:00:00Z'])
  assert.equal(keep.status, 0, keep.stderr)
  assert.match(keep.stdout, /^\nPASS {2}OK to send/)

  const fail = cli(['Your order shipped.', '--to', '+12125550100', '--at', '2026-09-28T02:00:00Z'])
  assert.equal(fail.status, 1)
  assert.match(fail.stdout, /Outside allowed hours/)

  const review = cli(['See bit.ly/x'])
  assert.equal(review.status, 1)
  assert.match(review.stdout, /^\nREVIEW/)

  assert.equal(cli(['x', '--window', '9-5']).status, 2)
  assert.equal(cli(['x', '--at', 'tomorrow']).status, 2)
  assert.equal(cli(['x', '--max-segments', '0']).status, 2)
  assert.equal(cli(['x', '--bogus']).status, 2)
  assert.match(cli(['--version']).stdout, /^\d+\.\d+\.\d+\n$/)
})

test('cli: standard input, --json and --split', () => {
  const json = cli(['-', '--json'], `${SPANISH}\n`)
  assert.equal(json.status, 1)
  const result = JSON.parse(json.stdout)
  assert.equal(result.verdict, 'fail')
  assert.equal(result.facts.characters, [...SPANISH].length, 'trailing newline dropped')

  const split = cli(['--split'], SPANISH)
  assert.equal(split.status, 0, split.stderr)
  assert.match(split.stdout, /PASS {2}\d+ messages, each within 5 segments/)
  assert.match(split.stdout, /\n {2}1\/\d+ {2}\d segments?, UCS-2/)

  const splitJson = JSON.parse(cli(['--split', '--json', '--max-segments', '2'], SPANISH).stdout)
  assert.equal(splitJson.maxSegments, 2)
  for (const p of splitJson.parts) assert.ok(p.segments <= 2)
})

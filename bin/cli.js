#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import {
  checkMessage,
  splitMessage,
  GuardError,
  DEFAULT_MAX_SEGMENTS,
  DEFAULT_WINDOW,
} from '../src/index.js'
import { formatText, formatSplit } from '../src/report.js'
import { serve } from '../src/mcp.js'
import { VERSION } from '../src/version.js'

const USAGE = `
sms-guard <"message text" | message.txt | ->
sms-guard mcp

  Checks a text message before you send it, and says whether it is safe to.
  Counts segments the way the network does (GSM-7 or UCS-2), names the characters
  that force UCS-2, checks the send time against the recipient's local time, and
  flags public link shorteners and a missing opt-out on a first message. Runs
  locally, no network.

Options
  --to <number>         Recipient, E.164 preferred (+13055550100). A number with
                        no + and 10 digits is read as US or Canadian.
  --at <time>           When it will be sent, ISO 8601 with an offset or Z.
                        Default now.
  --max-segments <n>    Fail above this many segments. Default ${DEFAULT_MAX_SEGMENTS}.
  --window <HH:MM-HH:MM>
                        Allowed recipient local time. Default ${DEFAULT_WINDOW}.
  --first-message       First text to this person: look for opt-out wording.
  --split               Print the message split into parts that each fit
                        --max-segments, to send in order.
  --json                Machine-readable output.
  --no-colour           Plain text.
  --version, --help

  Reads standard input when given "-", or no text and piped input. Trailing
  newlines in a file or standard input are dropped.

Exit codes
  0  OK to send (with --split: every part fits)
  1  do not send as it stands: failed, or needs a person to review
  2  could not run

Examples
  npx @askeleven/sms-guard "Hi Ana, your table for 4 is booked for 7pm." --to +13055550100
  npx @askeleven/sms-guard message.txt --to +447700900123 --first-message --json
  npx @askeleven/sms-guard message.txt --split
  npx @askeleven/sms-guard mcp       # MCP server over stdio, for agents
`

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
async function main(argv) {
  if (argv[0] === 'mcp') {
    await serve()
    return 0
  }

  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        to: { type: 'string' },
        at: { type: 'string' },
        'max-segments': { type: 'string' },
        window: { type: 'string' },
        'first-message': { type: 'boolean', default: false },
        split: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        // parseArgs has no --no-x negation, so both spellings are declared explicitly.
        'no-colour': { type: 'boolean', default: false },
        'no-color': { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    })
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n${USAGE}`)
    return 2
  }
  const { values, positionals } = parsed

  if (values.help) {
    process.stdout.write(USAGE)
    return 0
  }
  if (values.version) {
    process.stdout.write(`${VERSION}\n`)
    return 0
  }

  let maxSegments = DEFAULT_MAX_SEGMENTS
  if (values['max-segments'] !== undefined) {
    maxSegments = Number(values['max-segments'])
    if (!Number.isInteger(maxSegments) || maxSegments < 1) {
      process.stderr.write(`--max-segments must be a whole number of 1 or more, got ${values['max-segments']}\n`)
      return 2
    }
  }

  let text
  try {
    text = await readInput(positionals)
  } catch (error) {
    process.stderr.write(`${/** @type {Error} */ (error).message}\n`)
    return 2
  }

  const colour = useColour(values)

  if (values.split) {
    const parts = splitMessage(text, { maxSegments })
    if (values.json) {
      process.stdout.write(`${JSON.stringify({ maxSegments, parts }, null, 2)}\n`)
    } else if (parts.length === 0) {
      process.stdout.write('\nThe message is empty. Nothing to split.\n\n')
    } else {
      process.stdout.write(formatSplit(parts, { maxSegments, colour }))
    }
    return parts.length > 0 && parts.every((p) => p.segments <= maxSegments) ? 0 : 1
  }

  let result
  try {
    result = checkMessage(text, {
      to: values.to,
      sendAt: values.at,
      maxSegments,
      window: values.window,
      firstMessage: values['first-message'],
    })
  } catch (error) {
    if (error instanceof GuardError) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    throw error
  }

  if (values.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(formatText(result, { colour }))
  }
  return result.verdict === 'keep' ? 0 : 1
}

/**
 * One positional that names a file is read from it; "-", or nothing with input piped
 * in, reads standard input; anything else is the message itself, words joined by
 * single spaces the way the shell split them.
 *
 * @param {string[]} positionals
 * @returns {Promise<string>}
 */
async function readInput(positionals) {
  if (positionals.length === 0 || (positionals.length === 1 && positionals[0] === '-')) {
    if (process.stdin.isTTY) throw new Error(`Give the message, a file, or pipe it in.\n${USAGE}`)
    return dropTrailingNewlines(await readStdin())
  }
  if (positionals.length === 1 && existsSync(positionals[0]) && statSync(positionals[0]).isFile()) {
    return dropTrailingNewlines(await readFile(positionals[0], 'utf8'))
  }
  return positionals.join(' ')
}

/**
 * @param {string} text
 * @returns {string}
 */
function dropTrailingNewlines(text) {
  return text.replace(/[\r\n]+$/, '')
}

/** @returns {Promise<string>} */
async function readStdin() {
  /** @type {Buffer[]} */
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Honours --no-colour, --no-color, NO_COLOR, and a non-TTY stdout.
 *
 * @param {Record<string, unknown>} values
 * @returns {boolean}
 */
function useColour(values) {
  if (values['no-colour'] || values['no-color']) return false
  if (process.env.NO_COLOR) return false
  return process.stdout.isTTY === true
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    process.stderr.write(`${error?.stack ?? error}\n`)
    process.exitCode = 2
  },
)

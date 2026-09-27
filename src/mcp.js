import { createInterface } from 'node:readline'
import {
  checkMessage,
  splitMessage,
  GuardError,
  DEFAULT_MAX_SEGMENTS,
  DEFAULT_WINDOW,
} from './index.js'
import { VERSION } from './version.js'

/**
 * A Model Context Protocol server over stdio, written against the spec directly so the
 * package keeps zero runtime dependencies. Messages are newline-delimited JSON-RPC 2.0.
 */

/** Newest first. The first is offered when a client asks for one we do not know. */
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

/** Characters in one message. A text this long is a document, not an SMS. */
const MAX_TEXT = 20_000

const INSTRUCTIONS =
  'Call check_sms before sending any SMS, with the recipient number as to. Never send ' +
  'a message whose verdict is fail. If it failed on too_many_segments, call split_sms ' +
  'and send the parts it returns instead, in order, as separate messages. If it failed ' +
  'on quiet_hours, schedule it for the recipient\'s morning (nextWindowStart) rather ' +
  'than sending now. If the verdict is review, show the review reasons to a person and ' +
  'let them decide; do not decide for them.'

const MAX_SEGMENTS_PROPERTY = {
  type: 'integer',
  minimum: 1,
  description: `Most segments one message may use. Default ${DEFAULT_MAX_SEGMENTS}.`,
}

const TEXT_PROPERTY = {
  type: 'string',
  maxLength: MAX_TEXT,
  description: 'The message, exactly as it will be sent.',
}

const TOOLS = [
  {
    name: 'check_sms',
    title: 'Check a text message before sending',
    description:
      'Checks one SMS before you send it. Returns verdict (keep, review or fail), reasons ' +
      'with a stable code and a plain-English detail, and facts: GSM-7 or UCS-2, the ' +
      'characters forcing UCS-2, segment count, and the recipient\'s time zone and local ' +
      'send time. Fails on too many segments (carriers refuse long multi-part messages ' +
      'even when the provider API accepts them), a send time outside the recipient\'s ' +
      'allowed hours, an invalid number, or an empty message. Flags public link ' +
      'shorteners, an unknown or ambiguous time zone, and a first message with no ' +
      'opt-out wording for review. Runs locally.',
    inputSchema: {
      type: 'object',
      properties: {
        text: TEXT_PROPERTY,
        to: {
          type: 'string',
          description:
            'Recipient, E.164 such as +13055550100. Without it the send time is not checked.',
        },
        send_at: {
          type: 'string',
          description: 'When it will be sent, ISO 8601 with an offset or Z. Default now.',
        },
        max_segments: MAX_SEGMENTS_PROPERTY,
        window: {
          type: 'string',
          description: `Allowed recipient local time, HH:MM-HH:MM. Default ${DEFAULT_WINDOW}.`,
        },
        first_message: {
          type: 'boolean',
          description: 'The first text to this person, so it needs opt-out wording. Default false.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'split_sms',
    title: 'Split a long text message into parts',
    description:
      'Splits a message that is too long into parts that each fit within max_segments, ' +
      'breaking at paragraphs, then lines, then sentences, then words. Send the parts in ' +
      'order as separate messages. Each part comes with its own encoding and segment count.',
    inputSchema: {
      type: 'object',
      properties: {
        text: TEXT_PROPERTY,
        max_segments: MAX_SEGMENTS_PROPERTY,
      },
      required: ['text'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
]

/**
 * @typedef {object} ServeOptions
 * @property {NodeJS.ReadableStream} [input]
 * @property {NodeJS.WritableStream} [output]
 * @property {Partial<import('./index.js').CheckOptions>} [checkOptions] Overrides for
 *   tests, such as a fixed clock.
 */

/**
 * Serves until the input stream closes.
 *
 * @param {ServeOptions} [options]
 * @returns {Promise<void>}
 */
export function serve(options = {}) {
  const { input = process.stdin, output = process.stdout } = options
  const send = (/** @type {object} */ message) => {
    output.write(`${JSON.stringify(message)}\n`)
  }

  /** @type {Promise<void>[]} */
  const pending = []
  const lines = createInterface({ input, crlfDelay: Infinity })
  lines.on('line', (line) => {
    if (!line.trim()) return
    pending.push(handleLine(line, send, options))
  })
  return new Promise((done) => {
    lines.on('close', () => {
      Promise.all(pending).then(() => done())
    })
  })
}

/**
 * @param {string} line
 * @param {(message: object) => void} send
 * @param {ServeOptions} options
 * @returns {Promise<void>}
 */
async function handleLine(line, send, options) {
  /** @type {any} */
  let message
  try {
    message = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }

  const isRequest = message && typeof message === 'object' && 'id' in message
  if (!isRequest) return // Notifications, including notifications/initialized.

  const { id, method, params } = message
  try {
    const result = await dispatch(method, params ?? {}, options)
    send({ jsonrpc: '2.0', id, result })
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32603
    send({ jsonrpc: '2.0', id, error: { code, message: /** @type {Error} */ (error).message } })
  }
}

class RpcError extends Error {
  /**
   * @param {number} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/**
 * @param {string} method
 * @param {any} params
 * @param {ServeOptions} options
 * @returns {Promise<object>}
 */
async function dispatch(method, params, options) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(params.protocolVersion)
          ? params.protocolVersion
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'sms-guard', title: 'sms-guard', version: VERSION },
        instructions: INSTRUCTIONS,
      }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call':
      return callTool(params.name, params.arguments ?? {}, options)
    default:
      throw new RpcError(-32601, `Method not found: ${method}`)
  }
}

/**
 * Tool failures are results with isError set, not protocol errors, so the model sees
 * the message and can act on it.
 *
 * @param {string} name
 * @param {any} args
 * @param {ServeOptions} options
 * @returns {Promise<object>}
 */
async function callTool(name, args, options) {
  if (name !== 'check_sms' && name !== 'split_sms') {
    throw new RpcError(-32602, `Unknown tool: ${name}`)
  }
  try {
    const payload = name === 'check_sms' ? checkSms(args, options) : splitSms(args)
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    }
  } catch (error) {
    if (error instanceof GuardError || error instanceof ToolInputError) {
      return { content: [{ type: 'text', text: error.message }], isError: true }
    }
    throw error
  }
}

class ToolInputError extends Error {}

/**
 * @param {any} args
 * @returns {string}
 */
function textArg(args) {
  if (typeof args.text !== 'string') throw new ToolInputError('text must be a string.')
  if (args.text.length > MAX_TEXT) {
    throw new ToolInputError(`text is over ${MAX_TEXT} characters, which is not a text message.`)
  }
  return args.text
}

/**
 * @param {any} args
 * @returns {number | undefined}
 */
function maxSegmentsArg(args) {
  if (args.max_segments === undefined) return undefined
  if (!Number.isInteger(args.max_segments) || args.max_segments < 1) {
    throw new ToolInputError('max_segments must be a whole number of 1 or more.')
  }
  return args.max_segments
}

/**
 * @param {any} args
 * @param {ServeOptions} options
 */
function checkSms(args, options) {
  const text = textArg(args)
  for (const key of ['to', 'send_at', 'window']) {
    if (args[key] !== undefined && typeof args[key] !== 'string') {
      throw new ToolInputError(`${key} must be a string.`)
    }
  }
  const result = checkMessage(text, {
    ...options.checkOptions,
    to: args.to,
    sendAt: args.send_at,
    maxSegments: maxSegmentsArg(args),
    window: args.window,
    firstMessage: args.first_message === true,
  })
  return { passed: result.verdict === 'keep', ...result }
}

/**
 * @param {any} args
 */
function splitSms(args) {
  const text = textArg(args)
  const maxSegments = maxSegmentsArg(args) ?? DEFAULT_MAX_SEGMENTS
  const parts = splitMessage(text, { maxSegments })
  if (parts.length === 0) throw new ToolInputError('The message is empty. Nothing to split.')
  return { count: parts.length, maxSegments, parts }
}

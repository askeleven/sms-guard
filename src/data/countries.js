/**
 * Country calling codes (outside +1) mapped to IANA time zones.
 *
 * A country with more than one zone lists them all and is reported as ambiguous. The
 * number alone cannot say whether a Spanish mobile is in Madrid or the Canary Islands,
 * so sms-guard does not guess. Countries not listed here are reported as unknown.
 *
 * Calling codes are prefix-free, so a number matches at most one row.
 *
 * @type {Record<string, [string, string | string[]]>}
 */
const ROWS = {
  // Europe
  30: ['Greece', 'Europe/Athens'],
  31: ['Netherlands', 'Europe/Amsterdam'],
  32: ['Belgium', 'Europe/Brussels'],
  33: ['France', 'Europe/Paris'],
  34: ['Spain', ['Europe/Madrid', 'Atlantic/Canary']],
  36: ['Hungary', 'Europe/Budapest'],
  39: ['Italy', 'Europe/Rome'],
  40: ['Romania', 'Europe/Bucharest'],
  41: ['Switzerland', 'Europe/Zurich'],
  43: ['Austria', 'Europe/Vienna'],
  44: ['United Kingdom', 'Europe/London'],
  45: ['Denmark', 'Europe/Copenhagen'],
  46: ['Sweden', 'Europe/Stockholm'],
  47: ['Norway', 'Europe/Oslo'],
  48: ['Poland', 'Europe/Warsaw'],
  49: ['Germany', 'Europe/Berlin'],
  351: ['Portugal', ['Europe/Lisbon', 'Atlantic/Azores']],
  352: ['Luxembourg', 'Europe/Luxembourg'],
  353: ['Ireland', 'Europe/Dublin'],
  358: ['Finland', 'Europe/Helsinki'],
  420: ['Czechia', 'Europe/Prague'],

  // Latin America
  52: ['Mexico', ['America/Mexico_City', 'America/Cancun', 'America/Chihuahua', 'America/Hermosillo', 'America/Mazatlan', 'America/Tijuana']],
  54: ['Argentina', 'America/Argentina/Buenos_Aires'],
  55: ['Brazil', ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Rio_Branco', 'America/Noronha']],
  56: ['Chile', ['America/Santiago', 'America/Punta_Arenas', 'Pacific/Easter']],
  57: ['Colombia', 'America/Bogota'],
  58: ['Venezuela', 'America/Caracas'],
  502: ['Guatemala', 'America/Guatemala'],
  503: ['El Salvador', 'America/El_Salvador'],
  504: ['Honduras', 'America/Tegucigalpa'],
  505: ['Nicaragua', 'America/Managua'],
  506: ['Costa Rica', 'America/Costa_Rica'],
  507: ['Panama', 'America/Panama'],
  51: ['Peru', 'America/Lima'],
  591: ['Bolivia', 'America/La_Paz'],
  593: ['Ecuador', ['America/Guayaquil', 'Pacific/Galapagos']],
  595: ['Paraguay', 'America/Asuncion'],
  598: ['Uruguay', 'America/Montevideo'],

  // Elsewhere
  27: ['South Africa', 'Africa/Johannesburg'],
  61: ['Australia', ['Australia/Sydney', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth']],
  63: ['Philippines', 'Asia/Manila'],
  64: ['New Zealand', ['Pacific/Auckland', 'Pacific/Chatham']],
  65: ['Singapore', 'Asia/Singapore'],
  81: ['Japan', 'Asia/Tokyo'],
  82: ['South Korea', 'Asia/Seoul'],
  86: ['China', 'Asia/Shanghai'],
  91: ['India', 'Asia/Kolkata'],
  234: ['Nigeria', 'Africa/Lagos'],
  254: ['Kenya', 'Africa/Nairobi'],
  852: ['Hong Kong', 'Asia/Hong_Kong'],
  971: ['United Arab Emirates', 'Asia/Dubai'],
  972: ['Israel', 'Asia/Jerusalem'],
}

/** @type {Map<string, import('./nanp.js').ZoneEntry>} */
export const COUNTRY_CODES = new Map(
  Object.entries(ROWS).map(([code, [region, zone]]) => [
    code,
    { region, zones: Array.isArray(zone) ? zone : [zone] },
  ]),
)

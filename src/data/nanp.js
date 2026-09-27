/**
 * Geographic NANP area codes for the US, its territories, Canada, and the Caribbean
 * countries on +1, mapped to IANA time zones.
 *
 * An area code whose territory crosses a time zone line lists every zone it covers,
 * and sms-guard reports it as ambiguous instead of picking one. Zones follow the
 * official boundaries, not local habit (a town that unofficially keeps its
 * neighbour's time is not listed separately). Where we were not sure an area code
 * stays inside one zone, it is listed as ambiguous: a question to a person is cheaper
 * than a text at the wrong hour.
 *
 * Non-geographic codes (toll-free 8XX, 500, 600, 700, 900) are left out on purpose:
 * they say nothing about where the phone is.
 *
 * Each row is [region, zone or zones, area codes].
 *
 * @type {Array<[string, string | string[], string[]]>}
 */
const ROWS = [
  // United States
  ['Alabama', 'America/Chicago', ['205', '251', '256', '334', '659', '938']],
  // The Aleutians west of 169.5W keep Hawaii-Aleutian time.
  ['Alaska', ['America/Anchorage', 'America/Adak'], ['907']],
  ['Arizona', 'America/Phoenix', ['480', '520', '602', '623']],
  // Northern Arizona includes the Navajo Nation, which observes daylight saving time.
  ['Arizona', ['America/Phoenix', 'America/Denver'], ['928']],
  ['Arkansas', 'America/Chicago', ['327', '479', '501', '870']],
  [
    'California',
    'America/Los_Angeles',
    [
      '209', '213', '279', '310', '323', '341', '350', '369', '408', '415', '424',
      '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661',
      '669', '707', '714', '747', '760', '805', '818', '820', '831', '840', '858',
      '909', '916', '925', '949', '951',
    ],
  ],
  ['Colorado', 'America/Denver', ['303', '719', '720', '970', '983']],
  ['Connecticut', 'America/New_York', ['203', '475', '860', '959']],
  ['Delaware', 'America/New_York', ['302']],
  ['District of Columbia', 'America/New_York', ['202', '771']],
  [
    'Florida',
    'America/New_York',
    [
      '239', '305', '321', '324', '352', '386', '407', '561', '645', '656', '689',
      '727', '754', '772', '786', '813', '863', '904', '941', '954',
    ],
  ],
  // The panhandle west of the Apalachicola River is Central.
  ['Florida', ['America/New_York', 'America/Chicago'], ['448', '850']],
  [
    'Georgia',
    'America/New_York',
    ['229', '404', '470', '478', '678', '706', '762', '770', '912'],
  ],
  ['Hawaii', 'Pacific/Honolulu', ['808']],
  // The panhandle is Pacific, the south is Mountain.
  ['Idaho', ['America/Boise', 'America/Los_Angeles'], ['208', '986']],
  [
    'Illinois',
    'America/Chicago',
    [
      '217', '224', '309', '312', '331', '447', '464', '618', '630', '708', '730',
      '773', '779', '815', '847', '872',
    ],
  ],
  ['Indiana', 'America/Indiana/Indianapolis', ['260', '317', '463', '765']],
  // Northwest and southwest Indiana are Central; the rest is Eastern.
  [
    'Indiana',
    ['America/Chicago', 'America/Indiana/Indianapolis'],
    ['219', '574', '812', '930'],
  ],
  ['Iowa', 'America/Chicago', ['319', '515', '563', '641', '712']],
  ['Kansas', 'America/Chicago', ['316', '913']],
  // Four western counties are Mountain.
  ['Kansas', ['America/Chicago', 'America/Denver'], ['620', '785']],
  ['Kentucky', 'America/Kentucky/Louisville', ['502', '859']],
  ['Kentucky', ['America/Kentucky/Louisville', 'America/Chicago'], ['270', '364', '606']],
  ['Louisiana', 'America/Chicago', ['225', '318', '337', '504', '985']],
  ['Maine', 'America/New_York', ['207']],
  ['Maryland', 'America/New_York', ['227', '240', '301', '410', '443', '667']],
  [
    'Massachusetts',
    'America/New_York',
    ['339', '351', '413', '508', '617', '774', '781', '857', '978'],
  ],
  [
    'Michigan',
    'America/Detroit',
    [
      '231', '248', '269', '313', '517', '586', '616', '679', '734', '810', '947',
      '989',
    ],
  ],
  // Four Upper Peninsula counties on the Wisconsin border are Central.
  ['Michigan', ['America/Detroit', 'America/Menominee'], ['906']],
  ['Minnesota', 'America/Chicago', ['218', '320', '507', '612', '651', '763', '952']],
  ['Mississippi', 'America/Chicago', ['228', '601', '662', '769']],
  [
    'Missouri',
    'America/Chicago',
    ['314', '417', '557', '573', '636', '660', '816', '975'],
  ],
  ['Montana', 'America/Denver', ['406']],
  ['Nebraska', 'America/Chicago', ['402', '531']],
  ['Nebraska', ['America/Chicago', 'America/Denver'], ['308']],
  ['Nevada', 'America/Los_Angeles', ['702', '725']],
  // West Wendover is officially Mountain.
  ['Nevada', ['America/Los_Angeles', 'America/Denver'], ['775']],
  ['New Hampshire', 'America/New_York', ['603']],
  [
    'New Jersey',
    'America/New_York',
    ['201', '551', '609', '640', '732', '848', '856', '862', '908', '973'],
  ],
  ['New Mexico', 'America/Denver', ['505', '575']],
  [
    'New York',
    'America/New_York',
    [
      '212', '315', '329', '332', '347', '363', '516', '518', '585', '607', '624',
      '631', '646', '680', '716', '718', '838', '845', '914', '917', '929', '934',
    ],
  ],
  [
    'North Carolina',
    'America/New_York',
    ['252', '336', '472', '704', '743', '828', '910', '919', '980', '984'],
  ],
  // The southwest is Mountain.
  ['North Dakota', ['America/Chicago', 'America/Denver'], ['701']],
  [
    'Ohio',
    'America/New_York',
    [
      '216', '220', '234', '283', '326', '330', '380', '419', '436', '440', '513',
      '567', '614', '740', '937',
    ],
  ],
  ['Oklahoma', 'America/Chicago', ['405', '539', '572', '580', '918']],
  ['Oregon', 'America/Los_Angeles', ['503', '971']],
  // Most of Malheur County is Mountain.
  ['Oregon', ['America/Los_Angeles', 'America/Boise'], ['458', '541']],
  [
    'Pennsylvania',
    'America/New_York',
    [
      '215', '223', '267', '272', '412', '445', '484', '570', '582', '610', '717',
      '724', '814', '835', '878',
    ],
  ],
  ['Rhode Island', 'America/New_York', ['401']],
  ['South Carolina', 'America/New_York', ['803', '821', '839', '843', '854', '864']],
  // East river is Central, west river is Mountain.
  ['South Dakota', ['America/Chicago', 'America/Denver'], ['605']],
  ['Tennessee', 'America/Chicago', ['615', '629', '731', '901']],
  ['Tennessee', 'America/New_York', ['865']],
  // Both cover counties close to the Eastern/Central line.
  ['Tennessee', ['America/New_York', 'America/Chicago'], ['423', '931']],
  [
    'Texas',
    'America/Chicago',
    [
      '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469',
      '512', '682', '713', '726', '737', '806', '817', '830', '832', '903', '936',
      '940', '945', '956', '972', '979',
    ],
  ],
  // El Paso and Hudspeth counties.
  ['Texas', 'America/Denver', ['915']],
  ['Utah', 'America/Denver', ['385', '435', '801']],
  ['Vermont', 'America/New_York', ['802']],
  [
    'Virginia',
    'America/New_York',
    ['276', '434', '540', '571', '686', '703', '757', '804', '826', '948'],
  ],
  ['Washington', 'America/Los_Angeles', ['206', '253', '360', '425', '509', '564']],
  ['West Virginia', 'America/New_York', ['304', '681']],
  [
    'Wisconsin',
    'America/Chicago',
    ['262', '274', '353', '414', '534', '608', '715', '920'],
  ],
  ['Wyoming', 'America/Denver', ['307']],

  // US territories
  ['Puerto Rico', 'America/Puerto_Rico', ['787', '939']],
  ['US Virgin Islands', 'America/St_Thomas', ['340']],
  ['Guam', 'Pacific/Guam', ['671']],
  ['Northern Mariana Islands', 'Pacific/Saipan', ['670']],
  ['American Samoa', 'Pacific/Pago_Pago', ['684']],

  // Canada
  ['Alberta', 'America/Edmonton', ['368', '403', '587', '780', '825']],
  // 604 is the Lower Mainland only. The province-wide overlays also cover the East
  // Kootenays (Mountain) and the Peace River region (Mountain, no daylight saving).
  ['British Columbia', 'America/Vancouver', ['604']],
  [
    'British Columbia',
    ['America/Vancouver', 'America/Edmonton', 'America/Dawson_Creek'],
    ['236', '250', '672', '778'],
  ],
  ['Manitoba', 'America/Winnipeg', ['204', '431', '584']],
  ['New Brunswick', 'America/Moncton', ['428', '506']],
  // Labrador is mostly on Atlantic time.
  ['Newfoundland and Labrador', ['America/St_Johns', 'America/Goose_Bay'], ['709', '879']],
  ['Nova Scotia and Prince Edward Island', 'America/Halifax', ['782', '902']],
  [
    'Ontario',
    'America/Toronto',
    [
      '226', '249', '289', '343', '365', '382', '416', '437', '519', '548', '613',
      '647', '683', '705', '742', '753', '905', '942',
    ],
  ],
  // Northwestern Ontario west of 90W is Central; Atikokan keeps Eastern Standard.
  ['Ontario', ['America/Toronto', 'America/Winnipeg', 'America/Atikokan'], ['807']],
  [
    'Quebec',
    'America/Toronto',
    ['263', '354', '438', '450', '468', '514', '579', '819', '873'],
  ],
  // Eastern Quebec includes the Magdalen Islands and the Lower North Shore, which
  // are on Atlantic time.
  ['Quebec', ['America/Toronto', 'America/Halifax', 'America/Blanc-Sablon'], ['367', '418', '581']],
  // Lloydminster, on the Alberta border, keeps Alberta time.
  ['Saskatchewan', ['America/Regina', 'America/Edmonton'], ['306', '474', '639']],
  [
    'Yukon, Northwest Territories and Nunavut',
    ['America/Whitehorse', 'America/Edmonton', 'America/Winnipeg', 'America/Toronto'],
    ['867'],
  ],

  // Caribbean and Atlantic countries on +1
  ['Anguilla', 'America/Anguilla', ['264']],
  ['Antigua and Barbuda', 'America/Antigua', ['268']],
  ['Bahamas', 'America/Nassau', ['242']],
  ['Barbados', 'America/Barbados', ['246']],
  ['Bermuda', 'Atlantic/Bermuda', ['441']],
  ['British Virgin Islands', 'America/Tortola', ['284']],
  ['Cayman Islands', 'America/Cayman', ['345']],
  ['Dominica', 'America/Dominica', ['767']],
  ['Dominican Republic', 'America/Santo_Domingo', ['809', '829', '849']],
  ['Grenada', 'America/Grenada', ['473']],
  ['Jamaica', 'America/Jamaica', ['658', '876']],
  ['Montserrat', 'America/Montserrat', ['664']],
  ['Saint Kitts and Nevis', 'America/St_Kitts', ['869']],
  ['Saint Lucia', 'America/St_Lucia', ['758']],
  ['Saint Vincent and the Grenadines', 'America/St_Vincent', ['784']],
  ['Sint Maarten', 'America/Lower_Princes', ['721']],
  ['Trinidad and Tobago', 'America/Port_of_Spain', ['868']],
  ['Turks and Caicos Islands', 'America/Grand_Turk', ['649']],
]

/**
 * @typedef {object} ZoneEntry
 * @property {string} region State, province, territory or country.
 * @property {string[]} zones IANA zones. More than one means ambiguous.
 */

/** @type {Map<string, ZoneEntry>} */
export const NANP_AREA_CODES = new Map()
for (const [region, zone, codes] of ROWS) {
  for (const code of codes) {
    if (NANP_AREA_CODES.has(code)) throw new Error(`Area code ${code} is listed twice.`)
    NANP_AREA_CODES.set(code, { region, zones: Array.isArray(zone) ? zone : [zone] })
  }
}

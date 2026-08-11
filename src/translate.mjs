// Chinese address -> English, following Chunghwa Post's writing rules.
//
// Nothing here is romanized on the fly: every name comes from one of the two
// official bilingual tables (see scripts/pack_en.py). A name the tables do not
// carry stays Chinese in `parts`, is reported in `untranslated`, and empties
// `english` — a wrong English street name is worse than an honest miss, since
// the sender cannot tell it went wrong.

import { PackedTable, normalize, tokenize } from './zipcodetw.mjs';

/**
 * @import { AddressToken } from './zipcodetw.d.ts'
 * @import { Mailbox, MailboxRecord } from './mailbox.d.ts'
 * @import { TranslationData, TranslationParts, TranslationResult,
 *   TranslateOptions, LoadTranslatorOptions } from './translate.d.ts'
 */

const NO = 0, SUBNO = 1, NAME = 2, UNIT = 3;

/** The county/city half of a place key, e.g. '臺北市' of '臺北市信義區'. */
const CITY_RE = /^.+?[縣市]/u;

// Bounds longestPlace() when it matches a city or a district, never both at
// once: translate() strips the city first and scans the district separately
// (see the two calls below), so what this needs to cover is the longer of
// the two components alone. The longest district is 4 ('阿里山鄉'); full
// place-table keys join city+district and run up to 7 ('嘉義縣阿里山鄉'), but
// no single scan ever sees that whole string.
const MAX_PLACE_CHARS = 6;

/** The longest name in the road table is 13 ('延平路2段430巷居易1弄'). */
const MAX_ROAD_CHARS = 14;

const DEFAULT_COUNTRY = 'Taiwan (R.O.C.)';

/** A ZIP code or 臺灣 in front of the address is the answer, not the question. */
const LEADING_ZIPCODE_RE = /^\s*(?:\d{3}(?:\d{2,3})?)?\s*(?:臺灣|台灣|Taiwan)?\s*/u;

/** Units the ZIP tokenizer has no reason to know; see translate(). */
const EXTRA_UNITS_RE = /(\d+)\s*([室房衖])/gu;

/** 5樓之2, which the tokenizer would leave as a loose 之2 fragment. */
const FLOOR_SUB_RE = /(\d+)\s*[樓F]\s*之\s*(\d+)/u;

/** '5F', which people type as often as they type 5樓. */
const FLOOR_LATIN_RE = /(\d+)\s*F(?![A-Za-z])/u;

/** Numbered units that can turn out to be part of the name before them. */
const CLOSING_FIELDS = /** @type {Record<string, 'section' | 'lane' | 'alley' | undefined>} */ ({
  段: 'section', 巷: 'lane', 弄: 'alley',
});

// Chinese-order fields; the English address is these reversed. A P.O. box
// sets only city + the two box fields, and a door-number address never sets
// those two, so the one order serves both.
const FIELD_ORDER = /** @type {const} */ ([
  'city', 'postOffice', 'poBox', 'district', 'village', 'neighborhood',
  'road', 'section', 'lane', 'alley', 'subAlley', 'number', 'floor', 'room',
]);

// The table holds bare names like 東興 alongside full ones, so the longest
// match can still stop mid-name: 東興1路 would match 東興 and orphan a '1路'
// that means nothing on an envelope. A match is only taken when it ends on a
// unit character, or when what follows can begin a field of its own.
/**
 * @param {string} name
 * @param {string} rest
 * @returns {boolean}
 */
function endsCleanly(name, rest) {
  return '路街道巷弄段村里號'.includes(name.slice(-1))
    || rest === ''
    || /^\d+(?:之\d+)?\s*[號樓巷弄段鄰]/u.test(rest);
}

// Shared with the Node entry point so the ZIP lookup sees the same address the
// translation does. Not part of the published API.
/**
 * @param {string} addrStr
 * @returns {string}
 */
export function stripAddressPrefix(addrStr) {
  return addrStr.replace(LEADING_ZIPCODE_RE, '');
}

export class Translator {
  /** @param {TranslationData} data */
  constructor({ roadTsv, districtTsv, verify = null, mailbox = null }) {
    this.roads = new PackedTable(roadTsv);
    this.places = new PackedTable(districtTsv);

    // P.O. box addresses carry their own English, so they never reach the
    // road and district tables. Optional for the same reason `verify` is: the
    // translator stays usable for anyone who has not loaded the box table.
    /** @type {Mailbox | null} */
    this.mailbox = mailbox;

    // The bilingual tables are nationwide and carry no location, so 四維三路
    // translates under 臺北市信義區 as readily as under the 高雄市苓雅區 it
    // belongs to. `verify` is the second opinion that catches it — normally
    // Directory.knowsRoad, which is why it is a callback rather than a
    // Directory: the translator stays usable without the 4MB ZIP index.
    /** @type {((address: string) => boolean) | null} */
    this.verify = verify;

    /** @type {Map<string, string | null> | null} built on first use, see districtIndex() */
    this.districts = null;
  }

  // '信義區' -> '臺北市信義區', for addresses that name no city. Ambiguous
  // district names map to null and stay untranslated rather than guess, the
  // same bargain Directory.aliasIndex() makes.
  /** @returns {Map<string, string | null>} */
  districtIndex() {
    if (this.districts) return this.districts;
    const index = this.districts = new Map();
    for (const key of this.places.keys()) {
      // City entries are named by their own key; district ones append to it.
      const value = this.places.get(key);
      if (value === undefined || !value.includes(', ')) continue;
      const city = CITY_RE.exec(key);
      if (!city) continue;
      const district = key.slice(city[0].length);
      if (!index.has(district)) index.set(district, key);
      else if (index.get(district) !== key) index.set(district, null);
    }
    return index;
  }

  // Place names are matched on the raw text, before tokenizing, because unit
  // characters are ordinary name characters too and the tokenizer has no way
  // to know which is which: 前鎮區中山2路 comes back as 前鎮 + 區中山2路, with
  // the 區 fused to the road. Matching the longest prefix the place table
  // recognizes sidesteps the ambiguity — and since every key ends in its own
  // unit character, a road can never be mistaken for a district.
  /**
   * @param {string} text
   * @param {(name: string) => boolean} known
   * @param {number} [max] longest name the table can hold
   * @returns {string} the matched prefix, or ''
   */
  static longestPlace(text, known, max = MAX_PLACE_CHARS) {
    let found = '';
    for (let n = 1; n <= max && n <= text.length; n++) {
      const name = text.slice(0, n);
      if (known(name)) found = name;
    }
    return found;
  }

  // The postal table keys roads by their whole name, so the name is looked up
  // whole. A miss on a name that carries a 村/里 is retried as the two halves
  // it usually is ('永和村' + '中正路'); anything still unmatched stays Chinese
  // in one piece, since fragments of a name are no use to a postal worker.
  /**
   * @param {AddressToken[]} nameTokens
   * @param {TranslationParts} parts
   * @param {(chunk: string) => string} keepChinese
   * @param {{ field: 'section' | 'lane' | 'alley', suffix: string } | null} [closing]
   *   the numbered unit that ended this name, e.g. 2巷
   */
  translateName(nameTokens, parts, keepChinese, closing = null) {
    if (nameTokens.length === 0) return;
    /** @type {(tokens: AddressToken[]) => string} */
    const join = (tokens) => tokens.map((t) => t.join('')).join('');
    /** @type {(value: string) => void} */
    const setRoad = (value) => {
      parts.road = parts.road ? `${parts.road} ${value}` : value;
    };

    const lastUnit = nameTokens[nameTokens.length - 1][UNIT];
    const isVillage = lastUnit === '村' || lastUnit === '里';

    const whole = join(nameTokens);
    const english = this.roads.get(whole);
    if (english !== undefined) {
      if (isVillage) parts.village = english;
      else setRoad(english);
      return;
    }

    // The numbered unit that ended the name may belong to the name itself.
    // Roads that only ever appear in sections are listed that way and no other
    // (there is no bare 南京東路, only 南京東路一段 -> 'Sec. 1, Nanjing E. Rd.'),
    // and lanes are often named rather than merely numbered. Either way the
    // English that comes back already carries the number, so the field it came
    // from is dropped instead of being printed twice.
    if (closing) {
      const withUnit = this.roads.get(whole + closing.suffix);
      if (withUnit !== undefined) {
        setRoad(withUnit);
        delete parts[closing.field];
        return;
      }

      // 廣豐街福壽2巷 is 廣豐街 plus a lane named 福壽2巷, and only the two
      // halves are listed. Prefer the longest road prefix that leaves a
      // remainder the table also knows.
      for (let k = nameTokens.length - 1; k > 0; k--) {
        const road = this.roads.get(join(nameTokens.slice(0, k)));
        const named = this.roads.get(join(nameTokens.slice(k)) + closing.suffix);
        if (road !== undefined && named !== undefined) {
          setRoad(road);
          parts[closing.field] = named;
          return;
        }
      }
    }

    let split = nameTokens.length - 1;
    while (split >= 0 && nameTokens[split][UNIT] !== '村' && nameTokens[split][UNIT] !== '里') {
      split -= 1;
    }
    if (split < 0 || split === nameTokens.length - 1) {
      // A village on its own is a village; anything else is the road name.
      if (split < 0) setRoad(keepChinese(whole));
      else parts.village = keepChinese(whole);
      return;
    }

    const village = join(nameTokens.slice(0, split + 1));
    const road = join(nameTokens.slice(split + 1));
    parts.village = this.roads.get(village) ?? keepChinese(village);
    setRoad(this.roads.get(road) ?? keepChinese(road));
  }

  /**
   * @param {string} addrStr
   * @param {TranslateOptions} [options]
   * @returns {TranslationResult}
   */
  translate(addrStr, { zipcode = '', country = DEFAULT_COUNTRY } = {}) {
    // A box address is a different shape of address, not a door-number one
    // missing its road: nothing below this line would do anything sensible
    // with '基隆愛三路郵局第5號信箱', whose 愛三路 is part of the office's name.
    const box = this.mailbox?.parse(addrStr);
    if (box) return formatMailbox(box, zipcode, country);

    /** @type {TranslationParts} */
    const parts = {};
    /** @type {string[]} */
    const untranslated = [];

    /** @type {(chunk: string) => string} */
    const keepChinese = (chunk) => {
      untranslated.push(chunk);
      return chunk;
    };

    let text = normalize(stripAddressPrefix(addrStr));

    // 室/房/衖 are not units the ZIP tokenizer knows, and teaching it would
    // change how addresses match. Lift them out before tokenizing the rest;
    // where they sat does not matter, since the output order is fixed.
    text = text.replace(EXTRA_UNITS_RE, (_, no, unit) => {
      if (unit === '衖') parts.subAlley = `Sub-alley ${no}`;
      else parts.room = `Rm. ${no}`;
      return '';
    }).replace(FLOOR_SUB_RE, (_, floor, sub) => {
      parts.floor = `${floor}F.-${sub}`;
      return '';
    }).replace(FLOOR_LATIN_RE, (match, floor) => {
      if (parts.floor) return match;
      parts.floor = `${floor}F.`;
      return '';
    });

    // Asked before the text is consumed, and of the whole address: whether a
    // road exists is a question only its city and district can answer.
    const located = this.verify === null || this.verify(text);

    // The city and district share one table entry ('Xinyi Dist., Taipei City'),
    // so they are resolved together once both are known.
    let city = Translator.longestPlace(text, (name) => {
      const value = this.places.get(name);
      return value !== undefined && !value.includes(', ');
    });
    text = text.slice(city.length);

    const district = city
      ? Translator.longestPlace(text, (name) => this.places.indexOf(city + name) >= 0)
      // Without a city to anchor it, a district name has to be one that names
      // only one place; ambiguous ones are still consumed, but stay Chinese.
      : Translator.longestPlace(text, (name) => this.districtIndex().has(name));
    text = text.slice(district.length);

    if (!city && district) {
      const canonical = this.districtIndex().get(district);
      if (canonical) city = canonical.slice(0, canonical.length - district.length);
      else parts.district = keepChinese(district);
    }

    // Take the longest name the table actually lists, before deciding which
    // parts of it are structure. 北宜路六段十三股巷 is one entry spelling out
    // 'Shisangu Ln., Sec. 6, Beiyi Rd.'; decomposing it first would look up a
    // bare 北宜路 that the file does not carry. Villages come off first so a
    // 永和村中正路 does not have its village swallowed by the road match.
    /** @type {(max?: number) => string} */
    const takeName = (max) =>
      Translator.longestPlace(text, (n) => this.roads.indexOf(n) >= 0, max);

    // The longest match decides what it is, rather than the other way round:
    // 中原新村仁愛樓 is one entry, and looking for a village first would take
    // 中原新村 and strand the 仁愛樓 that the same table spells out.
    const first = takeName(MAX_ROAD_CHARS);
    if (first && '村里'.includes(first.slice(-1))) {
      parts.village = /** @type {string} */ (this.roads.get(first));
      text = text.slice(first.length);

      const after = takeName(MAX_ROAD_CHARS);
      if (after && endsCleanly(after, text.slice(after.length))) {
        parts.road = /** @type {string} */ (this.roads.get(after));
        text = text.slice(after.length);
      }
    } else if (first && endsCleanly(first, text.slice(first.length))) {
      parts.road = /** @type {string} */ (this.roads.get(first));
      text = text.slice(first.length);
    }

    const tokens = tokenize(text);
    /** @type {AddressToken[]} tokens making up the road/village name */
    let name = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const unit = token[UNIT];
      const chunk = token.join('');

      // Unit characters double as ordinary name characters — 愛鄉巷 is a road,
      // not lane 愛鄉 — so a token only counts as structure when it carries the
      // number that makes it one.
      if (unit === '段' && /^\d+$/.test(token[NAME])) {
        parts.section = `Sec. ${token[NAME]}`;
      } else if (unit === '鄰' && /^\d+$/.test(token[NAME])) {
        parts.neighborhood = `Neighborhood ${token[NAME]}`;
      } else if (unit === '巷' && token[NO]) {
        parts.lane = `Ln. ${token[NO]}`;
      } else if (unit === '弄' && token[NO]) {
        parts.alley = `Aly. ${token[NO]}`;
      } else if (unit === '號' && token[NO]) {
        // '之2' is written as a hyphenated suffix: 1之2號 -> No. 1-2.
        parts.number = `No. ${token[NO]}${token[SUBNO] ? `-${token[SUBNO].slice(1)}` : ''}`;
      } else if (unit === '樓' && token[NO]) {
        // 1之1樓 -> 1F.-1, where the house number would be No. 1-1.
        parts.floor = `${token[NO]}F.${token[SUBNO] ? `-${token[SUBNO].slice(1)}` : ''}`;
      } else if (chunk) {
        name.push(token);
        continue;
      }

      // Structure closes the name: what follows belongs to a later field.
      const field = CLOSING_FIELDS[unit];
      this.translateName(name, parts, keepChinese, field ? { field, suffix: chunk } : null);
      name = [];
    }
    this.translateName(name, parts, keepChinese);

    if (district && city) {
      // 'Xinyi Dist., Taipei City' -> the two fields it is printed from.
      const english = /** @type {string} */ (this.places.get(city + district));
      const split = english.lastIndexOf(', ');
      parts.district = english.slice(0, split);
      parts.city = english.slice(split + 2);
    } else if (city) {
      parts.city = /** @type {string} */ (this.places.get(city));
    }

    if (zipcode) parts.zipcode = zipcode;

    // Like Directory.find(), which returns '' rather than a ZIP code it is
    // not sure of: `english` is only ever a fully translated address anchored
    // to a county/city, and — where a verifier was supplied — one whose road
    // that county and district actually have. Anything less comes back as ''
    // with the salvageable fields still in `parts`.
    const complete = untranslated.length === 0 && parts.city !== undefined && located;
    return {
      english: complete ? formatEnglish(parts, country) : '',
      parts,
      untranslated,
      complete,
    };
  }
}

// Chunghwa Post writes a box address over three lines — 'P.O.BOX ○○ Keelung Ai
// 3rd Road' / 'Keelung City 200900' / 'Taiwan ( R.O.C.)' — which is the same
// field order the door-number output uses, so it goes through formatEnglish()
// too. The prefix is spelled seven different ways across the source rows, so
// there is no official form to copy; 'P.O. Box' is the conventional one.
//
// Always complete: a row exists only for an office with a box open, and every
// field on it is already English.
/**
 * @param {MailboxRecord} box
 * @param {string} zipcode overrides the packed one when the caller supplies it
 * @param {string | null} country
 * @returns {TranslationResult}
 */
function formatMailbox(box, zipcode, country) {
  /** @type {TranslationParts} */
  const parts = {
    poBox: `P.O. Box ${box.box}`,
    postOffice: box.postOffice,
    city: box.city,
    zipcode: zipcode || box.zipcode,
  };
  return {
    english: formatEnglish(parts, country),
    parts,
    untranslated: [],
    complete: true,
  };
}

/**
 * Joins resolved parts into one line, Chunghwa Post order.
 *
 * @param {TranslationParts} parts
 * @param {string | null} [country]
 * @returns {string}
 */
export function formatEnglish(parts, country = DEFAULT_COUNTRY) {
  const fields = [];
  for (let i = FIELD_ORDER.length - 1; i >= 0; i--) {
    const value = parts[FIELD_ORDER[i]];
    if (value) fields.push(value);
  }
  // The ZIP code rides with the city rather than as a field of its own.
  if (parts.zipcode && fields.length > 0) {
    fields[fields.length - 1] += ` ${parts.zipcode}`;
  } else if (parts.zipcode) {
    fields.push(parts.zipcode);
  }
  if (country && fields.length > 0) fields.push(country);
  return fields.join(', ');
}

/**
 * Fetches both bilingual tables and creates a browser-ready translator.
 *
 * @param {Partial<LoadTranslatorOptions>} [options]
 * @returns {Promise<Translator>}
 */
export async function loadTranslator({
  roadUrl, districtUrl, verify = null, mailbox = null,
  fetch: fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to load translation data.');
  }

  /** @type {(url: string | undefined) => Promise<string>} */
  const fetchText = async (url) => {
    if (typeof url !== 'string' || url === '') {
      throw new TypeError('roadUrl and districtUrl must be non-empty strings.');
    }
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Could not load translation data from ${url} (HTTP ${response.status}).`);
    }
    return response.text();
  };

  const [roadTsv, districtTsv] = await Promise.all([
    fetchText(roadUrl),
    fetchText(districtUrl),
  ]);
  return new Translator({ roadTsv, districtTsv, verify, mailbox });
}

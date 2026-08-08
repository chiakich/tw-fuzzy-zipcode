// Port of moskytw/zipcodetw (util.py) to JS. Query side only; the index is prebuilt.

// Types are imported from the declarations, not restated, so the two drift apart loudly.
/**
 * @import { AddressToken, LookupResult, DirectoryData, LoadDirectoryOptions, Store }
 *   from './zipcodetw.d.ts'
 */

const NO = 0, SUBNO = 1, NAME = 2, UNIT = 3;

const TO_REPLACE_MAP = new Map(Object.entries({
  '-': '之', '~': '之', '台': '臺',
  '１': '1', '２': '2', '３': '3', '４': '4', '５': '5',
  '６': '6', '７': '7', '８': '8', '９': '9', '０': '0',
  '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
  '六': '6', '七': '7', '八': '8', '九': '9',
}));

const CHINESE_NUMERALS = new Set('一二三四五六七八九十');

// re.X stripped by hand; the full-width space in the first class is significant.
const TO_REPLACE_RE =
  /[ 　,，台~-]|[０-９]|[一二三四五六七八九]?十?[一二三四五六七八九](?=[段路街巷弄號樓])/g;

const TOKEN_RE =
  /(?:(?<no>\d+)(?<subno>之\d+)?(?=[巷弄號樓]|$)|(?<name>.+?))(?:(?<unit>[縣市鄉鎮市區村里鄰路街段巷弄號樓])|(?=\d+(?:之\d+)?[巷弄號樓]|$))/gu;

const RULE_TOKEN_RE =
  /及以上附號|含附號以下|含附號全|含附號|以下|以上|附號全|[連至單雙全](?=[\d全]|$)/g;

/**
 * @param {string} s
 * @returns {string}
 */
export function normalize(s) {
  return s.replace(TO_REPLACE_RE, (found) => {
    const mapped = TO_REPLACE_MAP.get(found);
    if (mapped !== undefined) return mapped;
    if (CHINESE_NUMERALS.has(found[0])) {
      if (found.length === 2) return '1' + (TO_REPLACE_MAP.get(found[1]) ?? '');
      if (found.length === 3) {
        return (TO_REPLACE_MAP.get(found[0]) ?? '') + (TO_REPLACE_MAP.get(found[2]) ?? '');
      }
    }
    return '';
  });
}

/**
 * Python's findall yields '' for unmatched groups, JS yields undefined.
 *
 * @param {string} addrStr
 * @returns {AddressToken[]}
 */
export function tokenize(addrStr) {
  /** @type {AddressToken[]} */
  const out = [];
  for (const m of normalize(addrStr).matchAll(TOKEN_RE)) {
    const g = m.groups ?? {};
    out.push([g.no ?? '', g.subno ?? '', g.name ?? '', g.unit ?? '']);
  }
  return out;
}

/** @type {(a: AddressToken, b: AddressToken) => boolean} */
const tokenEq = (a, b) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// Python compares (no, subno) tuples lexicographically.
/** @type {(a: [number, number], b: [number, number]) => number} */
const cmpPair = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

export class Address {
  /** @param {string} addrStr */
  constructor(addrStr) {
    this.tokens = tokenize(addrStr);
  }

  // Mirrors flat(sarg=None, *sargs) -> tokens[slice(sarg, *sargs)]:
  // one arg is a *stop*, two args are start/stop.
  /**
   * @param {...number} args
   * @returns {string}
   */
  flat(...args) {
    let part;
    if (args.length === 0) part = this.tokens;
    else if (args.length === 1) part = this.tokens.slice(0, args[0]);
    else part = this.tokens.slice(args[0], args[1]);
    return part.map((t) => t.join('')).join('');
  }

  /**
   * @param {...number} idxs
   * @returns {string}
   */
  pickToFlat(...idxs) {
    return idxs.map((i) => this.tokens[i].join('')).join('');
  }

  /**
   * @param {number} idx
   * @returns {[number, number]}
   */
  parse(idx) {
    const i = idx < 0 ? this.tokens.length + idx : idx;
    const token = (i < 0 || i >= this.tokens.length) ? undefined : this.tokens[i];
    if (token === undefined) return [0, 0];
    return [
      parseInt(token[NO] || '0', 10),
      parseInt(token[SUBNO].slice(1) || '0', 10),
    ];
  }
}

export class Rule extends Address {
  /** @param {string} ruleStr */
  constructor(ruleStr) {
    /** @type {Set<string>} */
    const ruleTokens = new Set();
    const addrStr = normalize(ruleStr).replace(RULE_TOKEN_RE, (m) => {
      let token = m, retval = '';
      if (token === '連') token = '';
      else if (token === '附號全') retval = '號';
      if (token) ruleTokens.add(token);
      return retval;
    });
    super(addrStr);
    this.ruleTokens = ruleTokens;
  }

  /**
   * @param {Address} addr
   * @returns {boolean}
   */
  match(addr) {
    let myLastPos = this.tokens.length - 1;
    myLastPos -= (this.ruleTokens.size > 0 && !this.ruleTokens.has('全')) ? 1 : 0;
    myLastPos -= this.ruleTokens.has('至') ? 1 : 0;

    if (myLastPos >= addr.tokens.length) return false;

    for (let i = myLastPos; i >= 0; i--) {
      if (!tokenEq(this.tokens[i], addr.tokens[i])) return false;
    }

    const his = addr.parse(myLastPos + 1);
    if (this.ruleTokens.size > 0 && his[0] === 0 && his[1] === 0) return false;

    const my = this.parse(-1);
    const myAsst = this.parse(-2);

    for (const rt of this.ruleTokens) {
      // & binds tighter than == in Python but looser in JS: parens are load-bearing.
      if (
        (rt === '單' && !((his[0] & 1) === 1)) ||
        (rt === '雙' && !((his[0] & 1) === 0)) ||
        (rt === '以上' && !(cmpPair(his, my) >= 0)) ||
        (rt === '以下' && !(cmpPair(his, my) <= 0)) ||
        (rt === '至' && !(
          (cmpPair(myAsst, his) <= 0 && cmpPair(his, my) <= 0) ||
          (this.ruleTokens.has('含附號全') && his[0] === my[0])
        )) ||
        (rt === '含附號' && !(his[0] === my[0])) ||
        (rt === '附號全' && !(his[0] === my[0] && his[1] > 0)) ||
        (rt === '及以上附號' && !(cmpPair(his, my) >= 0)) ||
        (rt === '含附號以下' && !(cmpPair(his, my) <= 0 || his[0] === my[0]))
      ) return false;
    }

    return true;
  }
}

const US = '\x1f', RS = '\x1e';

/**
 * @param {string} text
 * @param {(key: string, value: string) => void} onRow
 */
function decodeFrontCoded(text, onRow) {
  let prev = '';
  for (const line of text.split('\n')) {
    const t1 = line.indexOf('\t');
    const t2 = line.indexOf('\t', t1 + 1);
    const key = prev.slice(0, parseInt(line.slice(0, t1), 16)) + line.slice(t1 + 1, t2);
    prev = key;
    onRow(key, line.slice(t2 + 1));
  }
}

// Two storage backends sit behind the same three methods. Node keeps the Maps —
// it has the headroom and wants the throughput. The browser packs the same rows
// into one string plus offset arrays: ~4x less memory, ~18x slower per probe,
// which is the right trade when a session runs a handful of queries.

/** @implements {Store} */
class MapStore {
  /** @param {DirectoryData} data */
  constructor({ gradualTsv, preciseTsv }) {
    /** @type {Map<string, string>} */
    this.gradual = new Map();
    decodeFrontCoded(gradualTsv, (k, v) => this.gradual.set(k, v));

    // Values stay as the raw encoded string until a lookup reaches the key;
    // splitting all 44k of them up front costs more than most callers ever use.
    /** @type {Map<string, string | [ruleStr: string, zipcode: string][]>} */
    this.precise = new Map();
    decodeFrontCoded(preciseTsv, (k, v) => this.precise.set(k, v));
  }

  /** @type {(key: string) => string | undefined} */
  gradualGet(key) { return this.gradual.get(key); }

  /** @type {(key: string) => boolean} */
  preciseHas(key) { return this.precise.has(key); }

  /** @type {() => Iterable<string>} */
  preciseKeys() { return this.precise.keys(); }

  /** @type {(key: string) => [ruleStr: string, zipcode: string][]} */
  preciseRules(key) {
    const entry = this.precise.get(key);
    if (entry === undefined) return [];
    if (typeof entry !== 'string') return entry;
    const decoded = decodeRules(key, entry);
    this.precise.set(key, decoded);
    return decoded;
  }
}

// A Uint16Array views memory in the platform's byte order, so the matching
// decoder label is whatever that order is. Every JS runtime in practice is
// little-endian; the big-endian branch keeps a Node build on s390x honest
// rather than silently byte-swapping every character.
const UTF16_LABEL =
  new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 'utf-16le' : 'utf-16be';

// ignoreBOM, or a leading U+FEFF would be eaten rather than stored.
/** @type {(units: Uint16Array) => string} */
const decodeUtf16 = (units) =>
  units.length === 0 ? '' : new TextDecoder(UTF16_LABEL, { ignoreBOM: true }).decode(units);

// Counts rows and characters without reconstructing a single key: a front-coded
// row states its shared-prefix length, so the key's length is known from the
// header plus the suffix width. This is what makes the second pass affordable.
/**
 * @param {string} text
 * @returns {{ count: number, keyChars: number, valChars: number }}
 */
function measureFrontCoded(text) {
  let count = 0, keyChars = 0, valChars = 0, pos = 0;
  while (pos < text.length) {
    let end = text.indexOf('\n', pos);
    if (end < 0) end = text.length;
    const t1 = text.indexOf('\t', pos);
    const t2 = text.indexOf('\t', t1 + 1);
    keyChars += parseInt(text.slice(pos, t1), 16) + (t2 - t1 - 1);
    valChars += end - t2 - 1;
    count += 1;
    pos = end + 1;
  }
  return { count, keyChars, valChars };
}

// Sorted key/value rows flattened into two strings, addressed by offset. The
// packer emits front-coded rows in sorted order and every key is BMP-only, so
// charCodeAt order matches the order the rows were written in.
//
// Built in two passes over the text. Materialising the rows as ~200k strings
// and joining them costs ~3x the transient memory of decoding twice, because
// this way the shared prefix is copied inside the buffer that already holds it
// and no intermediate string is ever allocated.
class PackedTable {
  /** @param {string} tsv */
  constructor(tsv) {
    const { count, keyChars, valChars } = measureFrontCoded(tsv);
    this.count = count;
    /** @type {Int32Array} start of each key, plus a terminating bound */
    this.keyOffsets = new Int32Array(count + 1);
    /** @type {Int32Array} start of each value, plus a terminating bound */
    this.valOffsets = new Int32Array(count + 1);

    const keyUnits = new Uint16Array(keyChars);
    const valUnits = new Uint16Array(valChars);

    let i = 0, keyAt = 0, valAt = 0, pos = 0, prevAt = 0, prevLen = -1;
    while (pos < tsv.length) {
      let end = tsv.indexOf('\n', pos);
      if (end < 0) end = tsv.length;
      const t1 = tsv.indexOf('\t', pos);
      const t2 = tsv.indexOf('\t', t1 + 1);
      const shared = parseInt(tsv.slice(pos, t1), 16);

      this.keyOffsets[i] = keyAt;
      // The shared prefix is already sitting at the previous key's offset.
      if (shared > 0) keyUnits.copyWithin(keyAt, prevAt, prevAt + shared);
      let write = keyAt + shared;
      for (let s = t1 + 1; s < t2; s++) keyUnits[write++] = tsv.charCodeAt(s);
      const len = write - keyAt;

      // Strictly ascending, checked in O(1): the rows agree on `shared` chars,
      // so the first difference is at that index — or one key ran out there.
      if (prevLen >= 0) {
        const ordered = shared >= prevLen
          ? len > prevLen
          : len > shared && keyUnits[keyAt + shared] > keyUnits[prevAt + shared];
        if (!ordered) {
          throw new Error(`Postal data is not sorted at row ${i}; binary search needs ascending keys.`);
        }
      }

      this.valOffsets[i] = valAt;
      for (let s = t2 + 1; s < end; s++) valUnits[valAt++] = tsv.charCodeAt(s);

      prevAt = keyAt;
      prevLen = len;
      keyAt = write;
      i += 1;
      pos = end + 1;
    }
    this.keyOffsets[count] = keyAt;
    this.valOffsets[count] = valAt;

    // The buffers die here; only the two blobs and the offsets survive.
    /** @type {string} */
    this.keyBlob = decodeUtf16(keyUnits);
    /** @type {string} */
    this.valBlob = decodeUtf16(valUnits);
  }

  // Compares blob[start, end) against key without slicing it out first —
  // a probe runs ~17 of these, and the allocations dominated otherwise.
  /**
   * @param {number} index
   * @param {string} key
   * @returns {number}
   */
  compareAt(index, key) {
    const start = this.keyOffsets[index];
    const len = this.keyOffsets[index + 1] - start;
    const shorter = len < key.length ? len : key.length;
    for (let i = 0; i < shorter; i++) {
      const diff = this.keyBlob.charCodeAt(start + i) - key.charCodeAt(i);
      if (diff !== 0) return diff;
    }
    return len - key.length;
  }

  /**
   * @param {string} key
   * @returns {number} index, or -1
   */
  indexOf(key) {
    let lo = 0, hi = this.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const diff = this.compareAt(mid, key);
      if (diff === 0) return mid;
      if (diff < 0) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  /**
   * @param {string} key
   * @returns {string | undefined}
   */
  get(key) {
    const i = this.indexOf(key);
    return i < 0 ? undefined : this.valBlob.slice(this.valOffsets[i], this.valOffsets[i + 1]);
  }

  /** @returns {IterableIterator<string>} */
  *keys() {
    for (let i = 0; i < this.count; i++) {
      yield this.keyBlob.slice(this.keyOffsets[i], this.keyOffsets[i + 1]);
    }
  }
}

/** @implements {Store} */
class PackedStore {
  /** @param {DirectoryData} data */
  constructor({ gradualTsv, preciseTsv }) {
    this.gradual = new PackedTable(gradualTsv);
    this.precise = new PackedTable(preciseTsv);
    // Only keys an actual lookup reached; a session touches a few dozen.
    /** @type {Map<string, [ruleStr: string, zipcode: string][]>} */
    this.decoded = new Map();
  }

  /** @type {(key: string) => string | undefined} */
  gradualGet(key) { return this.gradual.get(key); }

  /** @type {(key: string) => boolean} */
  preciseHas(key) { return this.precise.indexOf(key) >= 0; }

  /** @type {() => Iterable<string>} */
  preciseKeys() { return this.precise.keys(); }

  /** @type {(key: string) => [ruleStr: string, zipcode: string][]} */
  preciseRules(key) {
    const memo = this.decoded.get(key);
    if (memo !== undefined) return memo;
    const entry = this.precise.get(key);
    if (entry === undefined) return [];
    const rules = decodeRules(key, entry);
    this.decoded.set(key, rules);
    return rules;
  }
}

// Rule strings were stored as suffixes of the (normalized) address key.
/**
 * @param {string} key
 * @param {string} entry
 * @returns {[ruleStr: string, zipcode: string][]}
 */
function decodeRules(key, entry) {
  if (entry === '') return [];
  return entry.split(RS).map((r) => {
    const i = r.indexOf(US);
    return /** @type {[string, string]} */ ([key + r.slice(0, i), r.slice(i + 1)]);
  });
}

// Where the locality/road part ends, i.e. before any trailing 巷/弄/號/樓 tokens.
/**
 * @param {Address} addr
 * @returns {number}
 */
function startLenOf(addr) {
  let startLen = addr.tokens.length;
  while (startLen >= 0) {
    const p = addr.parse(startLen - 1);
    if (p[0] === 0 && p[1] === 0) break;
    startLen -= 1;
  }
  return startLen;
}

/** @type {(zipcode: string) => LookupResult} */
const gradualLookup = (zipcode) => {
  if (zipcode.length >= 6) {
    return { zipcode, source: 'gradual', resolution: 'six-digit' };
  }
  if (zipcode.length >= 3) {
    return { zipcode: zipcode.slice(0, 3), source: 'gradual', resolution: 'three-digit' };
  }
  return { zipcode, source: 'gradual', resolution: 'prefix' };
};

// Partial, unlike the published signature, so the runtime guard below stays reachable.
/**
 * @param {Partial<LoadDirectoryOptions>} [options]
 * @returns {Promise<Directory>}
 */
export async function loadDirectory({ gradualUrl, preciseUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to load postal data.');
  }

  /** @type {(url: string | undefined) => Promise<string>} */
  const fetchText = async (url) => {
    if (typeof url !== 'string' || url === '') {
      throw new TypeError('gradualUrl and preciseUrl must be non-empty strings.');
    }
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`Could not load postal data from ${url} (HTTP ${response.status}).`);
    }
    return response.text();
  };

  const [gradualTsv, preciseTsv] = await Promise.all([
    fetchText(gradualUrl),
    fetchText(preciseUrl),
  ]);
  return new Directory({ gradualTsv, preciseTsv });
}

// A lookup touches at most a few dozen roads, but the whole directory holds
// ~80k rules that cost ~50MB to keep parsed. Bound the cache so a server seeing
// diverse traffic keeps the hit rate without the footprint.
const RULE_CACHE_MAX = 5000;

export class Directory {
  /** @param {DirectoryData} data */
  constructor({ gradualTsv, preciseTsv, storage = 'packed' }) {
    /** @type {Store} */
    this.store = storage === 'map'
      ? new MapStore({ gradualTsv, preciseTsv })
      : new PackedStore({ gradualTsv, preciseTsv });

    /** @type {Map<string, string | null> | null} built on first miss, see aliasIndex() */
    this.alias = null;

    /** @type {Map<string, Rule>} insertion-ordered, evicted oldest-first */
    this.ruleCache = new Map();
  }

  // Rules are immutable and match() only reads, so one parse per string is
  // enough — rebuilding them per lookup dominated the hot path.
  /**
   * @param {string} ruleStr
   * @returns {Rule}
   */
  rule(ruleStr) {
    const cached = this.ruleCache.get(ruleStr);
    if (cached !== undefined) {
      // Re-insert so eviction sees it as recently used.
      this.ruleCache.delete(ruleStr);
      this.ruleCache.set(ruleStr, cached);
      return cached;
    }
    const built = new Rule(ruleStr);
    if (this.ruleCache.size >= RULE_CACHE_MAX) {
      this.ruleCache.delete(/** @type {string} */ (this.ruleCache.keys().next().value));
    }
    this.ruleCache.set(ruleStr, built);
    return built;
  }

  // Decoded on first use by whichever store is backing this directory.
  /**
   * @param {string} key
   * @returns {[ruleStr: string, zipcode: string][]}
   */
  preciseRules(key) {
    return this.store.preciseRules(key);
  }

  // 臺北市松江路 / 中山區松江路 / 松江路 -> 臺北市中山區松江路; null when the
  // form names more than one address. ~100ms to build, hence the laziness.
  /** @returns {Map<string, string | null>} */
  aliasIndex() {
    if (this.alias) return this.alias;
    const alias = this.alias = new Map();
    for (const key of this.store.preciseKeys()) {
      const tokens = tokenize(key);
      if (tokens.length < 3) continue;
      if (!'縣市'.includes(tokens[0][UNIT])) continue;
      if (!'鄉鎮市區'.includes(tokens[1][UNIT])) continue;
      for (const dropped of [[0], [1], [0, 1]]) {
        const form = tokens
          .filter((_, i) => !dropped.includes(i))
          .map((t) => t.join(''))
          .join('');
        if (!alias.has(form)) alias.set(form, key);
        else if (alias.get(form) !== key) alias.set(form, null);
      }
    }
    return alias;
  }

  // The precise index only has full 縣市 + 鄉鎮市區 + 路名 keys, but the gradual
  // index has the abbreviated ones, so lookup() would stop there and never reach
  // the rules. Restore the dropped tokens when the abbreviation is unambiguous.
  /** @param {Address} addr */
  canonicalize(addr) {
    for (let i = startLenOf(addr); i > 0; i--) {
      const key = addr.flat(i);
      // Probe precise first: a well-formed address never pays for aliasIndex().
      if (this.store.preciseHas(key)) return;
      const alias = this.aliasIndex();
      // Ambiguous but known: stop rather than retry a shorter prefix, which would
      // drop a 段 token and alias onto an unrelated street of the same name.
      if (!alias.has(key)) continue;
      const canonical = alias.get(key);
      if (canonical) addr.tokens.splice(0, i, ...tokenize(canonical));
      return;
    }
  }

  /**
   * @param {string} addrStr
   * @returns {LookupResult | null}
   */
  lookup(addrStr) {
    const addr = new Address(addrStr);
    this.canonicalize(addr);

    let lenAddrTokens = addr.tokens.length;
    const startLen = startLenOf(addr);

    for (let i = startLen; i > 0; i--) {
      const key = addr.flat(i);
      let rzpairs = this.preciseRules(key);

      // '' in '村里' is True in Python; ''.includes-style check keeps that.
      if (
        i === startLen && lenAddrTokens >= 4 &&
        '村里'.includes(addr.tokens[2][UNIT]) && rzpairs.length === 0
      ) {
        if (addr.tokens[3][UNIT] === '鄰') {
          addr.tokens.splice(3, 1);
          lenAddrTokens -= 1;
        }
        if (lenAddrTokens >= 4 && addr.tokens[3][UNIT] === '號') {
          addr.tokens[2] = ['', '', addr.tokens[2][NAME], ''];
        } else {
          addr.tokens.splice(2, 1);
        }
        rzpairs = this.preciseRules(addr.flat(3));
      }

      for (const [ruleStr, zipcode] of rzpairs) {
        if (this.rule(ruleStr).match(addr)) {
          return { zipcode, source: 'precise', resolution: 'six-digit' };
        }
      }

      const gzipcode = this.store.gradualGet(key);
      if (gzipcode) return gradualLookup(gzipcode);
    }

    return null;
  }

  /**
   * @param {string} addrStr
   * @returns {string}
   */
  find(addrStr) {
    const match = this.lookup(addrStr);
    return match === null || match.resolution === 'prefix' ? '' : match.zipcode;
  }
}

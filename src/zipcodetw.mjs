// Port of moskytw/zipcodetw (util.py) to JS. Query side only; the index is prebuilt.

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

export function normalize(s) {
  return s.replace(TO_REPLACE_RE, (found) => {
    const mapped = TO_REPLACE_MAP.get(found);
    if (mapped !== undefined) return mapped;
    if (CHINESE_NUMERALS.has(found[0])) {
      if (found.length === 2) return '1' + TO_REPLACE_MAP.get(found[1]);
      if (found.length === 3) return TO_REPLACE_MAP.get(found[0]) + TO_REPLACE_MAP.get(found[2]);
    }
    return '';
  });
}

// Python's findall yields '' for unmatched groups, JS yields undefined.
export function tokenize(addrStr) {
  const out = [];
  for (const m of normalize(addrStr).matchAll(TOKEN_RE)) {
    const g = m.groups;
    out.push([g.no ?? '', g.subno ?? '', g.name ?? '', g.unit ?? '']);
  }
  return out;
}

const tokenEq = (a, b) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

// Python compares (no, subno) tuples lexicographically.
const cmpPair = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);

export class Address {
  constructor(addrStr) {
    this.tokens = tokenize(addrStr);
  }

  // Mirrors flat(sarg=None, *sargs) -> tokens[slice(sarg, *sargs)]:
  // one arg is a *stop*, two args are start/stop.
  flat(...args) {
    let part;
    if (args.length === 0) part = this.tokens;
    else if (args.length === 1) part = this.tokens.slice(0, args[0]);
    else part = this.tokens.slice(args[0], args[1]);
    return part.map((t) => t.join('')).join('');
  }

  pickToFlat(...idxs) {
    return idxs.map((i) => this.tokens[i].join('')).join('');
  }

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
  constructor(ruleStr) {
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

const gradualLookup = (zipcode) => {
  if (zipcode.length >= 6) {
    return { zipcode, source: 'gradual', resolution: 'six-digit' };
  }
  if (zipcode.length >= 3) {
    return { zipcode: zipcode.slice(0, 3), source: 'gradual', resolution: 'three-digit' };
  }
  return { zipcode, source: 'gradual', resolution: 'prefix' };
};

export async function loadDirectory({ gradualUrl, preciseUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to load postal data.');
  }

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

export class Directory {
  constructor({ gradualTsv, preciseTsv }) {
    this.gradual = new Map();
    decodeFrontCoded(gradualTsv, (k, v) => this.gradual.set(k, v));

    this.precise = new Map();
    decodeFrontCoded(preciseTsv, (k, v) => {
      // Rule strings were stored as suffixes of the (normalized) address key.
      this.precise.set(k, v === '' ? [] : v.split(RS).map((r) => {
        const i = r.indexOf(US);
        return [k + r.slice(0, i), r.slice(i + 1)];
      }));
    });
  }

  lookup(addrStr) {
    const addr = new Address(addrStr);
    let lenAddrTokens = addr.tokens.length;

    let startLen = lenAddrTokens;
    while (startLen >= 0) {
      const p = addr.parse(startLen - 1);
      if (p[0] === 0 && p[1] === 0) break;
      startLen -= 1;
    }

    for (let i = startLen; i > 0; i--) {
      const key = addr.flat(i);
      let rzpairs = this.precise.get(key) ?? [];

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
        rzpairs = this.precise.get(addr.flat(3)) ?? [];
      }

      for (const [ruleStr, zipcode] of rzpairs) {
        if (new Rule(ruleStr).match(addr)) {
          return { zipcode, source: 'precise', resolution: 'six-digit' };
        }
      }

      const gzipcode = this.gradual.get(key);
      if (gzipcode) return gradualLookup(gzipcode);
    }

    return null;
  }

  find(addrStr) {
    const match = this.lookup(addrStr);
    return match === null || match.resolution === 'prefix' ? '' : match.zipcode;
  }
}

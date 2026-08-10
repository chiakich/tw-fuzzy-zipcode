# tw-fuzzy-zipcode

[![npm version](https://img.shields.io/npm/v/tw-fuzzy-zipcode.svg)](https://www.npmjs.com/package/tw-fuzzy-zipcode)
[![npm downloads](https://img.shields.io/npm/dm/tw-fuzzy-zipcode.svg)](https://www.npmjs.com/package/tw-fuzzy-zipcode)
[![license](https://img.shields.io/npm/l/tw-fuzzy-zipcode.svg)](LICENSE)

[繁體中文](README.md) · [Live demo](https://zipcode.chiaki.ch/) · [npm](https://www.npmjs.com/package/tw-fuzzy-zipcode)

Dependency-free JavaScript lookup for Taiwan ZIP codes from raw, unstructured addresses. It handles complete, partial, or out-of-order addresses and common variants such as 台／臺, full-width characters, and Chinese numerals. Everything runs client-side: no server, WASM, or SQLite required.

This is a JavaScript port of the matching algorithm in [moskytw/zipcodetw](https://github.com/moskytw/zipcodetw). If your input is already split into city, district, road, and house-number fields, [`@simoko/tw-zip`](https://www.npmjs.com/package/@simoko/tw-zip) is likely a better fit. This package is intended for pasted addresses, OCR output, and existing single-field address inputs.

## Install

```bash
npm install tw-fuzzy-zipcode
```

## Usage

### Web app

https://zipcode.chiaki.ch/

### Node.js usage

```js
import { find, lookup } from 'tw-fuzzy-zipcode'

find('臺北市信義區市府路1號')
// '110204'
find('臺北市信義區')
// '110'
find('臺北市')
// '' — no usable 3-digit ZIP code can be determined
find('松山區')
// '105'
find('台北市秀山街')
// '100005' — 台 is normalized to 臺
find('臺北市松江路100號')
// '104091' — the city or the district may be omitted
find('松江路100號')
// '104091' — or both, if the road name is unique

lookup('臺北市')
// { zipcode: '1', source: 'gradual', resolution: 'prefix' }
```

`find(address)` accepts an address string and returns only a usable 3- or 6-digit ZIP code. It returns an empty string when no usable ZIP code can be determined or no match is found. The package never returns an invalid 4- or 5-digit intermediate prefix.

Use `lookup(address)` when the UI needs the matching detail. It returns `null` or `{ zipcode, source, resolution }`: `source` is `precise` or `gradual`, and `resolution` is `six-digit`, `three-digit`, or `prefix`. `prefix` means the match only identifies broad information, such as a city, and does not form a usable ZIP code.

### Browser usage

Browsers do not have `fs`, so load the two packaged data files yourself. `loadDirectory()` handles loading failures and creates a `Directory`:

```js
import { loadDirectory } from 'tw-fuzzy-zipcode/browser'

const directory = await loadDirectory({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
})
directory.find('臺北市信義區市府路1號') // '110204'
```

The data files are included in the npm package; copy them to a location your site can serve during its build process.

### English address translation

`translate(address)` renders a Chinese address in English, reversing the field order the way Chunghwa Post writes it:

```js
import { translate } from 'tw-fuzzy-zipcode'

translate('臺北市信義區市府路1號').english
// 'No. 1, Shifu Rd., Xinyi Dist., Taipei City 110204, Taiwan (R.O.C.)'
translate('臺北市中正區忠孝東路一段1巷1弄1號1樓').english
// '1F., No. 1, Aly. 1, Ln. 1, Sec. 1, Zhongxiao E. Rd., Zhongzheng Dist., Taipei City 100009, Taiwan (R.O.C.)'

translate('臺北市中山區松江路100號')
// {
//   english: 'No. 100, Songjiang Rd., Zhongshan Dist., Taipei City 104091, Taiwan (R.O.C.)',
//   parts: { city: 'Taipei City', district: 'Zhongshan Dist.',
//            road: 'Songjiang Rd.', number: 'No. 100', zipcode: '104091' },
//   untranslated: [],
//   complete: true,
// }
```

The ZIP code is looked up and included automatically. Pass `translate(address, { zipcode })` to supply your own, or `{ country: null }` to drop the trailing country line. `parts` holds each field already translated, so `formatEnglish(parts, country)` can lay them out differently.

**Nothing is romanized on the fly.** Every name comes from Chunghwa Post's official bilingual data. A name the tables do not carry is passed through in Chinese, listed in `untranslated`, and makes `complete` false:

```js
const { english, untranslated, complete } = translate('宜蘭縣礁溪鄉北宜路1號')
// english: 'No. 1, 北宜路, Jiaoxi Township, Yilan County 262, Taiwan (R.O.C.)'
// untranslated: ['北宜路'], complete: false
```

Measured against the bundled postal directory, 99.99% of addresses translate completely (6 of 44,635 fall short, all of them malformed rows in the source data, such as a 「地下層」 parked in the road column). **Chinese beats a guess** — a sender cannot tell a wrong romanization from a right one, but can tell Chinese from English.

District names shared by several cities (中正區 exists in four) are treated the same way: if the rest of the address does not say which one, the field stays Chinese.

Browsers load the two data files themselves, as with the ZIP code directory:

```js
import { loadTranslator } from 'tw-fuzzy-zipcode/translate'

const translator = await loadTranslator({
  roadUrl: '/data/road_en.tsv',
  districtUrl: '/data/district_en.tsv',
})
translator.translate('臺北市信義區市府路1號', { zipcode: '110204' }).english
```

The browser translator neither restores an omitted city or district nor looks up ZIP codes; run the address through `Directory`'s `canonical()` and `find()` first if you need either.

## How matching works

1. The input is normalized for 台／臺, full-width characters, and common Chinese numeral forms.
2. The raw address is tokenized into city, district, road, lane, alley, house number, and related fragments.
3. If the address omits the city or the district and the shortened form names exactly one road nationwide, the missing fragments are restored before matching continues. Forms that name several roads are left alone rather than guessed.
4. When sufficient detail is present, house-number rules for odd/even numbers, above, below, and ranges produce a 6-digit ZIP code.
5. With less detail, a gradual address index produces a usable 3-digit ZIP code. If the match only identifies a broad prefix such as a city, `find()` returns an empty string and `lookup()` exposes the resolution instead.

## TypeScript

Type declarations for both the Node and browser entry points are included. No separate `@types` package is required.

The implementation is `.mjs` — what is published is the source, with no build step, and browsers can load it directly — while the types live in matching `.d.ts` files. The two are held together by JSDoc annotations plus `checkJs`: `test/conformance.test.ts` asserts at compile time that what `.mjs` actually exports matches what `.d.ts` declares, so changing either side alone fails `npm run typecheck`.

## Features and data size

The matcher compares address fragments and house-number rules in order, including odd/even, above, below, and range rules. The bundled June 2026 dataset contains 79,845 precise rules and 162,470 gradual address entries.

| Metric            | Result                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Transfer size     | About 0.79 MB Brotli; 1.20 MB gzip                                                                                                       |
| Index build       | About 36 ms in the browser; 66 ms on Node                                                                                                |
| Memory after load | About 5.3 MB in the browser; 21.5 MB on Node                                                                                             |
| Lookup            | About 1.9–2.2 µs per lookup                                                                                                              |
| Verification      | 90,950 differential queries against the Python reference; invalid 4-/5-digit intermediate prefixes are normalized to valid 3-digit codes |

For the two index implementations, the measurement method, and its caveats, see the [benchmark](docs/benchmark.md) (written in Chinese).

## Data source and license

`data/2606_01.csv` is derived from Chunghwa Post's postal directory dated 2026-06-29. The source data comes from the database installed by the [3+3 ZIP Code Application System](https://www.post.gov.tw/post/internet/Download/index.jsp?ID=220306) offline lookup tool, then converted to the CSV and TSV formats used by this project.

Chunghwa Post's 3+3 ZIP Code Open License Statement (2020-10-22) permits digital reproduction and public presentation of the 3+3 ZIP code data through different interfaces. Use remains subject to its software terms and third-party rights. This project credits Chunghwa Post as the source.

The three bilingual tables behind the English translation also come from Chunghwa Post, romanized with Hanyu Pinyin per the Ministry of Education's 中文譯音使用原則:

| File | Source | Contents |
| ---- | ------ | -------- |
| `data/road_en.txt` | [中華郵政路街中英對照文字檔](https://data.gov.tw/dataset/152276) | 29,983 bilingual road and street names |
| `data/county_en.xml` | [縣市鄉鎮中英對照檔](https://data.gov.tw/dataset/5949) | 371 districts and 22 cities and counties |
| `data/village_en.csv` | [村里中英對照檔](https://www.post.gov.tw/post/internet/Postal/village.txt) | 8,521 villages and named lanes |
| `data/road_en_extra.tsv` | maintained by this project | 403 names the official files omit |

The first two are published on Taiwan's open data platform under the Open Government Data License, version 1.0. The village file supplies 6,977 names the road file lacks; where the two disagree (109 names) the newer road file wins, and most of the spellings it replaces predate Hanyu Pinyin.

The published files lag the post office's own online lookup — 東彰南路 is absent from the download but returned by the website — so `data/road_en_extra.tsv` fills those in using the same conventions, and overrides the official values at pack time. Re-downloading the official data never discards them.

`npm run build:en` converts all four into `data/road_en.tsv` and `data/district_en.tsv`.

## Development and verification

The project has no runtime dependencies. Rebuilding the data or refreshing the test fixture requires Python and the original Python reference package:

```bash
python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
pip install zipcodetw
npm run build
npm run build:en
npm run build:golden
npm run typecheck
npm test
```

`npm run typecheck` type-checks the `src/*.mjs` implementation with `checkJs` and verifies it against the public type declarations. `npm test` runs that type check first, then uses fixtures generated from the original Python package to verify the JavaScript implementation. Invalid 4-/5-digit common prefixes from the gradual index are normalized to 3 digits according to the public API contract.

## License

[MIT](LICENSE)

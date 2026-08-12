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
find('基隆愛三路郵局第5號信箱')
// '200900' — P.O. boxes are covered too

lookup('臺北市')
// { zipcode: '1', source: 'gradual', resolution: 'prefix' }
```

`find(address)` accepts an address string and returns only a usable 3- or 6-digit ZIP code. It returns an empty string when no usable ZIP code can be determined or no match is found. The package never returns an invalid 4- or 5-digit intermediate prefix. It covers both door-number addresses and P.O. boxes, because real user-supplied addresses arrive as a mix of the two and the caller shouldn't have to sort them out first.

Use `lookup(address)` when the UI needs the matching detail. It returns `null` or `{ zipcode, source, resolution }`: `source` is `precise`, `gradual`, or `mailbox`, and `resolution` is `six-digit`, `three-digit`, or `prefix`. `prefix` means the match only identifies broad information, such as a city, and does not form a usable ZIP code.

### Browser usage

Browsers do not have `fs`, so load the packaged data files yourself. `loadZipcode()` handles loading failures and creates a `Zipcode`, whose methods carry the same names as the functions above:

```js
import { loadZipcode } from 'tw-fuzzy-zipcode/browser'

const zip = await loadZipcode({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
  mailboxUrl: '/data/mailbox.tsv',
})
zip.find('臺北市信義區市府路1號')    // '110204'
zip.find('基隆愛三路郵局第5號信箱')  // '200900'
```

The data files are included in the npm package; copy them to a location your site can serve during its build process.

#### Three dictionaries

The package's data is not one big dictionary but three independent ones, and you load only the ones you need:

| Dictionary | Files | Size | Contents |
| ---------- | ----- | ---- | -------- |
| Door-number index | `gradual.tsv` + `precise.tsv` | 4.3 MB | address fragments and house-number rules → ZIP code |
| Box table | `mailbox.tsv` | 46 KB | post office name → ZIP code + English name |
| Bilingual tables | `road_en.tsv` + `district_en.tsv` | 846 KB | road and district names → English |

They are split because they are independent of one another and **most callers do not need all three**. The door-number index alone is 4.3 MB, nearly five times the other two combined, and someone who only wants translation or only wants box lookups should not pay for it; equally, someone who only wants ZIP codes should not download the bilingual tables. The three also come from different sources on different update cadences (see [Data sources](#data-source-and-license)).

None of them is loaded by default — in the browser you get the features you load the data for:

| What you want | Door-number index | Box table | Bilingual tables |
| ------------- | :---------------: | :-------: | :--------------: |
| `findAddress()`, door-number ZIP codes | required | – | – |
| `findMailbox()`, P.O. box ZIP codes | – | required | – |
| `find()`, both forms | required | required | – |
| `translate()` on a door-number address | optional ¹ | – | required |
| `translate()` on a P.O. box | – | required | required ² |

¹ `translate()` works without it, but will not restore an omitted city or district, will not look the ZIP code up, and will not cross-check the road against its location (see [Cross-checking](#cross-checking-the-road-against-the-location)). The Node entry point loads the index anyway, so all three are on there by default.

² Strictly, translating a box never consults the bilingual tables — the English office name is stored whole in the box table — but `Translator`'s constructor requires them regardless, so they still have to be loaded.

All three together:

```js
import { loadZipcode } from 'tw-fuzzy-zipcode/browser'
import { loadTranslator } from 'tw-fuzzy-zipcode/translate'

const zip = await loadZipcode({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
  mailboxUrl: '/data/mailbox.tsv',
})
const translator = await loadTranslator({
  roadUrl: '/data/road_en.tsv',
  districtUrl: '/data/district_en.tsv',
  // The two optional hook-ups, matching ¹ and ² above.
  verify: (address) => zip.directory.knowsRoad(address),
  mailbox: zip.mailbox,
})
```

For one dictionary on its own, the three entry points are `tw-fuzzy-zipcode/browser` (door-number + box), `tw-fuzzy-zipcode/mailbox` (box only), and `tw-fuzzy-zipcode/translate` (bilingual only). What is separated is the **data**: you download only the TSVs you load. The modules do share a little code — `mailbox` and `translate` both use `PackedTable` and `normalize` from `zipcodetw.mjs` — but that is a few KB of decoding and normalization, not data.

```js
import { loadMailbox } from 'tw-fuzzy-zipcode/mailbox'

const mailbox = await loadMailbox({ mailboxUrl: '/data/mailbox.tsv' })
mailbox.find('基隆愛三路郵局第5號信箱') // '200900'
```

### When you already know the address form

If your input is guaranteed to be one form, you can skip the check for the other: `findAddress()` / `lookupAddress()` handle door-number addresses only, and `findMailbox()` / `lookupMailbox()` handle P.O. boxes only. They are plain functions on Node and identically named methods on `Zipcode` in the browser.

When in doubt, use `find()`. Its extra cost on door-number addresses sits inside the measurement noise (see [`docs/benchmark.md`](docs/benchmark.md)) because the P.O. box match rejects them by their tail, before any normalization.

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

**Nothing is romanized on the fly.** Every name comes from Chunghwa Post's official bilingual data, and `english` makes the same promise `find()` does: **a non-empty value is always a complete, deliverable English address**. When a name has no official translation, or the address never resolves to a county/city, `english` is `''` and `complete` is `false`; the missing names are listed in `untranslated`, and everything that did translate stays in `parts` for the caller to build on:

```js
const { english, parts, untranslated, complete } = translate('宜蘭縣礁溪鄉北宜路1號')
// english: '',  untranslated: ['北宜路'],  complete: false
// parts: { number: 'No. 1', road: '北宜路',
//          district: 'Jiaoxi Township', city: 'Yilan County', zipcode: '262' }

translate('中正路100號')
// 中正路 exists all over Taiwan and nothing here says which: english is '',
// but parts still holds { road: 'Zhongzheng Rd.', number: 'No. 100' }
```

Measured against the bundled postal directory, 99.99% of addresses translate completely (4 of 44,635 fall short, all of them malformed rows in the source data: uninhabited islands whose county name was truncated to the column width, 南海諸島 filed as 南海諸). **An empty result beats a guess** — a sender cannot tell a wrong romanization from a right one, but can tell nothing from something.

District names shared by several cities (中正區 exists in four) are treated the same way: if the rest of the address does not say which one, the field stays Chinese and `english` stays empty.

### Cross-checking the road against the location

The bilingual tables are nationwide and carry no location, so 四維三路 translates just as happily under 臺北市信義區 as under the 高雄市苓雅區 it actually belongs to. Only the ZIP directory knows which roads are where, so `Translator` takes an optional `verify` callback — which is what `Directory.knowsRoad` exists for:

```js
new Translator({ roadTsv, districtTsv, verify: (address) => directory.knowsRoad(address) })

translate('臺北市信義區四維三路2號').english   // '' — Xinyi Dist. has no 四維三路
translate('高雄市苓雅區四維三路2號').english   // 'No. 2, Siwei 3rd Rd., Lingya Dist., ...'
```

The Node entry point loads the ZIP directory anyway, so its `translate()` turns this **on by default**. A bare `new Translator({ roadTsv, districtTsv })` leaves it off, so a browser that wants translation without the ZIP data still works.

`knowsRoad()` only rejects an address when the directory has something to say about it. An address that names no road, or a rural 村/里 one — which the directory files by village rather than by street, so a real address like 南投縣中寮鄉永和村中正路 appears in neither index — always passes. Measured over the bundled directory's 44,635 addresses in four written shapes (178,540 in all), it wrongly rejects 3, every one of them the malformed 釣魚臺列嶼 row described above.

In the browser you wire `verify` up yourself, and `mailbox` with it — without `mailbox`, a box address falls through to the road tables, which read 基隆愛三路郵局 as a street called 愛三路. Both hook-ups are shown under [Three dictionaries](#three-dictionaries).

### P.O. box addresses

Chunghwa Post P.O. box addresses ('OO郵局第N號信箱') aren't door-number addresses, so they run on entirely different data and rules: the ZIP code comes straight from the post office's name and never touches the door-number rules. `find()` and `lookup()` already cover them, and `lookup()` labels them with `source: 'mailbox'`:

```js
import { find, lookup } from 'tw-fuzzy-zipcode'

find('基隆愛三路郵局第5號信箱')
// '200900'
lookup('基隆愛三路郵局第5號信箱')
// { zipcode: '200900', source: 'mailbox', resolution: 'six-digit' }
```

`translate()` covers them too, from the same official data — nothing is romanized on the fly here either:

```js
translate('基隆愛三路郵局第5號信箱').english
// 'P.O. Box 5, Keelung Ai 3rd Road, Keelung City 200900, Taiwan (R.O.C.)'
translate('政大郵局第12號信箱').english
// 'P.O. Box 12, National Chengchi University, Taipei City 116979, Taiwan (R.O.C.)'
```

`parts` then holds `{ poBox, postOffice, city, zipcode }` and none of the door-number fields: the 愛三路 in 基隆愛三路郵局 is part of the office's name, not a street the address sits on. The official form carries no 'Post Office' suffix, so neither does this; the `P.O. Box` prefix is spelled seven different ways across the source rows, so there is nothing to copy and this picks the conventional one.

The box number itself doesn't affect the ZIP code; omitting 第 or extra whitespace is fine. 899 post offices with a box actually open are covered. The source data lists another 314 that have been assigned a 6-digit code but whose box status is 「尚未開辦信箱」 — no box open yet; those return an empty string, because that code looks deliverable and isn't. Only ordinary civilian P.O. boxes are covered so far. Military special mailboxes (e.g. '左營郵政九○○○○附○○號信箱') aren't supported yet — their place names are too irregular to parse reliably (sometimes "county+district", sometimes "district+informal local name", sometimes just a bare county name with nothing to pin down the district), so guessing from the text risks a wrong answer, which is worse than no answer. Those addresses return an empty string for now.

## How matching works

1. The input is normalized for 台／臺, full-width characters, and common Chinese numeral forms.
2. The raw address is tokenized into city, district, road, lane, alley, house number, and related fragments.
3. If the address omits the city or the district and the shortened form names exactly one road nationwide, the missing fragments are restored before matching continues. Forms that name several roads are left alone rather than guessed.
4. When sufficient detail is present, house-number rules for odd/even numbers, above, below, and ranges produce a 6-digit ZIP code. Several rules often match one address — a stretch of house numbers may have its own delivery segment while a whole-road `全` rule backs up the rest — and the first matching rule wins. Rules keep the row order of Chunghwa Post's own file, exceptions before the `全` catch-all, so the narrower rule is always the one that matches first.
5. With less detail, a gradual address index produces a usable 3-digit ZIP code. If the match only identifies a broad prefix such as a city, `find()` returns an empty string and `lookup()` exposes the resolution instead.

## TypeScript

Type declarations for both the Node and browser entry points are included. No separate `@types` package is required.

The implementation is `.mjs` — what is published is the source, with no build step, and browsers can load it directly — while the types live in matching `.d.ts` files. The two are held together by JSDoc annotations plus `checkJs`: `test/conformance.test.ts` asserts at compile time that what `.mjs` actually exports matches what `.d.ts` declares, so changing either side alone fails `npm run typecheck`.

## Features and data size

The matcher compares address fragments and house-number rules in order, including odd/even, above, below, and range rules. The bundled June 2026 dataset contains 79,845 precise rules and 162,470 gradual address entries.

| Metric            | Result                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Transfer size     | About 0.80 MB Brotli; 1.21 MB gzip                                                                                                       |
| Index build       | About 34 ms in the browser; 56 ms on Node                                                                                                |
| Memory after load | About 5.3 MB in the browser; 21.5 MB on Node                                                                                             |
| Lookup            | About 1.7–2.0 µs per lookup                                                                                                              |
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

P.O. boxes draw on two sources, both from Chunghwa Post:

| File | Source | Contents |
| ---- | ------ | -------- |
| `data/mailbox.csv` | [郵局專用信箱一覽表](https://data.gov.tw/dataset/27770) | 1,278 office names, 6-digit ZIP codes, and box status; updated daily |
| `data/mailbox_en.csv` | [the same table's lookup page](https://www.post.gov.tw/post/internet/SearchZone/index.jsp?ID=130111) | 899 English office names, scraped county by county by `npm run fetch:mailbox-en` |

The first is published on Taiwan's open data platform under the Open Government Data License, version 1.0. Its 信箱英文名稱 column does carry English, but with the line breaks stripped, so the office name runs straight into the city (`Taipei HanzhongTaipei City  10899Taiwan ( R.O.C.)`). Splitting that back apart is guesswork, and it fails outright on the two offices whose own name contains a city (`Taipei City GovernmentTaipei City`); the ZIP codes embedded in that column are also still the legacy 5-digit ones. The lookup page keeps the `<br>`, which makes the split exact, and its codes are 6-digit.

The English county name is not taken from that page — it writes 屏東縣 as `Pingtung City` and 金門縣 as `Jinmen County` — but derived from `data/district_en.tsv`, so a box address and a door-number address in the same city agree.

`npm run build:mailbox` joins the two into `data/mailbox.tsv`.

## Development and verification

The project has no runtime dependencies. Rebuilding the data or refreshing the test fixture requires Python and the original Python reference package:

```bash
python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
pip install zipcodetw
npm run build
npm run build:en
npm run fetch:mailbox-en
npm run build:mailbox
npm run build:golden
npm run typecheck
npm test
```

`npm run typecheck` type-checks the `src/*.mjs` implementation with `checkJs` and verifies it against the public type declarations. `npm test` runs that type check first, then uses fixtures generated from the original Python package to verify the JavaScript implementation. Invalid 4-/5-digit common prefixes from the gradual index are normalized to 3 digits according to the public API contract.

## License

[MIT](LICENSE)

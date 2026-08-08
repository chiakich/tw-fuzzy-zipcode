# tw-fuzzy-zipcode

[繁體中文](README.md)

Dependency-free JavaScript lookup for Taiwan ZIP codes from raw, unstructured addresses. It handles complete, partial, or out-of-order addresses and common variants such as 台／臺, full-width characters, and Chinese numerals. Everything runs client-side: no server, WASM, or SQLite required.

This is a JavaScript port of the matching algorithm in [moskytw/zipcodetw](https://github.com/moskytw/zipcodetw). If your input is already split into city, district, road, and house-number fields, [`@simoko/tw-zip`](https://www.npmjs.com/package/@simoko/tw-zip) is likely a better fit. This package is intended for pasted addresses, OCR output, and existing single-field address inputs.

## Install

```bash
npm install tw-fuzzy-zipcode
```

## Usage

```js
import { find, lookup } from 'tw-fuzzy-zipcode';

find('臺北市信義區市府路1號'); // '110204'
find('臺北市信義區');          // '110'
find('臺北市');                // '' — no usable 3-digit ZIP code can be determined
find('松山區');                // '105'
find('台北市秀山街');          // '100005' — 台 is normalized to 臺
find('新北市溪尾街27巷1號');  // '241062' — the city or the district may be omitted
find('溪尾街27巷1號');        // '241062' — or both

lookup('臺北市');
// { zipcode: '1', source: 'gradual', resolution: 'prefix' }
```

`find(address)` accepts an address string and returns only a usable 3- or 6-digit ZIP code. It returns an empty string when no usable ZIP code can be determined or no match is found. The package never returns an invalid 4- or 5-digit intermediate prefix.

Use `lookup(address)` when the UI needs the matching detail. It returns `null` or `{ zipcode, source, resolution }`: `source` is `precise` or `gradual`, and `resolution` is `six-digit`, `three-digit`, or `prefix`. `prefix` means the match only identifies broad information, such as a city, and does not form a usable ZIP code.

## How matching works

1. The input is normalized for 台／臺, full-width characters, and common Chinese numeral forms.
2. The raw address is tokenized into city, district, road, lane, alley, house number, and related fragments.
3. If the address omits the city or the district and the shortened form names exactly one road nationwide, the missing fragments are restored before matching continues. Forms that name several roads are left alone rather than guessed.
4. When sufficient detail is present, house-number rules for odd/even numbers, above, below, and ranges produce a 6-digit ZIP code.
5. With less detail, a gradual address index produces a usable 3-digit ZIP code. If the match only identifies a broad prefix such as a city, `find()` returns an empty string and `lookup()` exposes the resolution instead.

## Browser

Browsers do not have filesystem access, so load the two packaged data files yourself. `loadDirectory()` handles loading failures and creates a `Directory`:

```js
import { loadDirectory } from 'tw-fuzzy-zipcode/browser';

const directory = await loadDirectory({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
});
directory.find('臺北市信義區市府路1號'); // '110204'
```

The data files are included in the npm package; copy them to a location your site can serve during its build process.

## TypeScript

Type declarations for both the Node and browser entry points are included. No separate `@types` package is required.

## Features and data size

The matcher compares address fragments and house-number rules in order, including odd/even, above, below, and range rules. The bundled June 2026 dataset contains 79,845 precise rules and 162,470 gradual address entries.

| Metric | Result |
| --- | --- |
| Transfer size | About 0.79 MB Brotli; 1.20 MB gzip |
| Index build | About 60 ms |
| Memory after load | About 12–70 MB, depending on the index implementation |
| Lookup | About 4–6 µs per lookup |
| Verification | 90,950 differential queries against the Python reference; invalid 4-/5-digit intermediate prefixes are normalized to valid 3-digit codes |

## Data source and license

`data/2606_01.csv` is derived from Chunghwa Post's postal directory dated 2026-06-29. The source data comes from the database installed by the [3+3 ZIP Code Application System](https://www.post.gov.tw/post/internet/Download/index.jsp?ID=220306) offline lookup tool, then converted to the CSV and TSV formats used by this project.

Chunghwa Post's 3+3 ZIP Code Open License Statement (2020-10-22) permits digital reproduction and public presentation of the 3+3 ZIP code data through different interfaces. Use remains subject to its software terms and third-party rights. This project credits Chunghwa Post as the source.

## Development and verification

The project has no runtime dependencies. Rebuilding the data or refreshing the test fixture requires Python and the original Python reference package:

```bash
python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
pip install zipcodetw
npm run build
npm run build:golden
npm run typecheck
npm test
```

`npm run typecheck` verifies the public TypeScript types. `npm test` runs that type check first, then uses fixtures generated from the original Python package to verify the JavaScript implementation. Invalid 4-/5-digit common prefixes from the gradual index are normalized to 3 digits according to the public API contract.

## License

[MIT](LICENSE)

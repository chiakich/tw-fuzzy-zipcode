# tw-fuzzy-zipcode

[![npm version](https://img.shields.io/npm/v/tw-fuzzy-zipcode.svg)](https://www.npmjs.com/package/tw-fuzzy-zipcode)
[![npm downloads](https://img.shields.io/npm/dm/tw-fuzzy-zipcode.svg)](https://www.npmjs.com/package/tw-fuzzy-zipcode)
[![license](https://img.shields.io/npm/l/tw-fuzzy-zipcode.svg)](LICENSE)

[English](README.en.md) · [線上 Demo](https://zipcode.chiaki.ch/) · [npm](https://www.npmjs.com/package/tw-fuzzy-zipcode)

從未拆欄位的台灣地址，模糊查詢郵遞區號的無相依 JavaScript 套件。它可處理完整、部分或順序不完整的地址，並支援「台／臺」、全半形與中文數字等常見寫法；所有查詢都在用戶端完成，不需要伺服器、WASM 或 SQLite。

這是 [moskytw/zipcodetw](https://github.com/moskytw/zipcodetw) 比對演算法的 JavaScript 移植版。若你的資料已經分成縣市、鄉鎮市區、路名與門牌等欄位，請優先考慮使用較適合表單資料的 [`@simoko/tw-zip`](https://www.npmjs.com/package/@simoko/tw-zip)。本套件的適用情境是使用者貼上的原始地址、OCR 結果或既有的單一文字地址欄位。

## 安裝

```bash
npm install tw-fuzzy-zipcode
```

## 使用方式

### 網頁版

https://zipcode.chiaki.ch/

### Node.js 使用

```js
import { find, lookup } from 'tw-fuzzy-zipcode'

find('臺北市信義區市府路1號')
// '110204'
find('臺北市信義區')
// '110'，部分地址會得到對應的部分郵遞區號
find('臺北市')
// ''，無法確定有效的 3 碼郵遞區號
find('松山區')
// '105'，可只輸入行政區或路名
find('台北市秀山街')
// '100005'，「台」會正規化為「臺」
find('臺北市松江路100號')
// '104091'，可省略縣市或行政區
find('松江路100號')
// '104091'，若路名唯一兩者都省略也可以
find('基隆愛三路郵局第5號信箱')
// '200900'，郵政信箱也一併處理

lookup('臺北市')
// { zipcode: '1', source: 'gradual', resolution: 'prefix' }
```

`find(address)` 接受一個地址字串，只回傳可直接使用的 3 或 6 碼郵遞區號；無法確定有效郵遞區號或找不到時回傳空字串。套件不會回傳無效的 4 或 5 碼中間前綴。它同時涵蓋門牌地址與郵政信箱，因為實際使用者輸入的地址往往兩種都有，呼叫端不需要自己先判斷。

若介面需要顯示比對層級，請使用 `lookup(address)`。它回傳 `null` 或 `{ zipcode, source, resolution }`：`source` 是 `precise`、`gradual` 或 `mailbox`，`resolution` 是 `six-digit`、`three-digit` 或 `prefix`。`prefix` 代表只辨識到縣市等不足以構成郵遞區號的資訊。

### 瀏覽器使用

瀏覽器環境沒有 `fs`，請自行載入套件附帶的資料檔。`loadZipcode()` 會處理載入失敗並建立 `Zipcode`，它的方法與上面的函式同名：

```js
import { loadZipcode } from 'tw-fuzzy-zipcode/browser'

const zip = await loadZipcode({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
  mailboxUrl: '/data/mailbox.tsv',
})
zip.find('臺北市信義區市府路1號')     // '110204'
zip.find('基隆愛三路郵局第5號信箱')   // '200900'
```

資料檔會隨 npm 套件發布；請在建置流程中將它們複製到網站可存取的位置。

### 已經知道地址形式時

如果你的資料來源保證只有其中一種形式，可以跳過另一種的檢查：`findAddress()` / `lookupAddress()` 只查門牌，`findMailbox()` / `lookupMailbox()` 只查信箱。Node 端是同名函式，瀏覽器端是 `Zipcode` 上的同名方法。

不確定的話就用 `find()`。它在門牌地址上的額外成本落在量測雜訊裡（見 [`docs/benchmark.md`](docs/benchmark.md)），因為信箱比對在正規化之前就先用字尾否決了。

### 英文地址翻譯

`translate(address)` 會依中華郵政的書寫規則，把中文地址翻成英文並反轉語序：

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

郵遞區號會自動查好一併帶入，也可用 `translate(address, { zipcode })` 自行指定，或用 `{ country: null }` 省略結尾的國名。若想自訂排版，`parts` 內是各欄位已經翻好的字串，可搭配 `formatEnglish(parts, country)` 重新組合。

目前所有名稱都來自中華郵政的官方中英對照資料，暫時先不做任何拼音推導。

`english` 和 `find()` 相同，有值就一定是完整、可寄達的英文地址。只要有名稱查不到官方翻譯，或地址無法定位到縣市，`english` 會回空字串、`complete` 為 `false`；查不到的名稱列在 `untranslated`，已翻好的欄位仍留在 `parts` 供呼叫端自行利用：

```js
const { english, parts, untranslated, complete } = translate('宜蘭縣礁溪鄉測試路1號')
// english: '',  untranslated: ['測試路'],  complete: false
// parts: { number: 'No. 1', road: '測試路',
//          district: 'Jiaoxi Township', city: 'Yilan County', zipcode: '262' }

translate('中正路100號')
// 全台到處都有中正路，缺縣市無從定位，english 為 ''，
// 但 parts 仍有 { road: 'Zhongzheng Rd.', number: 'No. 100' }
```

以套件內含的郵遞區號目錄實測，99.99% 的地址可以完全翻譯。

行政區同名時（例如四個縣市都有中正區）也一樣不猜：若地址其他部分不足以判斷是哪一個，該欄位就保留中文並使 `english` 為空。

### 路名與地點的交叉驗證

中英對照表是全國性的、不帶地點資訊，所以「四維三路」掛在臺北市信義區底下也一樣翻得出來，儘管它其實是高雄市苓雅區的路。只有郵遞區號目錄知道哪條路在哪裡，因此 `Translator` 接受一個選用的 `verify` 參數，`Directory.knowsRoad` 正是為它準備的：

```js
new Translator({ roadTsv, districtTsv, verify: (address) => directory.knowsRoad(address) })

translate('臺北市信義區四維三路2號').english   // '' — 信義區沒有四維三路
translate('高雄市苓雅區四維三路2號').english   // 'No. 2, Siwei 3rd Rd., Lingya Dist., ...'
```

Node 入口本來就會載入郵遞區號目錄，所以 `translate()` 預設開啟這項檢查；而 `new Translator({ roadTsv, districtTsv })` 則預設關閉，讓不想載入郵遞區號資料的瀏覽器端仍可單獨使用翻譯功能。

`knowsRoad()` 只在目錄確定時才會否定該地址。地址若沒有指名路段、或屬於村里制的鄉村地址（郵政目錄按村里而非街道編制，`南投縣中寮鄉永和村中正路` 兩個索引都查不到卻是真實地址），一律視為通過。以內含目錄的 44,635 筆地址、四種書寫變形共 178,540 筆實測，誤殺 3 筆，全部落在釣魚臺列嶼的異常列上。

瀏覽器同樣需要自行載入兩個資料檔：

```js
import { loadTranslator } from 'tw-fuzzy-zipcode/translate'

const translator = await loadTranslator({
  roadUrl: '/data/road_en.tsv',
  districtUrl: '/data/district_en.tsv',
})
translator.translate('臺北市信義區市府路1號', { zipcode: '110204' }).english
```

瀏覽器版不會自動補上省略的縣市或行政區，也不會自動查郵遞區號；若需要這兩項，請先用 `Directory` 的 `canonical()` 與 `find()` 處理過再傳入。

### 郵政信箱

郵局專用信箱地址（例如「OO郵局第N號信箱」）不是門牌，走的是完全不同的資料與規則：郵遞區號由郵局名稱直接對照得出，不經過門牌規則比對。`find()` 與 `lookup()` 已經涵蓋這類地址，`lookup()` 會以 `source: 'mailbox'` 標示：

```js
import { find, lookup } from 'tw-fuzzy-zipcode'

find('基隆愛三路郵局第5號信箱')
// '200900'
lookup('基隆愛三路郵局第5號信箱')
// { zipcode: '200900', source: 'mailbox', resolution: 'six-digit' }
```

信箱編號本身不影響郵遞區號，省略「第」或多餘空白都可以。共涵蓋 899 個實際開辦信箱的郵局：來源資料另有 314 個郵局雖已配賦六碼郵遞區號，但信箱狀態是「尚未開辦信箱」，這些一律回傳空字串——那個號碼看起來可以寄達，實際上寄不到。目前只涵蓋一般民用專用信箱；軍事特種信箱（例如「左營郵政九○○○○附○○號信箱」）尚未支援——這類地址的地名寫法太不規則（有時是「縣市+行政區」，有時是「行政區+地方俗名」，也可能只寫縣市，無法從文字本身可靠反推出正確的行政區），從地名猜測有猜錯的風險，比查不到還糟，因此暫不處理，回傳空字串。

只需要信箱查詢的話，可以單獨載入那份 20KB 的資料，不必連帶載入 4.3MB 的門牌索引：

```js
import { loadMailbox } from 'tw-fuzzy-zipcode/mailbox'

const mailbox = await loadMailbox({ mailboxUrl: '/data/mailbox.tsv' })
mailbox.find('基隆愛三路郵局第5號信箱') // '200900'
```

## 比對方式

1. 先正規化地址中的「台／臺」、全半形與常見中文數字寫法。
2. 將未拆欄位的地址切分為縣市、行政區、路段、巷弄與門牌等片段。
3. 若地址省略了縣市或行政區，且省略後的寫法在全台只對應一條路，補回缺少的片段再繼續比對；對應到多條路時維持原樣，不猜測。
4. 若地址包含足夠資訊，依門牌規則比對單雙號、以上、以下與區間，回傳 6 碼郵遞區號。
5. 資訊不足時，改以漸進式地址索引回傳可用的 3 碼郵遞區號；若僅能辨識到縣市等前綴，`find()` 會回傳空字串，`lookup()` 則可取得解析層級。

## TypeScript

套件內含 Node 與瀏覽器入口的 TypeScript 型別宣告，無須額外安裝 `@types` 套件。

實作是 `.mjs`（發布的就是原始碼，沒有建置步驟，瀏覽器可直接載入），型別宣告則寫在對應的 `.d.ts`。兩者透過 JSDoc 標註與 `checkJs` 互相驗證：`test/conformance.test.ts` 會在編譯期斷言 `.mjs` 實際匯出的內容符合 `.d.ts` 的宣告，任一邊改動而未同步都會讓 `npm run typecheck` 失敗。

## 特性與資料規模

套件依序比對地址片段與門牌規則，支援單雙號、以上、以下與區間等規則。使用內含的 2026 年 6 月資料集時，涵蓋 79,845 筆精確規則與 162,470 筆漸進式地址資料。

| 項目         | 結果                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| 傳輸大小     | Brotli 約 0.79 MB；gzip 約 1.21 MB                                           |
| 載入資料索引 | 瀏覽器約 34 ms；Node 約 56 ms                                                |
| 載入後記憶體 | 瀏覽器約 5.3 MB；Node 約 21.5 MB                                             |
| 單次查詢     | 約 1.7–2.0 µs                                                                |
| 正確性驗證   | 與 Python 參考實作進行 90,950 筆差異測試，4／5 碼中間前綴會正規化為合法 3 碼 |

兩種索引實作的差異、量測方法與限制，詳見[效能量測](docs/benchmark.md)。

## 資料來源與授權

`data/2606_01.csv` 來自中華郵政 2026-06-29 的郵遞區號目錄。原始資料取自「[3+3 郵遞區號應用系統](https://www.post.gov.tw/post/internet/Download/index.jsp?ID=220306)」離線查詢工具所安裝的資料庫，再轉換為專案使用的 CSV 與 TSV 格式。

中華郵政於「3+3 郵遞區號公開授權聲明」（2020-10-22）中授權以數位方式重製，並可於各種介面公開呈現 3+3 郵遞區號；使用時仍須遵守其軟體條款與第三人權利。本專案感謝並標示中華郵政為資料來源。

英文翻譯所用的三個對照檔同樣來自中華郵政，依教育部「中文譯音使用原則」以漢語拼音譯寫：

| 檔案 | 來源 | 內容 |
| ---- | ---- | ---- |
| `data/road_en.txt` | [中華郵政路街中英對照文字檔](https://data.gov.tw/dataset/152276) | 29,983 筆路街名稱中英對照 |
| `data/county_en.xml` | [縣市鄉鎮中英對照檔](https://data.gov.tw/dataset/5949) | 371 筆鄉鎮市區、22 筆縣市中英對照 |
| `data/village_en.csv` | [村里中英對照檔](https://www.post.gov.tw/post/internet/Postal/village.txt) | 8,521 筆村里與具名巷道中英對照 |
| `data/road_en_extra.tsv` | 本專案手動維護 | 403 筆官方檔案未收錄的名稱 |

前兩個檔案在政府資料開放平臺以「政府資料開放授權條款－第 1 版」發布。村里檔補上了路街檔沒有的 6,977 個名稱；兩檔衝突的 109 筆以較新的路街檔為準，被取代的多是漢語拼音之前的舊拼法。

官方檔案落後於郵局自己的線上查詢系統（例如 `東彰南路` 線上查得到、下載檔完全沒有），因此 `data/road_en_extra.tsv` 以相同慣例手動補上這些名稱，並在打包時覆蓋官方值 — 重新下載官方資料不會蓋掉這些修正。

`npm run build:en` 會把這四個檔案轉成 `data/road_en.tsv` 與 `data/district_en.tsv`。

`data/mailbox.csv`（[郵局專用信箱一覽表](https://data.gov.tw/dataset/27770)）同樣來自中華郵政，在政府資料開放平臺以「政府資料開放授權條款－第 1 版」發布、每日更新，涵蓋全台 1,213 個已開辦的專用信箱。`npm run build:mailbox` 會把它轉成 `data/mailbox.tsv`。

## 開發與驗證

專案不需要執行期相依套件。若要重建資料或更新測試基準，需安裝 Python 與原始 Python 參考套件：

```bash
python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
pip install zipcodetw
npm run build
npm run build:en
npm run build:mailbox
npm run build:golden
npm run typecheck
npm test
```

`npm run typecheck` 會以 `checkJs` 檢查 `src/*.mjs` 的實作，並驗證它與公開型別宣告一致；`npm test` 會先執行型別檢查，再以原始 Python 套件產生的基準資料驗證 JavaScript 實作。漸進式索引產生的無效 4／5 碼共同前綴，會依公開 API 規則正規化為 3 碼。

## 授權

[MIT](LICENSE)

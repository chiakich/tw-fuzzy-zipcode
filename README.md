# tw-fuzzy-zipcode

[English](README.en.md)

從未拆欄位的台灣地址，模糊查詢郵遞區號的無相依 JavaScript 套件。它可處理完整、部分或順序不完整的地址，並支援「台／臺」、全半形與中文數字等常見寫法；所有查詢都在用戶端完成，不需要伺服器、WASM 或 SQLite。

這是 [moskytw/zipcodetw](https://github.com/moskytw/zipcodetw) 比對演算法的 JavaScript 移植版。若你的資料已經分成縣市、鄉鎮市區、路名與門牌等欄位，請優先考慮使用較適合表單資料的 [`@simoko/tw-zip`](https://www.npmjs.com/package/@simoko/tw-zip)。本套件的適用情境是使用者貼上的原始地址、OCR 結果或既有的單一文字地址欄位。

## 安裝

```bash
npm install tw-fuzzy-zipcode
```

## 使用方式

```js
import { find, lookup } from 'tw-fuzzy-zipcode';

find('臺北市信義區市府路1號'); // '110204'
find('臺北市信義區');          // '110'，部分地址會得到對應的部分郵遞區號
find('臺北市');                // ''，無法確定有效的 3 碼郵遞區號
find('松山區');                // '105'，可只輸入行政區或路名
find('台北市秀山街');          // '100005'，「台」會正規化為「臺」
find('新北市溪尾街27巷1號');  // '241062'，可省略縣市或行政區
find('溪尾街27巷1號');        // '241062'，兩者都省略也可以

lookup('臺北市');
// { zipcode: '1', source: 'gradual', resolution: 'prefix' }
```

`find(address)` 接受一個地址字串，只回傳可直接使用的 3 或 6 碼郵遞區號；無法確定有效郵遞區號或找不到時回傳空字串。套件不會回傳無效的 4 或 5 碼中間前綴。

若介面需要顯示比對層級，請使用 `lookup(address)`。它回傳 `null` 或 `{ zipcode, source, resolution }`：`source` 是 `precise` 或 `gradual`，`resolution` 是 `six-digit`、`three-digit` 或 `prefix`。`prefix` 代表只辨識到縣市等不足以構成郵遞區號的資訊。

## 比對方式

1. 先正規化地址中的「台／臺」、全半形與常見中文數字寫法。
2. 將未拆欄位的地址切分為縣市、行政區、路段、巷弄與門牌等片段。
3. 若地址省略了縣市或行政區，且省略後的寫法在全台只對應一條路，補回缺少的片段再繼續比對；對應到多條路時維持原樣，不猜測。
4. 若地址包含足夠資訊，依門牌規則比對單雙號、以上、以下與區間，回傳 6 碼郵遞區號。
5. 資訊不足時，改以漸進式地址索引回傳可用的 3 碼郵遞區號；若僅能辨識到縣市等前綴，`find()` 會回傳空字串，`lookup()` 則可取得解析層級。

## 瀏覽器使用

瀏覽器環境沒有檔案系統，請自行載入套件附帶的兩個資料檔。`loadDirectory()` 會處理載入失敗並建立 `Directory`：

```js
import { loadDirectory } from 'tw-fuzzy-zipcode/browser';

const directory = await loadDirectory({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
});
directory.find('臺北市信義區市府路1號'); // '110204'
```

資料檔會隨 npm 套件發布；請在建置流程中將它們複製到網站可存取的位置。

## TypeScript

套件內含 Node 與瀏覽器入口的 TypeScript 型別宣告，無須額外安裝 `@types` 套件。

實作是 `.mjs`（發布的就是原始碼，沒有建置步驟，瀏覽器可直接載入），型別宣告則寫在對應的 `.d.ts`。兩者透過 JSDoc 標註與 `checkJs` 互相驗證：`test/conformance.test.ts` 會在編譯期斷言 `.mjs` 實際匯出的內容符合 `.d.ts` 的宣告，任一邊改動而未同步都會讓 `npm run typecheck` 失敗。


## 特性與資料規模

套件依序比對地址片段與門牌規則，支援單雙號、以上、以下與區間等規則。使用內含的 2026 年 6 月資料集時，涵蓋 79,845 筆精確規則與 162,470 筆漸進式地址資料。

| 項目 | 結果 |
| --- | --- |
| 傳輸大小 | Brotli 約 0.79 MB；gzip 約 1.20 MB |
| 載入資料索引 | 約 60 ms |
| 載入後記憶體 | 約 12–70 MB，取決於索引實作 |
| 單次查詢 | 約 4–6 µs |
| 正確性驗證 | 與 Python 參考實作進行 90,950 筆差異測試，4／5 碼中間前綴會正規化為合法 3 碼 |

## 資料來源與授權

`data/2606_01.csv` 來自中華郵政 2026-06-29 的郵遞區號目錄。原始資料取自「[3+3 郵遞區號應用系統](https://www.post.gov.tw/post/internet/Download/index.jsp?ID=220306)」離線查詢工具所安裝的資料庫，再轉換為專案使用的 CSV 與 TSV 格式。

中華郵政於「3+3 郵遞區號公開授權聲明」（2020-10-22）中授權以數位方式重製，並可於各種介面公開呈現 3+3 郵遞區號；使用時仍須遵守其軟體條款與第三人權利。本專案感謝並標示中華郵政為資料來源。

## 開發與驗證

專案不需要執行期相依套件。若要重建資料或更新測試基準，需安裝 Python 與原始 Python 參考套件：

```bash
python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
pip install zipcodetw
npm run build
npm run build:golden
npm run typecheck
npm test
```

`npm run typecheck` 會以 `checkJs` 檢查 `src/*.mjs` 的實作，並驗證它與公開型別宣告一致；`npm test` 會先執行型別檢查，再以原始 Python 套件產生的基準資料驗證 JavaScript 實作。漸進式索引產生的無效 4／5 碼共同前綴，會依公開 API 規則正規化為 3 碼。


## 授權

[MIT](LICENSE)

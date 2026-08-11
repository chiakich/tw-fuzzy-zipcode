import { Zipcode, loadDirectory, loadMailbox } from '../src/browser.mjs';
import { loadTranslator, stripAddressPrefix } from '../src/translate.mjs';

const form = document.querySelector('#search-form');
const input = document.querySelector('#address');
const result = document.querySelector('#result');
const clearButton = document.querySelector('.clear-button');
const suggestions = document.querySelector('#suggestions');

const RECENT_ADDRESSES_KEY = 'tw-fuzzy-zipcode.recent-addresses';
const QUERY_PARAM = 'q';
const exampleAddresses = [
  '臺北市信義區市府路1號', '松山區', '台北市秀山街', '基隆愛三路郵局第5號信箱',
];

let zip;
let translator;
let debounceTimer;
let closeSuggestionsTimer;
let copyResetTimer;

// Every index is fetched in parallel; the ZIP tables dwarf the bilingual ones,
// so the translation costs little beyond what the lookup already pays.
//
// Built from the pieces rather than through loadZipcode() only because the
// translator needs the box table too: at 46KB it lands well before the 4.3MB
// door-number index, so awaiting it first costs nothing and lets the two big
// downloads still overlap.
async function loadDemoDirectory() {
  const directoryLoad = loadDirectory({
    gradualUrl: '../data/gradual.tsv',
    preciseUrl: '../data/precise.tsv',
  });
  const mailbox = await loadMailbox({ mailboxUrl: '../data/mailbox.tsv' });

  let directory;
  [directory, translator] = await Promise.all([
    directoryLoad,
    loadTranslator({
      roadUrl: '../data/road_en.tsv',
      districtUrl: '../data/district_en.tsv',
      // The bilingual tables carry no location, so 臺北市信義區四維三路 would
      // translate as readily as the 高雄市苓雅區 street it really is. The ZIP
      // index is loaded here anyway, so let it have the last word.
      verify: (address) => zip.directory.knowsRoad(address),
      // Without this a P.O. box falls through to the road tables, which read
      // 基隆愛三路郵局 as a street called 愛三路.
      mailbox,
    }),
  ]);
  zip = new Zipcode({ directory, mailbox });
}

// Keeps the address in the URL so a lookup can be linked or shared. replaceState,
// not pushState: typing should not fill the back button with every keystroke.
function syncQueryParam(address) {
  const url = new URL(location.href);
  if (address) url.searchParams.set(QUERY_PARAM, address);
  else url.searchParams.delete(QUERY_PARAM);
  history.replaceState(null, '', url);
}

// The browser translator does neither of the two things the Node entry point
// does for it: fill in an omitted city/district, and look the ZIP code up.
// Mirror src/node.mjs so the demo matches the documented behaviour.
function translateAddress(address) {
  const stripped = stripAddressPrefix(address);
  // A box address carries its own ZIP and English, and canonical() would read
  // the office's name as a street; hand it straight over, as src/node.mjs does.
  if (zip.mailbox.parse(stripped)) return translator.translate(stripped);
  return translator.translate(zip.directory.canonical(stripped), {
    zipcode: zip.findAddress(stripped),
  });
}

// An empty `english` means the library declined to guess, and the reason is
// worth showing: it is the whole point of the no-romanization rule.
function renderEnglish(translation) {
  if (translation.english) {
    const row = document.createElement('div');
    row.className = 'english-row';

    const line = document.createElement('p');
    line.className = 'english';
    line.textContent = translation.english;

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-button';
    copy.textContent = '複製';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(translation.english);
        copy.textContent = '已複製';
      } catch {
        copy.textContent = '複製失敗';
      }
      clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => { copy.textContent = '複製'; }, 1600);
    });

    row.append(line, copy);
    return row;
  }

  const { untranslated, parts } = translation;
  // Nothing was recognized at all: the ZIP message above already says so.
  if (untranslated.length === 0 && !parts.city && !parts.district && !parts.road) {
    return null;
  }

  // The three ways english comes back empty, in the order translate() checks.
  const note = document.createElement('p');
  note.className = 'english-missing';
  if (untranslated.length > 0) {
    note.textContent = `無法英譯：「${untranslated.join('」「')}」查無官方譯名，不以拼音推測。`;
  } else if (!parts.city) {
    note.textContent = '地址不足以定位到縣市，無法產生可寄達的英文地址。';
  } else {
    note.textContent = '郵遞區號目錄沒有這個行政區的這條路，可能是路名或縣市寫錯了。';
  }
  return note;
}

function showResult(address) {
  const zipcode = zip.find(stripAddressPrefix(address));
  const translation = translateAddress(address);
  syncQueryParam(address);
  result.hidden = false;
  result.replaceChildren();

  const message = document.createElement('p');
  if (zipcode) {
    rememberAddress(address);
    message.className = 'result-match';
    const code = document.createElement('strong');
    code.className = 'zipcode';
    code.textContent = zipcode;
    message.append(code, ` ${address}`);
  } else {
    message.className = 'not-found';
    message.textContent = '找不到相符的郵遞區號。請確認地址，或嘗試輸入更多資訊。';
  }
  result.append(message);

  const english = renderEnglish(translation);
  if (english) result.append(english);
}

function getRecentAddresses() {
  try {
    const addresses = JSON.parse(localStorage.getItem(RECENT_ADDRESSES_KEY));
    return Array.isArray(addresses) ? addresses.filter((address) => typeof address === 'string') : [];
  } catch {
    return [];
  }
}

function rememberAddress(address) {
  const addresses = [address, ...getRecentAddresses().filter((item) => item !== address)].slice(0, 10);
  try {
    localStorage.setItem(RECENT_ADDRESSES_KEY, JSON.stringify(addresses));
  } catch {
    // The demo continues to work when browser storage is unavailable.
  }
}

function removeRecentAddress(address) {
  try {
    localStorage.setItem(
      RECENT_ADDRESSES_KEY,
      JSON.stringify(getRecentAddresses().filter((item) => item !== address)),
    );
  } catch {
    // The demo continues to work when browser storage is unavailable.
  }
}

// Only offered on an empty query: the panel is a "what do I type" affordance,
// and restricting it that way is what keeps it off the result below.
function renderSuggestions() {
  const recentAddresses = getRecentAddresses();
  const isRecent = recentAddresses.length > 0;
  const addresses = input.value.trim() ? [] : (isRecent ? recentAddresses : exampleAddresses);

  suggestions.replaceChildren();
  if (addresses.length === 0) {
    suggestions.hidden = true;
    return;
  }

  const title = document.createElement('p');
  title.className = 'suggestions-title';
  title.textContent = isRecent ? '最近查詢' : '試試看';
  suggestions.append(title);

  for (const address of addresses) {
    const row = document.createElement('div');
    row.className = 'suggestion-row';
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'suggestion';
    item.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8v4l2.7 1.6M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" /></svg>';
    item.append(document.createTextNode(address));
    item.addEventListener('click', () => {
      input.value = address;
      updateClearButton();
      input.focus();
      hideSuggestions();
      showResult(address);
    });
    row.append(item);

    if (isRecent) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-suggestion';
      remove.setAttribute('aria-label', `刪除「${address}」`);
      remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>';
      remove.addEventListener('pointerdown', (event) => event.preventDefault());
      remove.addEventListener('click', () => {
        removeRecentAddress(address);
        renderSuggestions();
      });
      row.append(remove);
    }
    suggestions.append(row);
  }
  suggestions.hidden = false;
}

function showSuggestions() {
  clearTimeout(closeSuggestionsTimer);
  renderSuggestions();
}

function hideSuggestions() {
  suggestions.hidden = true;
}

function updateClearButton() {
  clearButton.hidden = input.value.length === 0;
}

function scheduleLookup() {
  clearTimeout(debounceTimer);
  const address = input.value.trim();
  if (!address) {
    result.hidden = true;
    if (document.activeElement === input) renderSuggestions();
    else hideSuggestions();
    return;
  }
  debounceTimer = setTimeout(() => {
    if (zip) showResult(address);
  }, 250);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(debounceTimer);
  const address = input.value.trim();
  if (address && zip) showResult(address);
});

input.addEventListener('input', () => {
  updateClearButton();
  showSuggestions();
  scheduleLookup();
});
input.addEventListener('focus', showSuggestions);
input.addEventListener('blur', () => {
  closeSuggestionsTimer = setTimeout(hideSuggestions, 150);
});
clearButton.addEventListener('click', () => {
  clearTimeout(debounceTimer);
  input.value = '';
  result.hidden = true;
  syncQueryParam('');
  updateClearButton();
  input.focus();
  showSuggestions();
});

const sharedAddress = new URLSearchParams(location.search).get(QUERY_PARAM);
if (sharedAddress) {
  input.value = sharedAddress;
  updateClearButton();
}

loadDemoDirectory().then(() => {
  scheduleLookup();
}).catch(() => {
  result.hidden = false;
  const message = document.createElement('p');
  message.className = 'not-found';
  message.textContent = '資料載入失敗。請以靜態網頁伺服器開啟此頁面。';
  result.replaceChildren(message);
});

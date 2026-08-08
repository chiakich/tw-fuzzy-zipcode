import { loadDirectory } from '../src/zipcodetw.mjs';

const form = document.querySelector('#search-form');
const input = document.querySelector('#address');
const result = document.querySelector('#result');
const clearButton = document.querySelector('.clear-button');
const suggestions = document.querySelector('#suggestions');

const RECENT_ADDRESSES_KEY = 'tw-fuzzy-zipcode.recent-addresses';
const exampleAddresses = ['臺北市信義區市府路1號', '松山區', '台北市秀山街'];

let directory;
let debounceTimer;
let closeSuggestionsTimer;

async function loadDemoDirectory() {
  directory = await loadDirectory({
    gradualUrl: '../data/gradual.tsv',
    preciseUrl: '../data/precise.tsv',
  });
}

function showResult(address) {
  const zipcode = directory.find(address);
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
    result.append(message);
  } else {
    message.className = 'not-found';
    message.textContent = '找不到相符的郵遞區號。請確認地址，或嘗試輸入更多資訊。';
    result.append(message);
  }
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
    if (directory) showResult(address);
  }, 250);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearTimeout(debounceTimer);
  const address = input.value.trim();
  if (address && directory) showResult(address);
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
  updateClearButton();
  input.focus();
  showSuggestions();
});

loadDemoDirectory().then(() => {
  scheduleLookup();
}).catch(() => {
  result.hidden = false;
  const message = document.createElement('p');
  message.className = 'not-found';
  message.textContent = '資料載入失敗。請以靜態網頁伺服器開啟此頁面。';
  result.replaceChildren(message);
});

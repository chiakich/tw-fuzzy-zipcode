import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTranslator, translate } from '../src/node.mjs';
import { normalize } from '../src/zipcodetw.mjs';
import { formatEnglish, loadTranslator } from '../src/translate.mjs';

const dataPath = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

test('translates a full address in Chunghwa Post order', () => {
  assert.equal(
    translate('臺北市信義區市府路1號').english,
    'No. 1, Shifu Rd., Xinyi Dist., Taipei City 110204, Taiwan (R.O.C.)',
  );
  assert.equal(
    translate('臺北市中正區忠孝東路一段1巷1弄1號1樓').english,
    '1F., No. 1, Aly. 1, Ln. 1, Sec. 1, Zhongxiao E. Rd., Zhongzheng Dist., '
    + 'Taipei City 100009, Taiwan (R.O.C.)',
  );
});

test('reverses every field it recognizes', () => {
  const { parts } = translate('臺北市中山區松江路100號');
  assert.deepEqual(parts, {
    city: 'Taipei City',
    district: 'Zhongshan Dist.',
    road: 'Songjiang Rd.',
    number: 'No. 100',
    zipcode: '104091',
  });
});

test('writes 之 as a hyphenated house number', () => {
  assert.equal(translate('臺北市信義區市府路1之2號').parts.number, 'No. 1-2');
});

test('handles floors, rooms, and sub-alleys the ZIP tokenizer ignores', () => {
  // 之 attaches to the floor on either side of 樓, and 5F is as common as 5樓.
  assert.equal(translate('臺北市信義區市府路1號5樓之2').parts.floor, '5F.-2');
  assert.equal(translate('臺北市信義區市府路1號1之1樓').parts.floor, '1F.-1');
  assert.equal(translate('臺北市信義區市府路1號5F').parts.floor, '5F.');

  const { parts } = translate('臺北市信義區市府路3衖1號3樓5室');
  assert.equal(parts.subAlley, 'Sub-alley 3');
  assert.equal(parts.room, 'Rm. 5');
  assert.equal(
    translate('臺北市信義區市府路1號3樓5室').english,
    'Rm. 5, 3F., No. 1, Shifu Rd., Xinyi Dist., Taipei City 110204, Taiwan (R.O.C.)',
  );
});

test('ignores a ZIP code or 臺灣 already in front of the address', () => {
  const expected = translate('臺北市信義區市府路1號').english;
  assert.equal(translate('110臺灣臺北市信義區市府路1號').english, expected);
  assert.equal(translate('110204 臺北市信義區市府路1號').english, expected);
});

test('translates village names from the postal village file', () => {
  assert.equal(
    translate('南投縣中寮鄉永和村中正路5號').english,
    'No. 5, Zhongzheng Rd., Yonghe Vil., Zhongliao Township, Nantou County 541, Taiwan (R.O.C.)',
  );
  assert.equal(translate('臺東縣太麻里鄉大王村1號').parts.village, 'Dawang Vil.');
});

test('normalizes the input the same way the ZIP lookup does', () => {
  // 台 -> 臺, full-width digits, and Chinese numerals before a unit.
  assert.equal(
    translate('台北市信義區市府路１號').english,
    translate('臺北市信義區市府路1號').english,
  );
  assert.equal(
    translate('高雄市前金區一心一路1號').parts.road,
    'Yixin 1st Rd.',
  );
});

test('fills in the city when only the district is named', () => {
  // 松山區 is Taipei's alone; 市府路 pins 信義區 down through the ZIP index.
  assert.equal(translate('松山區').parts.city, 'Taipei City');
  const { parts } = translate('信義區市府路1號');
  assert.equal(parts.district, 'Xinyi Dist.');
  assert.equal(parts.city, 'Taipei City');
});

test('leaves an ambiguous district in Chinese rather than guessing', () => {
  // 中正區 exists in four cities, and nothing here says which.
  const { parts, untranslated, complete } = translate('中正區');
  assert.equal(parts.district, '中正區');
  assert.deepEqual(untranslated, ['中正區']);
  assert.equal(complete, false);
});

test('passes untranslated names through in Chinese and reports them', () => {
  const { english, untranslated, complete } = translate('臺北市信義區沒有這條路1號');
  assert.match(english, /沒有這條路/);
  assert.deepEqual(untranslated, ['沒有這條路']);
  assert.equal(complete, false);
});

test('city-only and district-only addresses translate without a ZIP code', () => {
  assert.equal(translate('臺北市').english, 'Taipei City, Taiwan (R.O.C.)');
  assert.equal(translate('連江縣南竿鄉').english,
    'Nangan Township, Lienchiang County 209, Taiwan (R.O.C.)');
});

test('country line is optional', () => {
  assert.equal(
    translate('臺北市信義區市府路1號', { country: null }).english,
    'No. 1, Shifu Rd., Xinyi Dist., Taipei City 110204',
  );
});

test('formatEnglish lays out parts supplied by the caller', () => {
  assert.equal(
    formatEnglish({ road: 'Shifu Rd.', number: 'No. 1', city: 'Taipei City' }, null),
    'No. 1, Shifu Rd., Taipei City',
  );
  assert.equal(formatEnglish({}), '');
});

test('every packed key is a fixed point of normalize()', () => {
  // scripts/pack_en.py ports normalize() to Python; if the two ever disagree,
  // some keys become unreachable. Re-normalizing them here catches the drift.
  for (const name of ['road_en.tsv', 'district_en.tsv']) {
    for (const line of readFileSync(dataPath(name), 'utf8').split('\n')) {
      const [, suffix] = line.split('\t');
      assert.equal(normalize(suffix), suffix, `${name}: ${suffix}`);
    }
  }
});

test('the bundled tables cover the addresses the ZIP directory knows', () => {
  const translator = getTranslator();
  let total = 0, complete = 0;
  let prev = '';
  for (const line of readFileSync(dataPath('precise.tsv'), 'utf8').split('\n')) {
    const t1 = line.indexOf('\t');
    const t2 = line.indexOf('\t', t1 + 1);
    const key = prev.slice(0, parseInt(line.slice(0, t1), 16)) + line.slice(t1 + 1, t2);
    prev = key;
    total += 1;
    if (translator.translate(key).complete) complete += 1;
  }
  // 99.99% at the time of writing: 6 keys short, all of them malformed rows
  // in the source CSV ('地下層' in the road column, the 釣魚臺列嶼 district).
  // Whatever is left comes back in Chinese and flagged, never guessed.
  assert.ok(complete / total > 0.999, `coverage ${(100 * complete / total).toFixed(2)}%`);
});

test('browser loader builds a translator and reports failed data requests', async () => {
  const translator = await loadTranslator({
    roadUrl: '/road_en.tsv',
    districtUrl: '/district_en.tsv',
    fetch: async (url) => ({
      ok: true,
      status: 200,
      text: async () => readFileSync(dataPath(url.slice(1)), 'utf8'),
    }),
  });
  assert.equal(
    translator.translate('臺北市信義區市府路1號', { zipcode: '110204' }).english,
    'No. 1, Shifu Rd., Xinyi Dist., Taipei City 110204, Taiwan (R.O.C.)',
  );

  await assert.rejects(
    loadTranslator({
      roadUrl: '/road_en.tsv',
      districtUrl: '/district_en.tsv',
      fetch: async () => ({ ok: false, status: 404 }),
    }),
    /HTTP 404/,
  );
  await assert.rejects(loadTranslator({ fetch: async () => ({ ok: true }) }), TypeError);
});

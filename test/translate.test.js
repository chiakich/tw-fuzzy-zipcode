import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDirectory, getTranslator, translate } from '../src/node.mjs';
import { normalize } from '../src/zipcodetw.mjs';
import { formatEnglish, loadTranslator, Translator } from '../src/translate.mjs';

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
  const { english, parts, untranslated, complete } = translate('中正區');
  assert.equal(parts.district, '中正區');
  assert.deepEqual(untranslated, ['中正區']);
  assert.equal(complete, false);
  assert.equal(english, '');
});

test('keeps untranslated names in parts but empties english', () => {
  const { english, parts, untranslated, complete } = translate('臺北市信義區沒有這條路1號');
  assert.equal(english, '');
  assert.equal(parts.road, '沒有這條路');
  assert.deepEqual(untranslated, ['沒有這條路']);
  assert.equal(complete, false);
});

test('rejects a road the named district does not have', () => {
  // 四維三路 is Kaohsiung's, 市府路 Taipei's, 臺灣大道 Taichung's. Every name
  // here translates — the bilingual tables are nationwide and say nothing
  // about location — so only the ZIP index can tell these are not addresses.
  for (const address of [
    '臺北市信義區四維三路2號',
    '宜蘭縣礁溪鄉市府路1號',
    '基隆市信義區台灣大道三段99號',
  ]) {
    const { english, complete, untranslated } = translate(address);
    assert.equal(english, '', address);
    assert.equal(complete, false, address);
    // Nothing failed to translate; the address itself is what is wrong.
    assert.deepEqual(untranslated, [], address);
  }

  // The same street names under the districts that do have them.
  assert.ok(translate('高雄市苓雅區四維三路2號').complete);
  assert.ok(translate('臺北市信義區市府路1號').complete);
  assert.ok(translate('臺中市西屯區台灣大道三段99號').complete);
});

test('verification is off unless a verifier is supplied', () => {
  // A bare Translator has no ZIP index and must not pretend otherwise.
  const bare = new Translator({
    roadTsv: readFileSync(dataPath('road_en.tsv'), 'utf8'),
    districtTsv: readFileSync(dataPath('district_en.tsv'), 'utf8'),
  });
  assert.equal(
    bare.translate('臺北市信義區四維三路2號').english,
    'No. 2, Siwei 3rd Rd., Xinyi Dist., Taipei City, Taiwan (R.O.C.)',
  );
  assert.equal(bare.translate('臺北市信義區四維三路2號').complete, true);
});

test('knowsRoad leaves alone what the directory cannot contradict', () => {
  const directory = getDirectory();
  // Rural addressing is filed by village, not by street: 南投縣中寮鄉永和村中正路
  // is in neither index and is a real address regardless.
  assert.equal(directory.knowsRoad('南投縣中寮鄉永和村中正路5號'), true);
  assert.equal(directory.knowsRoad('臺東縣太麻里鄉大王村1號'), true);
  // Nothing past the district is being claimed.
  assert.equal(directory.knowsRoad('臺北市'), true);
  assert.equal(directory.knowsRoad('嘉義縣民雄鄉'), true);
  // A road with no house-number rule of its own lives in the gradual index.
  assert.equal(directory.knowsRoad('南投縣中寮鄉中集路'), true);
  // A named lane is part of the road name, with or without a house number.
  assert.equal(directory.knowsRoad('南投縣國姓鄉東1巷'), true);
  assert.equal(directory.knowsRoad('南投縣國姓鄉東1巷5號'), true);
  // And the ones it can contradict.
  assert.equal(directory.knowsRoad('臺北市信義區四維三路2號'), false);
  assert.equal(directory.knowsRoad('臺北市信義區沒有這條路1號'), false);
});

test('an address that never resolves its city empties english too', () => {
  // 中正路 exists all over Taiwan; without a city nothing anchors it, so the
  // result is no address at all rather than a line that cannot be delivered.
  const { english, parts, complete } = translate('中正路100號');
  assert.equal(english, '');
  assert.equal(complete, false);
  // The fields that did translate are still there for callers to build on.
  assert.equal(parts.road, 'Zhongzheng Rd.');
  assert.equal(parts.number, 'No. 100');
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
  // 99.99% at the time of writing: 4 keys short, all of them the same kind of
  // malformed row in the source CSV — an uninhabited island whose county name
  // was truncated to the column width ('南海諸' for 南海諸島) and whose road
  // column then repeats the district. Nothing is guessed; those come back
  // flagged, with an empty `english`.
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

test('translates a P.O. box from the box table, not the road tables', () => {
  const { english, parts, untranslated, complete } = translate('基隆愛三路郵局第5號信箱');
  assert.equal(english, 'P.O. Box 5, Keelung Ai 3rd Road, Keelung City 200900, Taiwan (R.O.C.)');
  assert.deepEqual(parts, {
    poBox: 'P.O. Box 5',
    postOffice: 'Keelung Ai 3rd Road',
    city: 'Keelung City',
    zipcode: '200900',
  });
  assert.deepEqual(untranslated, []);
  assert.equal(complete, true);
});

test('a box address never reaches the road tables', () => {
  // 愛三路 is part of the office's name, not a street the address sits on.
  // Without the box branch this came back as a Keelung road plus a stray 郵局.
  const { parts } = translate('基隆愛三路郵局第5號信箱');
  assert.equal(parts.road, undefined);
  assert.equal(parts.district, undefined);
  // Same for an office named after a university rather than a road.
  assert.equal(
    translate('政大郵局第12號信箱').english,
    'P.O. Box 12, National Chengchi University, Taipei City 116979, Taiwan (R.O.C.)',
  );
});

test('box addresses honour the same options door-number addresses do', () => {
  assert.equal(
    translate('基隆愛三路郵局第5號信箱', { country: null }).english,
    'P.O. Box 5, Keelung Ai 3rd Road, Keelung City 200900',
  );
  // A caller-supplied ZIP wins over the packed one, as it does elsewhere.
  assert.equal(
    translate('基隆愛三路郵局第5號信箱', { zipcode: '200' }).parts.zipcode, '200',
  );
  // A ZIP already in front of the address is the answer, not the question.
  assert.equal(
    translate('200900 基隆愛三路郵局第5號信箱').english,
    translate('基隆愛三路郵局第5號信箱').english,
  );
});

test('the box number is read off the address, not the table', () => {
  const box = (n) => translate(`基隆愛三路郵局第${n}號信箱`).parts.poBox;
  assert.equal(box(5), 'P.O. Box 5');
  assert.equal(box(4321), 'P.O. Box 4321');
  assert.equal(box('007'), 'P.O. Box 007');
});

test('an office with no box open stays untranslated rather than inventing one', () => {
  // 左營華夏路郵局 is listed with a 6-digit code but 尚未開辦信箱.
  const { english, complete } = translate('左營華夏路郵局第5號信箱');
  assert.equal(english, '');
  assert.equal(complete, false);
});

test('a translator without the box table leaves box addresses alone', () => {
  const bare = new Translator({
    roadTsv: readFileSync(dataPath('road_en.tsv'), 'utf8'),
    districtTsv: readFileSync(dataPath('district_en.tsv'), 'utf8'),
  });
  assert.equal(bare.translate('基隆愛三路郵局第5號信箱').parts.poBox, undefined);
});

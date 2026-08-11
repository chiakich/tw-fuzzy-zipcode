import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  find, lookup, findAddress, lookupAddress, findMailbox, getZipcode,
  getDirectory, getMailbox,
} from '../src/node.mjs';
import { Zipcode, loadZipcode } from '../src/zipcode.mjs';

const dataPath = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

const DOOR = '臺北市信義區市府路1號';
const BOX = '基隆愛三路郵局第5號信箱';

test('find() resolves both address forms', () => {
  assert.equal(find(DOOR), '110204');
  assert.equal(find(BOX), '200900');
  assert.equal(find('不存在的地址'), '');
});

test('the narrow functions stay narrow', () => {
  assert.equal(findAddress(DOOR), '110204');
  assert.equal(findAddress(BOX), '');
  assert.equal(findMailbox(BOX), '200900');
  assert.equal(findMailbox(DOOR), '');
});

test('lookup() reports which index answered', () => {
  assert.deepEqual(lookup(BOX), {
    zipcode: '200900', source: 'mailbox', resolution: 'six-digit',
  });
  assert.deepEqual(lookup(DOOR), {
    zipcode: '110204', source: 'precise', resolution: 'six-digit',
  });
  // A door-number address the directory can only place roughly still comes
  // back through the address half, not as a mailbox miss.
  assert.deepEqual(lookup('木柵路'), lookupAddress('木柵路'));
  assert.equal(lookup('不存在的地址'), null);
});

test('supporting P.O. boxes changed no door-number answer', () => {
  // The whole golden corpus, replayed through the composite. find() now runs
  // the mailbox check first on every one of these, so this is what proves the
  // fast reject never swallows a door-number address.
  const fixture = fileURLToPath(new URL('./fixtures/golden_find.tsv', import.meta.url));
  const lines = readFileSync(fixture, 'utf8').split('\n').filter(Boolean);
  let checked = 0;
  for (const line of lines) {
    const query = line.slice(0, line.indexOf('\t'));
    const viaComposite = find(query);
    if (viaComposite !== findAddress(query)) {
      assert.fail(`find(${JSON.stringify(query)}) = ${JSON.stringify(viaComposite)}, but findAddress() gives ${JSON.stringify(findAddress(query))}`);
    }
    checked += 1;
  }
  assert.ok(checked > 80000, `expected the full corpus, replayed ${checked}`);
});

test('the node entry point delegates to one shared Zipcode', () => {
  const zip = getZipcode();
  assert.equal(zip.directory, getDirectory());
  assert.equal(zip.mailbox, getMailbox());
  assert.equal(zip.find(BOX), find(BOX));
  assert.equal(zip.findAddress(DOOR), findAddress(DOOR));
});

test('Zipcode composes from raw tables or from existing instances', () => {
  const fromInstances = new Zipcode({
    directory: getDirectory(), mailbox: getMailbox(),
  });
  const fromTables = new Zipcode({
    gradualTsv: readFileSync(dataPath('gradual.tsv'), 'utf8'),
    preciseTsv: readFileSync(dataPath('precise.tsv'), 'utf8'),
    mailboxTsv: readFileSync(dataPath('mailbox.tsv'), 'utf8'),
  });
  for (const query of [DOOR, BOX, '松江路100號', '木柵路']) {
    assert.equal(fromTables.find(query), fromInstances.find(query), query);
  }

  // Half-built is a mistake worth naming, not a confusing failure two layers down.
  assert.throws(() => new Zipcode({ directory: getDirectory() }), TypeError);
  assert.throws(() => new Zipcode({ mailbox: getMailbox() }), TypeError);
});

test('browser loader fetches all three tables and answers like the node entry point', async () => {
  const requested = [];
  const zip = await loadZipcode({
    gradualUrl: '/gradual.tsv',
    preciseUrl: '/precise.tsv',
    mailboxUrl: '/mailbox.tsv',
    fetch: async (url) => {
      requested.push(url);
      return {
        ok: true,
        status: 200,
        text: async () => readFileSync(dataPath(url.slice(1)), 'utf8'),
      };
    },
  });
  assert.ok(zip instanceof Zipcode);
  assert.deepEqual(requested.sort(), ['/gradual.tsv', '/mailbox.tsv', '/precise.tsv']);

  // The packed store the browser defaults to must agree with the node Maps.
  for (const query of [DOOR, BOX, '松江路100號', '木柵路', '不存在的地址']) {
    assert.equal(zip.find(query), find(query), query);
    assert.deepEqual(zip.lookup(query), lookup(query), query);
  }

  await assert.rejects(
    loadZipcode({
      gradualUrl: '/gradual.tsv',
      preciseUrl: '/precise.tsv',
      fetch: async () => ({ ok: true, status: 200, text: async () => '' }),
    }),
    TypeError,
    'mailboxUrl is required',
  );
});

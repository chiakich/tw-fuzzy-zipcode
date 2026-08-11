import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getMailbox, findMailbox, lookupMailbox } from '../src/node.mjs';
import { Mailbox, loadMailbox } from '../src/mailbox.mjs';

const dataPath = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));

test('finds the ZIP code for a P.O. box address', () => {
  assert.equal(findMailbox('基隆愛三路郵局第5號信箱'), '200900');
});

test('normalizes the address the same way the ZIP lookup does', () => {
  // 台 -> 臺, full-width digits, and a Chinese numeral before 路.
  assert.equal(findMailbox('台北北門郵局第５號信箱'), findMailbox('臺北北門郵局第5號信箱'));
  assert.equal(findMailbox('基隆愛三路郵局第5號信箱'), findMailbox('基隆愛3路郵局第5號信箱'));
});

test('accepts the box number without 第, and with extra spacing', () => {
  assert.equal(findMailbox('基隆愛三路郵局5號信箱'), '200900');
  assert.equal(findMailbox('基隆愛三路郵局第 5 號信箱'), '200900');
});

test('returns an empty string for door-number addresses and unknown post offices', () => {
  assert.equal(findMailbox('臺北市信義區市府路1號'), '');
  assert.equal(findMailbox('不存在郵局第1號信箱'), '');
  assert.equal(findMailbox(''), '');
});

test('every packed key round-trips through the same address form a real box would use', () => {
  const mailbox = getMailbox();
  let total = 0;
  for (const key of mailbox.table.keys()) {
    total += 1;
    assert.equal(findMailbox(`${key}第7號信箱`), mailbox.table.get(key));
  }
  assert.ok(total > 800, `expected over 800 post offices, got ${total}`);
});

// find() rejects most addresses by reading the tail rather than normalizing
// and matching, so the trailing characters normalize() would have stripped
// have to survive that shortcut.
test('the fast reject still accepts trailing whitespace and punctuation', () => {
  for (const trailing of [' ', '　', '  ', ',', '，', '\n', '\t']) {
    assert.equal(
      findMailbox(`基隆愛三路郵局第5號信箱${trailing}`), '200900',
      `trailing ${JSON.stringify(trailing)} was rejected`,
    );
  }
});

test('the fast reject turns away addresses that cannot be P.O. boxes', () => {
  assert.equal(findMailbox('臺北市信義區市府路1號'), '');
  assert.equal(findMailbox('信箱'), '');
  assert.equal(findMailbox('基隆愛三路郵局第5號信箱x'), '');
  assert.equal(findMailbox('箱'), '');
});

// The source CSV lists offices that have been assigned a 6-digit code but
// have no box open ('尚未開辦信箱'). Keying on the code alone would answer
// these with a ZIP that looks deliverable and isn't.
test('post offices with no box open are absent, code or no code', () => {
  const csv = readFileSync(dataPath('mailbox.csv'), 'utf8');
  const unopened = csv.split('\n')
    .filter((line) => line.includes('尚未開辦'))
    .map((line) => line.slice(0, line.indexOf(',')))
    .filter(Boolean);
  assert.ok(unopened.length > 300, `expected the CSV to still list them, saw ${unopened.length}`);
  for (const name of unopened) {
    assert.equal(findMailbox(`${name}第7號信箱`), '', `${name} has no box open`);
  }
  // The one office whose 信箱樣式 is 無 but which does have a box must survive.
  assert.equal(findMailbox('朴子長庚醫院郵局第1號信箱'), '613940');
});

test('lookupMailbox reports the source, and null rather than an empty result', () => {
  assert.deepEqual(lookupMailbox('基隆愛三路郵局第5號信箱'), {
    zipcode: '200900', source: 'mailbox', resolution: 'six-digit',
  });
  assert.equal(lookupMailbox('臺北市信義區市府路1號'), null);
});

test('browser loader builds a mailbox table and reports failed data requests', async () => {
  const mailbox = await loadMailbox({
    mailboxUrl: '/mailbox.tsv',
    fetch: async (url) => ({
      ok: true,
      status: 200,
      text: async () => readFileSync(dataPath(url.slice(1)), 'utf8'),
    }),
  });
  assert.ok(mailbox instanceof Mailbox);
  assert.equal(mailbox.find('基隆愛三路郵局第5號信箱'), '200900');

  await assert.rejects(
    loadMailbox({ mailboxUrl: '/mailbox.tsv', fetch: async () => ({ ok: false, status: 404 }) }),
    /HTTP 404/,
  );
  await assert.rejects(loadMailbox({ fetch: async () => ({ ok: true }) }), TypeError);
});

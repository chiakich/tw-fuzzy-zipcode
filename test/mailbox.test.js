import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getMailbox, findMailbox } from '../src/node.mjs';
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
  assert.ok(total > 1000, `expected over 1000 post offices, got ${total}`);
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

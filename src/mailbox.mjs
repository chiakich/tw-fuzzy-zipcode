// P.O. box addresses ('OO郵局第N號信箱') aren't door-number addresses, so they
// don't go through Directory/Address at all: the ZIP code is a straight
// lookup on the post office's name, not something door-number rules resolve.
// See scripts/pack_mailbox.py for where mailbox.tsv comes from.

import { PackedTable, normalize } from './zipcodetw.mjs';

/** @import { MailboxData, MailboxRecord, LoadMailboxOptions } from './mailbox.d.ts' */

// The box number never affects the ZIP code, but the English address has to
// carry it, so it is captured rather than skipped. '第' is sometimes dropped
// in practice ('OO郵局5號信箱'), so it is optional.
const MAILBOX_RE = /^(?<poName>.+?郵局)第?\s*(?<box>[0-9]+)\s*號信箱$/u;

const US = '\x1f';

// Callers that don't know which form an address is in run every door-number
// lookup through find() first, so the reject has to be cheaper than the
// trim/normalize/regex it guards. MAILBOX_RE demands the string end in 號信箱,
// which settles it by reading the tail — but only after skipping what trim()
// and normalize() would have removed there, or '第5號信箱，' would slip past.
const XIN = 0x4fe1, XIANG = 0x7bb1; // 信, 箱
const TRAILING = ' 　,，\t\n\r';

/**
 * @param {string} addrStr
 * @returns {boolean} false only when MAILBOX_RE certainly won't match
 */
function couldBeMailbox(addrStr) {
  let end = addrStr.length;
  while (end > 0 && TRAILING.includes(addrStr[end - 1])) end -= 1;
  return end >= 2
    && addrStr.charCodeAt(end - 1) === XIANG
    && addrStr.charCodeAt(end - 2) === XIN;
}

export class Mailbox {
  /** @param {MailboxData} data */
  constructor({ mailboxTsv }) {
    this.table = new PackedTable(mailboxTsv);
  }

  /**
   * Everything the packed row holds about this address, or `null` when it
   * isn't a P.O. box address or names an office with no box.
   *
   * @param {string} addrStr
   * @returns {MailboxRecord | null}
   */
  parse(addrStr) {
    if (!couldBeMailbox(addrStr)) return null;
    const match = normalize(addrStr.trim()).match(MAILBOX_RE);
    if (!match || !match.groups) return null;
    const entry = this.table.get(match.groups.poName);
    if (entry === undefined) return null;
    const [zipcode, postOffice, city] = entry.split(US);
    // The box number is passed through as written, leading zeros and all:
    // 第007號 is how the box is labelled, and the envelope should say the same.
    return { zipcode, box: match.groups.box, postOffice, city };
  }

  /**
   * @param {string} addrStr
   * @returns {string} 6-digit ZIP code, or '' if this isn't a recognized P.O. box address
   */
  find(addrStr) {
    return this.parse(addrStr)?.zipcode ?? '';
  }
}

/**
 * Fetches the packaged mailbox table and creates a browser-ready `Mailbox`.
 *
 * @param {Partial<LoadMailboxOptions>} [options]
 * @returns {Promise<Mailbox>}
 */
export async function loadMailbox({ mailboxUrl, fetch: fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('A fetch implementation is required to load mailbox data.');
  }
  if (typeof mailboxUrl !== 'string' || mailboxUrl === '') {
    throw new TypeError('mailboxUrl must be a non-empty string.');
  }
  const response = await fetchImpl(mailboxUrl);
  if (!response.ok) {
    throw new Error(`Could not load mailbox data from ${mailboxUrl} (HTTP ${response.status}).`);
  }
  return new Mailbox({ mailboxTsv: await response.text() });
}

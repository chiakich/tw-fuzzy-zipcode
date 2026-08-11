// The two address forms Chunghwa Post issues ZIP codes for — door-number
// addresses and P.O. boxes — resolved behind one pair of methods. Real
// user-supplied addresses arrive as a mix of both, so this is the entry point
// most callers want; `Directory` and `Mailbox` stay available underneath for
// callers that already know which form they hold.

import { Directory, loadDirectory } from './zipcodetw.mjs';
import { Mailbox, loadMailbox } from './mailbox.mjs';

/**
 * @import { LookupResult, DirectoryStorage } from './zipcodetw.d.ts'
 * @import { MailboxLookupResult } from './mailbox.d.ts'
 * @import { ZipcodeData, LoadZipcodeOptions } from './zipcode.d.ts'
 */

/**
 * The two halves are supplied independently, so the published `ZipcodeData` is
 * an intersection of two unions. Widening it once here beats narrowing it at
 * each of the six property reads below.
 *
 * @typedef {{
 *   gradualTsv?: string, preciseTsv?: string, mailboxTsv?: string,
 *   storage?: DirectoryStorage, directory?: Directory, mailbox?: Mailbox,
 * }} AnyZipcodeData
 */

export class Zipcode {
  // Either the raw tables or already-built instances; the latter lets a caller
  // that has loaded a `Directory` for its own reasons reuse it rather than
  // spend another 4.3MB.
  /** @param {ZipcodeData} data */
  constructor(data) {
    const { gradualTsv, preciseTsv, mailboxTsv, storage, directory, mailbox } =
      /** @type {AnyZipcodeData} */ (data);

    if (!directory && (typeof gradualTsv !== 'string' || typeof preciseTsv !== 'string')) {
      throw new TypeError('Zipcode needs either a directory or both gradualTsv and preciseTsv.');
    }
    if (!mailbox && typeof mailboxTsv !== 'string') {
      throw new TypeError('Zipcode needs either a mailbox or mailboxTsv.');
    }

    /** @type {Directory} */
    this.directory = directory ?? new Directory({
      gradualTsv: /** @type {string} */ (gradualTsv),
      preciseTsv: /** @type {string} */ (preciseTsv),
      storage,
    });
    /** @type {Mailbox} */
    this.mailbox = mailbox ?? new Mailbox({
      mailboxTsv: /** @type {string} */ (mailboxTsv),
    });
  }

  // The two forms don't overlap, and Mailbox.find() rejects a door-number
  // address by reading its tail, so leading with it costs the common case
  // ~1-2% rather than the ~11% the unguarded check used to.
  /**
   * @param {string} addrStr
   * @returns {string}
   */
  find(addrStr) {
    return this.mailbox.find(addrStr) || this.directory.find(addrStr);
  }

  /**
   * @param {string} addrStr
   * @returns {LookupResult | MailboxLookupResult | null}
   */
  lookup(addrStr) {
    return this.lookupMailbox(addrStr) ?? this.directory.lookup(addrStr);
  }

  /**
   * @param {string} addrStr
   * @returns {string}
   */
  findAddress(addrStr) {
    return this.directory.find(addrStr);
  }

  /**
   * @param {string} addrStr
   * @returns {LookupResult | null}
   */
  lookupAddress(addrStr) {
    return this.directory.lookup(addrStr);
  }

  /**
   * @param {string} addrStr
   * @returns {string}
   */
  findMailbox(addrStr) {
    return this.mailbox.find(addrStr);
  }

  // A post office name either matches the table or it doesn't, so there is no
  // partial resolution to report the way the door-number index has.
  /**
   * @param {string} addrStr
   * @returns {MailboxLookupResult | null}
   */
  lookupMailbox(addrStr) {
    const zipcode = this.mailbox.find(addrStr);
    return zipcode ? { zipcode, source: 'mailbox', resolution: 'six-digit' } : null;
  }
}

/**
 * Fetches all three packaged tables and creates a browser-ready `Zipcode`.
 * `mailboxUrl` is required: the table is 20KB against the door-number index's
 * 4.3MB, so making P.O. box support conditional would buy nothing and leave
 * `find()` meaning different things in different apps.
 *
 * @param {Partial<LoadZipcodeOptions>} [options]
 * @returns {Promise<Zipcode>}
 */
export async function loadZipcode({
  gradualUrl, preciseUrl, mailboxUrl, fetch: fetchImpl = globalThis.fetch,
} = {}) {
  const [directory, mailbox] = await Promise.all([
    loadDirectory({ gradualUrl, preciseUrl, fetch: fetchImpl }),
    loadMailbox({ mailboxUrl, fetch: fetchImpl }),
  ]);
  return new Zipcode({ directory, mailbox });
}

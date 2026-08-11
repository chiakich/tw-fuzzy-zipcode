// Node convenience loader — reads the prebuilt bundle from disk.
// Browser consumers should fetch the two .tsv files themselves and
// construct `Directory` from ./zipcodetw.mjs directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Directory } from './zipcodetw.mjs';
import { Translator, stripAddressPrefix } from './translate.mjs';
import { Mailbox } from './mailbox.mjs';
import { Zipcode } from './zipcode.mjs';

export { Directory } from './zipcodetw.mjs';
export { Translator, formatEnglish } from './translate.mjs';
export { Mailbox } from './mailbox.mjs';
export { Zipcode } from './zipcode.mjs';

/** @import { LookupResult } from './zipcodetw.d.ts' */
/** @import { MailboxLookupResult } from './mailbox.d.ts' */
/** @import { TranslateOptions, TranslationResult } from './translate.d.ts' */

/** @type {(name: string) => string} */
const dataPath = (name) =>
  fileURLToPath(new URL(`../data/${name}`, import.meta.url));

/** @type {Directory | undefined} */
let directory;

/** @returns {Directory} */
export function getDirectory() {
  if (!directory) {
    directory = new Directory({
      gradualTsv: readFileSync(dataPath('gradual.tsv'), 'utf8'),
      preciseTsv: readFileSync(dataPath('precise.tsv'), 'utf8'),
      // Server-side: spend the memory to keep hashed lookups.
      storage: 'map',
    });
  }
  return directory;
}

/** @type {Mailbox | undefined} */
let mailbox;

/** @returns {Mailbox} */
export function getMailbox() {
  if (!mailbox) {
    mailbox = new Mailbox({ mailboxTsv: readFileSync(dataPath('mailbox.tsv'), 'utf8') });
  }
  return mailbox;
}

/** @type {Zipcode | undefined} */
let zipcode;

// Composed from the two getters rather than from the files, so a caller that
// touches only `findAddress()` never loads the mailbox table, and one that
// mixes the entry points still holds a single copy of each index.
/** @returns {Zipcode} */
export function getZipcode() {
  if (!zipcode) {
    zipcode = new Zipcode({ directory: getDirectory(), mailbox: getMailbox() });
  }
  return zipcode;
}

// The functions below are the same six methods `Zipcode` exposes, bound to the
// bundled data. The dispatch itself lives in ./zipcode.mjs so this entry point
// and the browser one cannot drift apart.

/**
 * Returns the ZIP code for either a door-number address or a P.O. box
 * ('OO郵局第N號信箱') — the mix real, user-supplied addresses arrive in.
 * Empty when the address can't be resolved past a bare prefix.
 *
 * @param {string} addrStr
 * @returns {string}
 */
export function find(addrStr) {
  return getZipcode().find(addrStr);
}

/**
 * @param {string} addrStr
 * @returns {LookupResult | MailboxLookupResult | null}
 */
export function lookup(addrStr) {
  return getZipcode().lookup(addrStr);
}

/**
 * Door-number addresses only, skipping the P.O. box check. Returns a usable
 * 3- or 6-digit ZIP code; unresolved prefixes return an empty string.
 *
 * @param {string} addrStr
 * @returns {string}
 */
export function findAddress(addrStr) {
  return getDirectory().find(addrStr);
}

/**
 * @param {string} addrStr
 * @returns {LookupResult | null}
 */
export function lookupAddress(addrStr) {
  return getDirectory().lookup(addrStr);
}

/**
 * P.O. box addresses only. Returns the 6-digit ZIP code, or `''` if the
 * address isn't in that form or names a post office this doesn't recognize.
 *
 * @param {string} addrStr
 * @returns {string}
 */
export function findMailbox(addrStr) {
  return getMailbox().find(addrStr);
}

/**
 * @param {string} addrStr
 * @returns {MailboxLookupResult | null}
 */
export function lookupMailbox(addrStr) {
  return getZipcode().lookupMailbox(addrStr);
}

/** @type {Translator | undefined} */
let translator;

/** @returns {Translator} */
export function getTranslator() {
  if (!translator) {
    translator = new Translator({
      roadTsv: readFileSync(dataPath('road_en.tsv'), 'utf8'),
      districtTsv: readFileSync(dataPath('district_en.tsv'), 'utf8'),
      // This entry point loads the ZIP index anyway, so the cross-check is
      // free here and on by default; a bare `new Translator` leaves it off.
      verify: (address) => getDirectory().knowsRoad(address),
      mailbox: getMailbox(),
    });
  }
  return translator;
}

/**
 * Looks the ZIP code up as well, unless the caller supplies one. An address
 * that omits its city or district gets them back first, so '松江路100號'
 * translates as fully as the spelled-out form does.
 *
 * @param {string} addrStr
 * @param {TranslateOptions} [options]
 * @returns {TranslationResult}
 */
export function translate(addrStr, options = {}) {
  // A ZIP code already in front of the address would derail both lookups.
  const stripped = stripAddressPrefix(addrStr);

  // A box address carries its own ZIP and English, and canonicalize() would
  // read 基隆愛三路郵局 as a street; hand it straight to the translator.
  if (getMailbox().parse(stripped)) return getTranslator().translate(stripped, options);

  const directory = getDirectory();
  // canonicalAndFind() canonicalizes once for both the restored address text
  // and the ZIP lookup; skipped when the caller already supplies a ZIP code,
  // since canonical() alone is then all that's needed.
  const { canonical, zipcode } = options.zipcode != null
    ? { canonical: directory.canonical(stripped), zipcode: options.zipcode }
    : directory.canonicalAndFind(stripped);
  return getTranslator().translate(canonical, { ...options, zipcode });
}

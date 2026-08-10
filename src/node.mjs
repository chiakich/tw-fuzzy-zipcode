// Node convenience loader — reads the prebuilt bundle from disk.
// Browser consumers should fetch the two .tsv files themselves and
// construct `Directory` from ./zipcodetw.mjs directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Directory } from './zipcodetw.mjs';
import { Translator, stripAddressPrefix } from './translate.mjs';

export { Directory } from './zipcodetw.mjs';
export { Translator, formatEnglish } from './translate.mjs';

/** @import { LookupResult } from './zipcodetw.d.ts' */
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

/**
 * @param {string} addrStr
 * @returns {string}
 */
export function find(addrStr) {
  return getDirectory().find(addrStr);
}

/**
 * @param {string} addrStr
 * @returns {LookupResult | null}
 */
export function lookup(addrStr) {
  return getDirectory().lookup(addrStr);
}

/** @type {Translator | undefined} */
let translator;

/** @returns {Translator} */
export function getTranslator() {
  if (!translator) {
    translator = new Translator({
      roadTsv: readFileSync(dataPath('road_en.tsv'), 'utf8'),
      districtTsv: readFileSync(dataPath('district_en.tsv'), 'utf8'),
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
  const zipcode = options.zipcode ?? find(stripped);
  const canonical = getDirectory().canonical(stripped);
  return getTranslator().translate(canonical, { ...options, zipcode });
}

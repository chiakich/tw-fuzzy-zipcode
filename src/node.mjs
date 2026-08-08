// Node convenience loader — reads the prebuilt bundle from disk.
// Browser consumers should fetch the two .tsv files themselves and
// construct `Directory` from ./zipcodetw.mjs directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Directory } from './zipcodetw.mjs';

export { Directory } from './zipcodetw.mjs';

/** @import { LookupResult } from './zipcodetw.d.ts' */

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

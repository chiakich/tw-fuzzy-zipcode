// Node convenience loader — reads the prebuilt bundle from disk.
// Browser consumers should fetch the two .tsv files themselves and
// construct `Directory` from ./zipcodetw.mjs directly.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Directory } from './zipcodetw.mjs';

const dataPath = (name) =>
  fileURLToPath(new URL(`../data/${name}`, import.meta.url));

let directory;

export function getDirectory() {
  if (!directory) {
    directory = new Directory({
      gradualTsv: readFileSync(dataPath('gradual.tsv'), 'utf8'),
      preciseTsv: readFileSync(dataPath('precise.tsv'), 'utf8'),
    });
  }
  return directory;
}

export function find(addrStr) {
  return getDirectory().find(addrStr);
}

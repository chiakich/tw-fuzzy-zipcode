// Browser entry point — the counterpart to ./node.mjs. Nothing is read from
// disk here, so the caller fetches the packaged tables itself; `loadZipcode()`
// is the one-call version of that.
//
// Everything the individual modules export is re-exported, so `./browser` is
// a superset of them: import from here unless you want only one table's worth
// of code in the bundle, in which case reach for ./zipcodetw.mjs,
// ./mailbox.mjs or ./translate.mjs directly.

export { Zipcode, loadZipcode } from './zipcode.mjs';
export {
  Directory, loadDirectory, Address, Rule, PackedTable, normalize, tokenize,
} from './zipcodetw.mjs';
export { Mailbox, loadMailbox } from './mailbox.mjs';

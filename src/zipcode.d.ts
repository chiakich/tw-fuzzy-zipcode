import type { Directory, DirectoryStorage, LookupResult } from './zipcodetw.mjs';
import type { Mailbox, MailboxLookupResult } from './mailbox.mjs';

/** The door-number half: either the raw tables, or a directory already built. */
export type ZipcodeAddressSource =
  | { directory: Directory }
  | { gradualTsv: string; preciseTsv: string; storage?: DirectoryStorage };

/** The P.O. box half, on the same terms. */
export type ZipcodeMailboxSource =
  | { mailbox: Mailbox }
  | { mailboxTsv: string };

/** Each half is supplied independently, so all four combinations are valid. */
export type ZipcodeData = ZipcodeAddressSource & ZipcodeMailboxSource;

export interface LoadZipcodeOptions {
  gradualUrl: string;
  preciseUrl: string;
  mailboxUrl: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Both address forms behind one pair of methods. `find`/`lookup` accept
 * either; the `Address`/`Mailbox` suffixed pairs stay narrow for callers that
 * already know which form they hold and want to skip the other check.
 */
export declare class Zipcode {
  constructor(data: ZipcodeData);
  readonly directory: Directory;
  readonly mailbox: Mailbox;
  /** A door-number address or a P.O. box. Empty when unresolved. */
  find(address: string): string;
  /** The {@link find} counterpart that also reports source and resolution. */
  lookup(address: string): LookupResult | MailboxLookupResult | null;
  /** Door-number addresses only. */
  findAddress(address: string): string;
  /** The {@link findAddress} counterpart that also reports source and resolution. */
  lookupAddress(address: string): LookupResult | null;
  /** P.O. box addresses only. */
  findMailbox(address: string): string;
  /** The {@link findMailbox} counterpart that also reports source and resolution. */
  lookupMailbox(address: string): MailboxLookupResult | null;
}

/** Fetches all three packaged data files and creates a browser-ready `Zipcode`. */
export declare function loadZipcode(options: LoadZipcodeOptions): Promise<Zipcode>;

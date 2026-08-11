export interface MailboxData {
  mailboxTsv: string;
}

/**
 * The P.O. box counterpart to `LookupResult`. A post office name either
 * matches the table or it doesn't, so a hit is always a full 6-digit code.
 */
export interface MailboxLookupResult {
  zipcode: string;
  source: 'mailbox';
  resolution: 'six-digit';
}

export interface LoadMailboxOptions {
  mailboxUrl: string;
  fetch?: typeof globalThis.fetch;
}

/** One packed row, plus the box number read off the address. */
export interface MailboxRecord {
  zipcode: string;
  /** As written on the address, leading zeros kept: 第007號 is box `'007'`. */
  box: string;
  /** Official English name, without a 'Post Office' suffix: `'Keelung Ai 3rd Road'`. */
  postOffice: string;
  /** English county, from `district_en.tsv` rather than from the box listing. */
  city: string;
}

export declare class Mailbox {
  constructor(data: MailboxData);
  /** Returns the 6-digit ZIP code for a P.O. box address, or `''` if unrecognized. */
  find(address: string): string;
  /** Everything the row holds, or `null` when the address names no known box. */
  parse(address: string): MailboxRecord | null;
}

/** Fetches the packaged mailbox table and creates a browser-ready `Mailbox`. */
export declare function loadMailbox(options: LoadMailboxOptions): Promise<Mailbox>;

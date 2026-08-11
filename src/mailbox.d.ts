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

export declare class Mailbox {
  constructor(data: MailboxData);
  /** Returns the 6-digit ZIP code for a P.O. box address, or `''` if unrecognized. */
  find(address: string): string;
}

/** Fetches the packaged mailbox table and creates a browser-ready `Mailbox`. */
export declare function loadMailbox(options: LoadMailboxOptions): Promise<Mailbox>;

export interface MailboxData {
  mailboxTsv: string;
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

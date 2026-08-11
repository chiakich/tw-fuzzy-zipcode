import type { Directory, LookupResult } from './zipcodetw.mjs';
import type { Translator, TranslateOptions, TranslationResult } from './translate.mjs';
import type { Mailbox, MailboxLookupResult } from './mailbox.mjs';
import type { Zipcode } from './zipcode.mjs';

export { Directory } from './zipcodetw.mjs';
export type { LookupResult, LookupResolution, LookupSource } from './zipcodetw.mjs';
export { Translator, formatEnglish } from './translate.mjs';
export type {
  TranslateOptions, TranslationResult, TranslationParts,
} from './translate.mjs';
export { Mailbox } from './mailbox.mjs';
export type { MailboxLookupResult } from './mailbox.mjs';
export { Zipcode } from './zipcode.mjs';
export type { ZipcodeData, LoadZipcodeOptions } from './zipcode.mjs';

/**
 * Returns the ZIP code for either a door-number address or a P.O. box —
 * the entry point for real, user-supplied addresses. Empty when unresolved.
 */
export declare function find(address: string): string;
/** The {@link find} counterpart that also reports source and resolution, or `null` when unmatched. */
export declare function lookup(address: string): LookupResult | MailboxLookupResult | null;
/** Door-number addresses only. Returns a usable 3- or 6-digit ZIP code, else an empty string. */
export declare function findAddress(address: string): string;
/** The {@link findAddress} counterpart that also reports source and resolution. */
export declare function lookupAddress(address: string): LookupResult | null;
/** P.O. box addresses only. Returns a 6-digit ZIP code, or `''` if unrecognized. */
export declare function findMailbox(address: string): string;
/** The {@link findMailbox} counterpart that also reports source and resolution. */
export declare function lookupMailbox(address: string): MailboxLookupResult | null;
/** Lazily loads and returns the directory bundled with this package. */
export declare function getDirectory(): Directory;
/** Lazily loads and returns the mailbox table bundled with this package. */
export declare function getMailbox(): Mailbox;
/** Lazily composes the two into the `Zipcode` the bare functions above delegate to. */
export declare function getZipcode(): Zipcode;
/** Lazily loads and returns the translator bundled with this package. */
export declare function getTranslator(): Translator;
/** Translates the address to English, filling in the ZIP code unless one is given. */
export declare function translate(address: string, options?: TranslateOptions): TranslationResult;

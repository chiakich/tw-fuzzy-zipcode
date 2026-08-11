import type { Mailbox } from './mailbox.mjs';

/** English address fields, already formatted ('No. 1-2', 'Sec. 3', 'Xinyi Dist.'). */
export interface TranslationParts {
  city?: string;
  district?: string;
  /** Village names have no official translation; passed through in Chinese. */
  village?: string;
  neighborhood?: string;
  road?: string;
  section?: string;
  lane?: string;
  alley?: string;
  subAlley?: string;
  number?: string;
  floor?: string;
  room?: string;
  /** Present only when a ZIP code was supplied to `translate()`. */
  zipcode?: string;
  /** P.O. box addresses only: `'P.O. Box 5'`. */
  poBox?: string;
  /** P.O. box addresses only: `'Keelung Ai 3rd Road'`. */
  postOffice?: string;
}

export interface TranslationResult {
  /**
   * The one-line English address, Chunghwa Post order — or `''` unless the
   * translation is `complete`, the same bargain `Directory.find()` makes.
   */
  english: string;
  parts: TranslationParts;
  /** Chinese names left as-is because no official translation exists. */
  untranslated: string[];
  /**
   * Whether `english` is a fully translated address anchored to its
   * county/city (`untranslated` is empty and `parts.city` is set).
   */
  complete: boolean;
}

export interface TranslateOptions {
  /** Appended to the city, e.g. `'Taipei City 110204'`. */
  zipcode?: string;
  /** Trailing country line; pass `null` to omit it. Defaults to `'Taiwan (R.O.C.)'`. */
  country?: string | null;
}

/**
 * Second opinion on whether an address's road exists where it says it does.
 * The bilingual tables carry no location, so a road from another city still
 * translates; pass `Directory.knowsRoad` to catch that. Returning `false`
 * empties `english` and makes `complete` false.
 */
export type VerifyAddress = (address: string) => boolean;

export interface TranslationData {
  roadTsv: string;
  districtTsv: string;
  /** Off by default: without it a translation is never rejected on location. */
  verify?: VerifyAddress | null;
  /**
   * Off by default. With it, a P.O. box address translates from the box
   * table's own English instead of falling through the road tables, which
   * would read 基隆愛三路郵局 as a street called 愛三路.
   */
  mailbox?: Mailbox | null;
}

export interface LoadTranslatorOptions {
  roadUrl: string;
  districtUrl: string;
  verify?: VerifyAddress | null;
  mailbox?: Mailbox | null;
  fetch?: typeof globalThis.fetch;
}

export declare class Translator {
  constructor(data: TranslationData);
  translate(address: string, options?: TranslateOptions): TranslationResult;
}

/** Joins already-translated parts into one line; exposed for custom layouts. */
export declare function formatEnglish(parts: TranslationParts, country?: string | null): string;

/** Fetches both packaged bilingual files and creates a browser-ready translator. */
export declare function loadTranslator(options: LoadTranslatorOptions): Promise<Translator>;

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
}

export interface TranslationResult {
  /** The one-line English address, Chunghwa Post order. */
  english: string;
  parts: TranslationParts;
  /** Chinese names left as-is because no official translation exists. */
  untranslated: string[];
  /** Whether every recognized name was translated (`untranslated` is empty). */
  complete: boolean;
}

export interface TranslateOptions {
  /** Appended to the city, e.g. `'Taipei City 110204'`. */
  zipcode?: string;
  /** Trailing country line; pass `null` to omit it. Defaults to `'Taiwan (R.O.C.)'`. */
  country?: string | null;
}

export interface TranslationData {
  roadTsv: string;
  districtTsv: string;
}

export interface LoadTranslatorOptions {
  roadUrl: string;
  districtUrl: string;
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

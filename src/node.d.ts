import type { Directory, LookupResult } from './zipcodetw.mjs';
import type { Translator, TranslateOptions, TranslationResult } from './translate.mjs';

export { Directory } from './zipcodetw.mjs';
export type { LookupResult, LookupResolution, LookupSource } from './zipcodetw.mjs';
export { Translator, formatEnglish } from './translate.mjs';
export type {
  TranslateOptions, TranslationResult, TranslationParts,
} from './translate.mjs';

/** Lazily loads and returns the directory bundled with this package. */
export declare function getDirectory(): Directory;
/** Returns only a usable 3- or 6-digit ZIP code; unresolved prefixes return an empty string. */
export declare function find(address: string): string;
/** Returns the ZIP code together with its source and resolution, or `null` when no match is found. */
export declare function lookup(address: string): LookupResult | null;
/** Lazily loads and returns the translator bundled with this package. */
export declare function getTranslator(): Translator;
/** Translates the address to English, filling in the ZIP code unless one is given. */
export declare function translate(address: string, options?: TranslateOptions): TranslationResult;

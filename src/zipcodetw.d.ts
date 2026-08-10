export type AddressToken = [number: string, subnumber: string, name: string, unit: string];

export type LookupSource = 'precise' | 'gradual';

export type LookupResolution = 'six-digit' | 'three-digit' | 'prefix';

export interface LookupResult {
  /** A 6-digit ZIP code, a 3-digit ZIP code, or a 1-/2-digit prefix when resolution is `prefix`. */
  zipcode: string;
  source: LookupSource;
  resolution: LookupResolution;
}

/**
 * `packed` (the default) flattens the tables into one string plus offset arrays
 * and binary-searches them: ~4x less memory, slower per probe. `map` keeps hashed
 * Maps for throughput. Prefer `packed` in a browser, `map` on a busy server.
 */
export type DirectoryStorage = 'packed' | 'map';

export interface DirectoryData {
  gradualTsv: string;
  preciseTsv: string;
  storage?: DirectoryStorage;
}

/** Backing store for the two packed tables; selected by {@link DirectoryStorage}. */
export interface Store {
  gradualGet(key: string): string | undefined;
  preciseHas(key: string): boolean;
  preciseKeys(): Iterable<string>;
  preciseRules(key: string): [ruleStr: string, zipcode: string][];
}

export interface LoadDirectoryOptions {
  gradualUrl: string;
  preciseUrl: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Sorted key/value rows flattened into one string plus offset arrays, binary
 * searched in place. Shared internals for ./translate.mjs, not part of the
 * lookup API.
 */
export declare class PackedTable {
  constructor(tsv: string);
  readonly count: number;
  get(key: string): string | undefined;
  indexOf(key: string): number;
  keys(): IterableIterator<string>;
}

export declare function normalize(address: string): string;
export declare function tokenize(address: string): AddressToken[];

export declare class Address {
  constructor(address: string);
  tokens: AddressToken[];
  flat(...indexes: number[]): string;
  pickToFlat(...indexes: number[]): string;
  parse(index: number): [number, number];
}

export declare class Rule extends Address {
  constructor(rule: string);
  match(address: Address): boolean;
}

export declare class Directory {
  constructor(data: DirectoryData);
  lookup(address: string): LookupResult | null;
  /** Returns only a usable 3- or 6-digit ZIP code; unresolved prefixes return an empty string. */
  find(address: string): string;
  /** Restores an omitted county/city or district when the address names only one place. */
  canonical(address: string): string;
}

/** Fetches both packaged data files and creates a browser-ready directory. */
export declare function loadDirectory(options: LoadDirectoryOptions): Promise<Directory>;

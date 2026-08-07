export type AddressToken = [number: string, subnumber: string, name: string, unit: string];

export type LookupSource = 'precise' | 'gradual';

export type LookupResolution = 'six-digit' | 'three-digit' | 'prefix';

export interface LookupResult {
  /** A 6-digit ZIP code, a 3-digit ZIP code, or a 1-/2-digit prefix when resolution is `prefix`. */
  zipcode: string;
  source: LookupSource;
  resolution: LookupResolution;
}

export interface DirectoryData {
  gradualTsv: string;
  preciseTsv: string;
}

export interface LoadDirectoryOptions {
  gradualUrl: string;
  preciseUrl: string;
  fetch?: typeof globalThis.fetch;
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
}

/** Fetches both packaged data files and creates a browser-ready directory. */
export declare function loadDirectory(options: LoadDirectoryOptions): Promise<Directory>;

import { find, getDirectory, lookup, translate } from 'tw-fuzzy-zipcode';
import { Directory, loadDirectory } from 'tw-fuzzy-zipcode/browser';
import { Translator, loadTranslator } from 'tw-fuzzy-zipcode/translate';

const zipcode: string = find('臺北市信義區市府路1號');
const directory: Directory = getDirectory();
const match = lookup('臺北市');

if (match !== null) {
  const source: 'precise' | 'gradual' = match.source;
  const resolution: 'six-digit' | 'three-digit' | 'prefix' = match.resolution;
  const code: string = match.zipcode;
  void source;
  void resolution;
  void code;
}

const browserDirectory: Promise<Directory> = loadDirectory({
  gradualUrl: '/data/gradual.tsv',
  preciseUrl: '/data/precise.tsv',
});

const translation = translate('臺北市信義區市府路1號', { country: null });
const english: string = translation.english;
const road: string | undefined = translation.parts.road;
const untranslated: string[] = translation.untranslated;
const complete: boolean = translation.complete;

const browserTranslator: Promise<Translator> = loadTranslator({
  roadUrl: '/data/road_en.tsv',
  districtUrl: '/data/district_en.tsv',
});

void zipcode;
void directory;
void browserDirectory;
void english;
void road;
void untranslated;
void complete;
void browserTranslator;

// @ts-expect-error Address input must be a string.
find(110204);

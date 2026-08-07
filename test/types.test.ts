import { find, getDirectory, lookup } from 'tw-fuzzy-zipcode';
import { Directory, loadDirectory } from 'tw-fuzzy-zipcode/browser';

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

void zipcode;
void directory;
void browserDirectory;

// @ts-expect-error Address input must be a string.
find(110204);

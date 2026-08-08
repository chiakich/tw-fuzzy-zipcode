// Benchmark for docs/benchmark.md. Run with:
//   node --expose-gc scripts/bench.mjs
//
// Each storage backend is measured in its own child process. Sharing one
// process makes the memory numbers meaningless: the first directory is still
// reachable when the second one's baseline is taken, so its later collection
// shows up as a negative delta for whichever backend ran second.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { Directory } from '../src/zipcodetw.mjs';

const STORAGES = ['map', 'packed'];

// A spread of shapes: full addresses, 台/臺 variants, 段 tokens, and the
// abbreviated forms canonicalize() has to repair.
const QUERIES = [
  '臺北市信義區市府路1號',
  '台北市信義區市府路45號',
  '新北市板橋區中山路一段161號',
  '高雄市苓雅區四維三路2號',
  '台中市西屯區台灣大道三段99號',
  '桃園市中壢區中大路300號',
  '信義區市府路1號',
  '花蓮縣花蓮市府前路17號',
];

const dataPath = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));
const fmt = (n, digits = 0) => n.toLocaleString('en-US', {
  minimumFractionDigits: digits, maximumFractionDigits: digits,
});

/** One backend, alone in this process. */
function measure(storage) {
  const tsv = {
    gradualTsv: readFileSync(dataPath('gradual.tsv'), 'utf8'),
    preciseTsv: readFileSync(dataPath('precise.tsv'), 'utf8'),
  };
  const settle = () => { global.gc?.(); global.gc?.(); };
  // heapUsed excludes typed-array backing stores, which is where the packed
  // store's offset arrays live, so it alone understates them by ~1.7MB.
  const footprint = () => {
    settle();
    const m = process.memoryUsage();
    return m.heapUsed + m.arrayBuffers;
  };

  const before = footprint();
  const startedBuild = performance.now();
  const dir = new Directory({ ...tsv, storage });
  const build = performance.now() - startedBuild;
  const steady = footprint() - before;
  const buildPeak = process.resourceUsage().maxRSS / 1024;

  const opsPerSec = (fn, warmup = 3000, iterations = 20000) => {
    for (let i = 0; i < warmup; i++) fn();
    const started = performance.now();
    for (let i = 0; i < iterations; i++) fn();
    return iterations / ((performance.now() - started) / 1000);
  };

  let n = 0;
  const find = opsPerSec(() => { dir.find(QUERIES[n++ % QUERIES.length]); });
  n = 0;
  const lookup = opsPerSec(() => { dir.lookup(QUERIES[n++ % QUERIES.length]); });

  return { storage, build, steady, buildPeak, find, lookup };
}

const requested = process.argv[2];
if (requested) {
  process.stdout.write(JSON.stringify(measure(requested)));
} else {
  if (typeof global.gc !== 'function') {
    console.error('warning: re-run with --expose-gc for meaningful memory numbers\n');
  }
  const self = fileURLToPath(import.meta.url);
  const results = STORAGES.map((storage) => JSON.parse(
    execFileSync(process.execPath, ['--expose-gc', self, storage], { encoding: 'utf8' }),
  ));

  console.log(`node ${process.version} · ${os.cpus()[0].model} · ${os.cpus().length} cores`);
  console.log('each backend measured in its own process\n');
  console.log('storage   build     steady mem   peak RSS   find()          lookup()');
  for (const r of results) {
    console.log(
      r.storage.padEnd(10) +
      (fmt(r.build) + 'ms').padEnd(10) +
      (fmt(r.steady / 1e6, 2) + 'MB').padEnd(13) +
      (fmt(r.buildPeak) + 'MB').padEnd(11) +
      (fmt(r.find) + ' ops/s').padEnd(16) +
      fmt(r.lookup) + ' ops/s',
    );
  }
}

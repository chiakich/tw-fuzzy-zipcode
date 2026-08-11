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
import { Mailbox } from '../src/mailbox.mjs';
import { Zipcode } from '../src/zipcode.mjs';

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

/**
 * One backend, alone in this process. `mode` selects which call is timed;
 * only the `index` run reports build time and memory.
 */
function measure(storage, mode) {
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

  // Median of three timed rounds. A single round strays far enough on a busy
  // machine to invert the comparison below — one run had packed findAddress()
  // at 324k against its own 490k a minute earlier.
  const opsPerSec = (fn, warmup = 3000, iterations = 20000, rounds = 3) => {
    for (let i = 0; i < warmup; i++) fn();
    const rates = [];
    for (let round = 0; round < rounds; round++) {
      const started = performance.now();
      for (let i = 0; i < iterations; i++) fn();
      rates.push(iterations / ((performance.now() - started) / 1000));
    }
    return rates.sort((a, b) => a - b)[rates.length >> 1];
  };

  // Whichever call this process was spawned to time runs first, before any
  // other hot loop has taught the JIT about the shared code underneath it.
  // Timing them one after another in a single process credits the later ones
  // with the earlier ones' warm-up — enough to make the composite, which does
  // strictly more work, come out ahead of the call it wraps.
  let n = 0;
  if (mode === 'composite') {
    // What the P.O. box check costs the addresses that never need it. QUERIES
    // is all door-number, so this is the worst case: find() pays for the check
    // on every call and is never the one that answers.
    const zip = new Zipcode({
      directory: dir,
      mailbox: new Mailbox({ mailboxTsv: readFileSync(dataPath('mailbox.tsv'), 'utf8') }),
    });
    const composite = opsPerSec(() => { zip.find(QUERIES[n++ % QUERIES.length]); });
    return { storage, composite };
  }

  const find = opsPerSec(() => { dir.find(QUERIES[n++ % QUERIES.length]); });
  n = 0;
  const lookup = opsPerSec(() => { dir.lookup(QUERIES[n++ % QUERIES.length]); });

  return { storage, build, steady, buildPeak, find, lookup };
}

const requested = process.argv[2];
if (requested) {
  process.stdout.write(JSON.stringify(measure(requested, process.argv[3])));
} else {
  if (typeof global.gc !== 'function') {
    console.error('warning: re-run with --expose-gc for meaningful memory numbers\n');
  }
  const self = fileURLToPath(import.meta.url);
  const run = (storage, mode) => JSON.parse(execFileSync(
    process.execPath, ['--expose-gc', self, storage, mode], { encoding: 'utf8' },
  ));
  const results = STORAGES.map((storage) => ({
    ...run(storage, 'index'),
    ...run(storage, 'composite'),
  }));

  console.log(`node ${process.version} · ${os.cpus()[0].model} · ${os.cpus().length} cores`);
  console.log('each backend measured in its own process\n');
  console.log('storage   build     steady mem   peak RSS   findAddress()   lookupAddress()  find()');
  for (const r of results) {
    const overhead = ((r.composite / r.find - 1) * 100).toFixed(1);
    console.log(
      r.storage.padEnd(10) +
      (fmt(r.build) + 'ms').padEnd(10) +
      (fmt(r.steady / 1e6, 2) + 'MB').padEnd(13) +
      (fmt(r.buildPeak) + 'MB').padEnd(11) +
      (fmt(r.find) + ' ops/s').padEnd(16) +
      (fmt(r.lookup) + ' ops/s').padEnd(17) +
      `${fmt(r.composite)} ops/s (${overhead}%)`,
    );
  }
}

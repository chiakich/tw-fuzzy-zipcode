# Benchmark

Numbers below were produced by [`scripts/bench.mjs`](../scripts/bench.mjs):

```bash
npm run bench
```

`--expose-gc` matters. Without it the memory figures include whatever the
collector has not got around to yet.

Environment: Node v22.16.0, Apple M3 Pro (12 cores). Dataset: 中華郵政 3+3
郵遞區號, 162,470 gradual rows and 44,635 precise rows holding 79,845 rules.

## Results

Each backend is measured in its own process — see [Methodology](#methodology).

| storage | build | steady memory | peak RSS | `find()` | `lookup()` |
| --- | --- | --- | --- | --- | --- |
| `map` (Node default) | 66 ms | 21.50 MB | 123 MB | 517,974 ops/s | 557,462 ops/s |
| `packed` (browser default) | 36 ms | 5.30 MB | 77 MB | 461,440 ops/s | 453,961 ops/s |

Both answer identically; the test suite replays 90,950 queries through each and
asserts zero divergence. They differ only in how the two tables are held:

- **`map`** keeps hashed `Map`s. Fastest probes, highest footprint.
- **`packed`** flattens the sorted rows into one string per column plus
  `Int32Array` offsets, and binary-searches them. 4x less memory for ~11% fewer
  queries per second.

`src/node.mjs` selects `map`; `loadDirectory()` and a bare `new Directory()`
default to `packed`. Override explicitly if the default is wrong for your case:

```js
new Directory({ gradualTsv, preciseTsv, storage: 'map' })
```

Rules of thumb: a browser session runs a handful of queries and cares about
footprint, so `packed` wins. A busy server has the headroom and wants the
throughput, so `map` wins.

### Reading the memory numbers

`process.memoryUsage().heapUsed` **excludes typed-array backing stores**, which
is exactly where `packed` keeps its offset arrays. Measured that way it reports
3.65 MB and understates the real cost by the 1.66 MB of offsets. The table adds
`heapUsed + arrayBuffers`, giving 5.30 MB.

Peak RSS is the transient high-water mark for the whole process during
construction, not steady state. It is the number that decides whether a low-end
mobile browser survives loading the directory at all. Roughly 39 MB of it is
bare Node before any of this package is loaded, and a further ~13 MB is the
4.3 MB of source text held as UTF-16; the rest is decoding churn. Treat it as
comparable between the two rows, not as an absolute cost of the directory.

## Accuracy

For a fuzzy matcher this matters more than throughput, and it is the axis a
speed-only benchmark hides.

`test/fixtures/golden_find.tsv` holds 90,950 queries stride-sampled across the
full dataset, each labelled with the answer from the upstream Python
[moskytw/zipcodetw](https://github.com/moskytw/zipcodetw), plus manual edge
cases.

| outcome | count | share |
| --- | --- | --- |
| identical to the reference | 90,596 | 99.61% |
| refined (reference coarse, we resolve further) | 354 | 0.39% |
| **contradicts the reference** | **0** | **0%** |

"Refined" is not a disagreement. `canonicalize()` repairs abbreviated forms the
reference leaves unresolved — `松江路100號` yields `104091` where the reference
stops at a 3-digit answer. The suite therefore asserts a one-way property: we
may only ever *extend* a reference answer, never contradict one.

1,124 of the exact matches are queries where both correctly return nothing
(ambiguous input such as `臺北市中華路二段`, which spans 中正區 and 萬華區).

## Comparison with `@simoko/tw-zip`

[`tw-zip`](https://github.com/supra126/tw-zip) publishes its own benchmark. Most
of its figures are **not comparable to these**, and it is worth being precise
about why rather than putting the two tables side by side.

`tw-zip` takes address *fields* that are already split — city, district, road —
and hashes them. Its 10–23M ops/sec numbers are hash-map lookups on structured
input. This package takes one unsplit string and has to tokenize, normalize, and
match rules against it. Different problems; the throughput figures do not mean
the same thing.

The one genuinely comparable path is `tw-zip`'s road-name search:

| scenario | `tw-zip` | this package |
| --- | --- | --- |
| no city/district given | ~1,200 ops/s | ~461,000 ops/s |
| city given | ~52,000 ops/s | ~461,000 ops/s |
| city + district given | ~650,000 ops/s | ~461,000 ops/s |

Our figure does not move because scoping is not something the caller does — the
address string is parsed as-is. `tw-zip`'s own documentation stresses narrowing
by city/district, which is precisely the information a pasted address has not
been split into yet.

So: this package is far faster on unstructured input and slower once the caller
has already done the splitting. That matches the guidance in the README — if
your data is already in separate fields, prefer `tw-zip`.

Not measured here: `tw-zip` can ship a ~5 KB 3-digit-only bundle. This package
always needs its full tables (1.2 MB gzipped), which is a real disadvantage for
a browser that only needs 3-digit resolution.

## Methodology

- Both backends run in **separate child processes**. Measuring them in one
  process makes the memory numbers meaningless: the first directory is still
  reachable when the second one's baseline is taken, so its later collection
  shows up as a *negative* delta for whichever ran second.
- 3,000 warmup iterations, then 20,000 measured, over 8 queries spanning full
  addresses, `台`/`臺` variants, `段` tokens, and abbreviated forms that exercise
  `canonicalize()`.
- Memory is sampled after two forced GCs.
- Peak RSS is `process.resourceUsage().maxRSS`, captured immediately after
  construction and before the query loop.

Caveats worth stating: this is a single-machine, single-run measurement on an
M3 Pro. Throughput varies by a few percent between runs, and the query mix is
deliberately favourable in one respect — all 8 addresses resolve. A workload of
mostly unresolvable junk would spend more time walking prefixes.

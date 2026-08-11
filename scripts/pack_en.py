#!/usr/bin/env python3
"""Build data/road_en.tsv and data/district_en.tsv from the Chunghwa Post
bilingual open data files.

Sources (政府資料開放授權條款-第1版):

    data/road_en.txt     中華郵政路街中英對照文字檔 (Big5, HKSCS extensions)
                         https://data.gov.tw/dataset/152276
                         The dataset's .ods rendering is truncated on four
                         entries ('Taiyuan' for 'Taiyuan S. 2nd St.'), so the
                         .TXT download is the source of record here.
    data/county_en.xml   縣市鄉鎮中英對照檔
                         https://data.gov.tw/dataset/5949
    data/village_en.csv  村里中英對照檔
                         https://www.post.gov.tw/post/internet/Postal/village.txt

All three are romanized with Hanyu Pinyin, per the Ministry of Education's
中文譯音使用原則. The village file carries 6,977 names the road file lacks,
mostly 村/里 and named lanes. Where the two disagree (109 names) the road file
wins: it is the newer of the two, and the older spellings it replaces are
pre-Hanyu ('Niausong Ln.' against the road file's 'Niaosong Ln.').

Keys are normalized with the *same* rules as src/zipcodetw.mjs `normalize()`,
because lookups happen on tokens that have already been through it — an
unnormalized '一心一路' key would never be hit by a query for '一心1路'.
test/translate.test.js asserts every packed key is a fixed point of the JS
normalize(), which is what keeps this port and that one from drifting.

Unlike pack.py this needs no third-party package, only the stdlib.

Usage:
    python3 scripts/pack_en.py [data_dir]
"""
import csv
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

# Ported from src/zipcodetw.mjs; keep the two in lockstep.
TO_REPLACE_MAP = {
    '-': '之', '~': '之', '台': '臺',
    '１': '1', '２': '2', '３': '3', '４': '4', '５': '5',
    '６': '6', '７': '7', '８': '8', '９': '9', '０': '0',
    '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
    '六': '6', '七': '7', '八': '8', '九': '9',
}
CHINESE_NUMERALS = set('一二三四五六七八九十')
TO_REPLACE_RE = re.compile(
    '[ 　,，台~-]|[０-９]|[一二三四五六七八九]?十?[一二三四五六七八九](?=[段路街巷弄號樓])')


def normalize(s):
    def sub(m):
        found = m.group()
        if found in TO_REPLACE_MAP:
            return TO_REPLACE_MAP[found]
        if found[0] in CHINESE_NUMERALS:
            if len(found) == 2:      # 十X -> 1X
                return '1' + TO_REPLACE_MAP.get(found[1], '')
            if len(found) == 3:      # X十Y -> XY
                return TO_REPLACE_MAP.get(found[0], '') + TO_REPLACE_MAP.get(found[2], '')
        return ''
    return TO_REPLACE_RE.sub(sub, s)


def front_code(keys):
    prev = ''
    for k in keys:
        i, m = 0, min(len(k), len(prev))
        while i < m and k[i] == prev[i]:
            i += 1
        yield i, k[i:]
        prev = k


def write_table(path, mapping):
    keys = sorted(mapping)
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(
            '%s\t%s\t%s' % (format(n, 'x'), rest, mapping[k])
            for (n, rest), k in zip(front_code(keys), keys)))
    return len(keys)


DIGIT_RUN_RE = re.compile(r'\d+')


def agrees_with_key(key, en):
    """Whether an English name's numbers match the normalized key's.

    normalize() is lossy on stacked numerals — '二一街' and '十一街' both become
    '11街' — so a handful of road names share a key. The input side collapses
    the same way (a query for '大源二一街' also looks up '大源11街', and gets
    11th's ZIP code), so the translation that belongs on the key is the one
    whose digits survive the collapse: 'Dayuan 11th St.', not 'Dayuan 21st St.'
    """
    return DIGIT_RUN_RE.findall(key) == DIGIT_RUN_RE.findall(en)


def collect(pairs, what):
    """Normalize keys, dropping rows that carry no translation and resolving
    any Chinese name that normalizes onto another with a different English."""
    out, dropped, conflicts = {}, 0, 0
    for zh, en in pairs:
        # Some values carry doubled spaces from the source export.
        zh, en = zh.strip(), ' '.join(en.split())
        if not zh or not en:
            dropped += 1
            continue
        key = normalize(zh)
        if not key:
            dropped += 1
            continue
        kept = out.get(key)
        if kept is not None and kept != en:
            conflicts += 1
            # Whichever agrees with the key wins; neither agreeing (or both)
            # keeps the first, which is the sorted-order incumbent.
            if not (agrees_with_key(key, en) and not agrees_with_key(key, kept)):
                continue
            print('  ! %s %s: %r over %r' % (what, key, en, kept), file=sys.stderr)
        out[key] = en
    if conflicts:
        print('  %s: resolved %d key collision(s)' % (what, conflicts))
    if dropped:
        print('  %s: skipped %d incomplete row(s)' % (what, dropped))
    return out


def read_road_txt(path):
    # Big5 with HKSCS extensions: a handful of rare characters (口𠽨磜) fail
    # to decode as plain Big5.
    with open(path, encoding='big5hkscs', newline='') as f:
        for row in csv.reader(f):
            if len(row) >= 2:
                yield row[0], row[1]


def read_extra_tsv(path):
    if not path.exists():
        return
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            zh, _, en = line.rstrip('\n').partition('\t')
            yield zh, en


def read_village_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        for row in csv.reader(f):
            if len(row) >= 2:
                yield row[0], row[1]


def read_county_xml(path):
    for record in ET.parse(path).getroot():
        fields = [(e.text or '') for e in record]
        if len(fields) >= 3:
            yield fields[1], fields[2]   # 中文縣市鄉鎮, English


def build(data_dir):
    data_dir = Path(data_dir)

    roads = collect(
        ((zh, en) for zh, en in read_road_txt(data_dir / 'road_en.txt')
         if zh != '中文街路名稱'),   # header row
        'road')

    # Hand-maintained, so it outranks both official files.
    extra = collect(read_extra_tsv(data_dir / 'road_en_extra.tsv'), 'override')
    roads.update(extra)
    print('  overrides applied: %d' % len(extra))

    villages = collect(read_village_csv(data_dir / 'village_en.csv'), 'village')
    added = 0
    for zh, en in villages.items():
        if zh not in roads:
            roads[zh] = en
            added += 1
    print('  village file added %d name(s), %d already covered'
          % (added, len(villages) - added))

    # '臺北市中正區' -> 'Zhongzheng Dist., Taipei City'. The city half is the
    # last comma-separated piece, which is how the city-only table is derived
    # rather than transcribed by hand.
    districts, cities = {}, {}
    for zh, en in read_county_xml(data_dir / 'county_en.xml'):
        districts[zh] = en
        city_zh = re.match(r'.+?[縣市]', zh)
        city_en = en.rsplit(', ', 1)[-1]
        if city_zh:
            cities.setdefault(city_zh.group(), city_en)
    districts = collect(districts.items(), 'district')
    cities = collect(cities.items(), 'city')

    # One table: a district key always contains its city name as a prefix, so
    # the two never collide and the reader needs only a single lookup path.
    places = dict(districts)
    for k, v in cities.items():
        places.setdefault(k, v)

    n_roads = write_table(data_dir / 'road_en.tsv', roads)
    n_places = write_table(data_dir / 'district_en.tsv', places)
    print('road keys: %d, place keys: %d (%d cities, %d districts)'
          % (n_roads, n_places, len(cities), len(districts)))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'data')

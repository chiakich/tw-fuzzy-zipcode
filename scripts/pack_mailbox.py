#!/usr/bin/env python3
"""Build data/mailbox.tsv from Chunghwa Post's open P.O. box directory.

Source (政府資料開放授權條款-第1版):

    data/mailbox.csv      郵局專用信箱一覽表
                          https://data.gov.tw/dataset/27770
                          Updated daily by Chunghwa Post; re-download to refresh.

    data/mailbox_en.csv   English office names, scraped by
                          scripts/fetch_mailbox_en.py — see there for why the
                          English in mailbox.csv is not usable as it stands.

Maps each post office's Chinese name (局名) to its box's 6-digit ZIP code
(六碼郵遞區號), its English name, and its county's English name, joined by
U+001F. Two kinds of row are dropped:

  * no 6-digit code to key on, and
  * 信箱中文名稱 is '尚未開辦信箱' — the office is listed and has been assigned
    a code, but no box is open there. 314 of those carry a 6-digit code all the
    same, so keying on the code alone would answer '左營華夏路郵局第5號信箱'
    with a deliverable-looking ZIP for an address that cannot receive mail.
    They are also exactly the rows whose 信箱英文名稱 is blank, which is the
    same fact from the other side: there is no box, so there is nothing to
    write on it.

Keys are normalized the same way as scripts/pack_en.py, for the same reason:
lookups happen on tokens already run through src/zipcodetw.mjs `normalize()`.

Usage:
    python3 scripts/pack_mailbox.py [data_dir]
"""
import csv
import re
import sys
from pathlib import Path

# Field separator inside a packed value, matching scripts/pack.py.
US = '\x1f'

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


def read_mailbox_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f)


def read_front_coded(path):
    """Undo write_table()'s front coding: {key: value}."""
    table, prev = {}, ''
    for line in path.read_text(encoding='utf-8').split('\n'):
        shared, rest, value = line.split('\t', 2)
        key = prev[:int(shared, 16)] + rest
        table[key] = value
        prev = key
    return table


def read_english(data_dir):
    """{局名: (English office name, English county)}, from the two sources.

    The page the names come from writes 屏東縣 as 'Pingtung City' and 金門縣 as
    'Jinmen County', so the county is taken from district_en.tsv instead — the
    same table the rest of the English output is built from, which keeps a box
    address and a door-number address in the same city agreeing with each other.
    """
    counties = read_front_coded(data_dir / 'district_en.tsv')
    english = {}
    for row in read_mailbox_csv(data_dir / 'mailbox_en.csv'):
        name, county = row['局名'].strip(), row['縣市'].strip()
        city = counties.get(county)
        if city is None:
            print('  ! mailbox_en: no English for %r' % county, file=sys.stderr)
            continue
        english[name] = (row['英文局名'].strip(), city)
    return english


def build(data_dir):
    data_dir = Path(data_dir)

    english = read_english(data_dir)

    mapping, dropped, unopened, conflicts, no_english = {}, 0, 0, 0, 0
    for row in read_mailbox_csv(data_dir / 'mailbox.csv'):
        name = row['局名'].strip()
        zipcode = row['六碼郵遞區號'].strip()
        if not name or not re.fullmatch(r'\d{6}', zipcode):
            dropped += 1
            continue
        if '尚未開辦' in row['信箱中文名稱']:
            unopened += 1
            continue
        if name not in english:
            # Nothing to write on the envelope in English, and the two sources
            # agreeing on 899 offices is what says the join is sound; a miss
            # here means one of them moved.
            no_english += 1
            print('  ! mailbox: no English name for %r' % name, file=sys.stderr)
            continue
        value = US.join((zipcode,) + english[name])
        key = normalize(name)
        if key in mapping and mapping[key] != value:
            conflicts += 1
            print('  ! mailbox %s: %r over %r' % (key, value, mapping[key]), file=sys.stderr)
            continue
        mapping[key] = value

    if dropped:
        print('  mailbox: skipped %d row(s) without a 6-digit code' % dropped)
    if unopened:
        print('  mailbox: skipped %d office(s) with no box open yet' % unopened)
    if no_english:
        print('  mailbox: skipped %d office(s) with no English name' % no_english)
    if conflicts:
        print('  mailbox: %d name collision(s), first value kept' % conflicts)

    n = write_table(data_dir / 'mailbox.tsv', mapping)
    print('mailbox keys: %d' % n)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'data')

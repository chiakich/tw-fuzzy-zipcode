#!/usr/bin/env python3
"""Build data/mailbox.tsv from Chunghwa Post's open P.O. box directory.

Source (政府資料開放授權條款-第1版):

    data/mailbox.csv   郵局專用信箱一覽表
                        https://data.gov.tw/dataset/27770
                        Updated daily by Chunghwa Post; re-download to refresh.

Maps each post office's Chinese name (局名) to its box's 6-digit ZIP code
(六碼郵遞區號). Rows still on the legacy 5-digit code with no box open yet
('尚未開辦信箱') are dropped — they have no 6-digit code to key on.

Keys are normalized the same way as scripts/pack_en.py, for the same reason:
lookups happen on tokens already run through src/zipcodetw.mjs `normalize()`.

Usage:
    python3 scripts/pack_mailbox.py [data_dir]
"""
import csv
import re
import sys
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


def read_mailbox_csv(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        yield from csv.DictReader(f)


def build(data_dir):
    data_dir = Path(data_dir)

    mapping, dropped, conflicts = {}, 0, 0
    for row in read_mailbox_csv(data_dir / 'mailbox.csv'):
        name = row['局名'].strip()
        zipcode = row['六碼郵遞區號'].strip()
        if not name or not re.fullmatch(r'\d{6}', zipcode):
            dropped += 1
            continue
        key = normalize(name)
        if key in mapping and mapping[key] != zipcode:
            conflicts += 1
            print('  ! mailbox %s: %r over %r' % (key, zipcode, mapping[key]), file=sys.stderr)
            continue
        mapping[key] = zipcode

    if dropped:
        print('  mailbox: skipped %d row(s) without a box open yet' % dropped)
    if conflicts:
        print('  mailbox: %d name collision(s), first value kept' % conflicts)

    n = write_table(data_dir / 'mailbox.tsv', mapping)
    print('mailbox keys: %d' % n)


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'data')

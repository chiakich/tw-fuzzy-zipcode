#!/usr/bin/env python3
"""Build data/gradual.tsv and data/precise.tsv from a Chunghwa Post CSV.

Requires the original `zipcodetw` Python package at build time only
(`pip install zipcodetw`) — it is not needed at runtime, only to build the
SQLite index we then flatten into the front-coded TSV bundle used by src/.

Usage:
    python3 scripts/pack.py [csv_path] [out_dir]
"""
import sqlite3
import sys
import tempfile
from pathlib import Path

from zipcodetw.util import Address, Directory

US, RS = '\x1f', '\x1e'  # unit / record separators inside the rules column


def front_code(keys):
    prev = ''
    for k in keys:
        i, m = 0, min(len(k), len(prev))
        while i < m and k[i] == prev[i]:
            i += 1
        yield i, k[i:]
        prev = k


def tail_of(addr_str, rule_str):
    # Rule strings are re-normalized at match time, so only the suffix
    # after addr_str needs to be stored (verified: true for 100% of rows
    # in the 2102_01 dataset).
    n = Address.normalize(rule_str)
    assert n.startswith(addr_str), (addr_str, n)
    return n[len(addr_str):]


def check_catch_all_last(precise):
    # rowid only tracks CSV order while `precise` stays a rowid table upstream;
    # a WITHOUT ROWID redefinition would silently sort by primary key again.
    # The catch-all's position is the cheapest observable proof that it didn't.
    for addr_str, rzpairs in precise.items():
        rules = [r for r, _ in rzpairs]
        catch_all = addr_str + '全'
        if len(rules) > 1 and catch_all in rules[:-1]:
            raise AssertionError(
                'rules for %s are not in CSV order: the 全 catch-all must come '
                'last, got %r' % (addr_str, rules))


def build(csv_path, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / 'index.db')
        directory = Directory(db_path)
        with open(csv_path, encoding='utf-8') as f:
            directory.load_chp_csv(f)

        conn = sqlite3.connect(db_path)

        gradual = dict(conn.execute('select addr_str, zipcode from gradual'))

        precise = {}
        # Rule order is match priority: find() returns the first rule that
        # matches, and overlapping rules are common. Chunghwa Post encodes the
        # priority as row order -- narrow exceptions first, the '全' catch-all
        # last -- so the bundle must keep the CSV's order. `precise` is a rowid
        # table filled by `insert or ignore`, so rowid is that order.
        #
        # Sorting by rule_str instead (as this did until 0.2.1) collates by
        # codepoint, which is unrelated to how wide a rule is: '全' lands ahead
        # of '單'/'連'/'雙', and '單159號至675號' ahead of '單561號至579號'.
        # The widest rule then shadows the exception it was meant to fall back
        # to -- 844 roads answered with the wrong zipcode.
        rows = conn.execute(
            'select addr_str, rule_str, zipcode from precise '
            'order by addr_str, rowid')
        for a, r, z in rows:
            precise.setdefault(a, []).append((r, z))

        check_catch_all_last(precise)

    gk = sorted(gradual)
    with open(out_dir / 'gradual.tsv', 'w', encoding='utf-8') as f:
        f.write('\n'.join(
            '%s\t%s\t%s' % (format(n, 'x'), rest, gradual[k])
            for (n, rest), k in zip(front_code(gk), gk)))

    pk = sorted(precise)
    with open(out_dir / 'precise.tsv', 'w', encoding='utf-8') as f:
        f.write('\n'.join(
            '%s\t%s\t%s' % (format(n, 'x'), rest,
                            RS.join(tail_of(k, r) + US + z for r, z in precise[k]))
            for (n, rest), k in zip(front_code(pk), pk)))

    print('gradual keys: %d, precise keys: %d, precise rules: %d'
          % (len(gk), len(pk), sum(len(v) for v in precise.values())))


if __name__ == '__main__':
    csv_path = sys.argv[1] if len(sys.argv) > 1 else 'data/2102_01.csv'
    out_dir = sys.argv[2] if len(sys.argv) > 2 else 'data'
    build(csv_path, out_dir)

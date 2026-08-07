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
        # find() reads rules through the (addr_str, rule_str) index, so it
        # sees them in rule_str order and returns the first match. The
        # exported bundle must preserve that order exactly, or lookups on
        # roads with multiple overlapping rules can silently return the
        # wrong zipcode.
        rows = conn.execute(
            'select addr_str, rule_str, zipcode from precise '
            'order by addr_str, rule_str')
        for a, r, z in rows:
            precise.setdefault(a, []).append((r, z))

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

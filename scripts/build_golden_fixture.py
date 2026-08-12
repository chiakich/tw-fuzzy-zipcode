#!/usr/bin/env python3
"""Regenerate test/fixtures/golden_find.tsv from the Python reference
implementation (`pip install zipcodetw`, build-time only) — run this any
time data/*.csv is replaced with a newer vintage, then `npm test` to confirm
the JS port still agrees with Python on the new dataset.

The reference is patched first; see order_rules_by_csv_row() below.

Usage:
    python3 scripts/build_golden_fixture.py data/2606_01.csv test/fixtures/golden_find.tsv
"""
import csv
import io
import sys
import tempfile
from pathlib import Path

from zipcodetw.util import Directory


def order_rules_by_csv_row():
    """Make the reference read a road's rules in Chunghwa Post's row order.

    Upstream selects without an `order by`, so SQLite serves the rows from the
    (addr_str, rule_str) primary-key index and find() sees them collated by
    codepoint. Rule order is match priority, and codepoint order is unrelated
    to how wide a rule is, so the '全' catch-all shadows the narrow exceptions
    it exists to back up: 新北市三峽區三樹路291號 answers 237012 where the CSV
    says 237641. `precise` is a rowid table filled by `insert or ignore`, so
    rowid is the CSV's own order -- the order the post office wrote the rules
    in, exceptions first.

    Without this the fixture would encode the bug, and the port would be held
    to it forever.
    """
    def get_rule_str_zipcode_pairs(self, addr_str):
        self.cur.execute('''
            select   rule_str, zipcode
            from     precise
            where    addr_str = ?
            order by rowid;
        ''', (addr_str,))
        return self.cur.fetchall()

    Directory.get_rule_str_zipcode_pairs = get_rule_str_zipcode_pairs

NOS = ['', '1號', '2號', '3號', '5號', '18號', '19號', '20號', '21號', '39號',
       '40號', '41號', '99號', '100號', '101號', '999號', '5之1號', '18之2號',
       '41之3號', '100之1號']
STRIDE = 19  # spreads samples across the whole dataset

EDGE_CASES = [
    '臺北市', '臺北市信義區', '臺北市信義區市府路1號', '松山區', '台北市秀山街',
    '臺北市中正區仁愛路1段1號', '臺北市中正區仁愛路一段1號',
    '臺北市中山區一江街18號', '臺北市中山區一江街19號', '臺北市中山區一江街21號',
    '臺北市中山區一江街39號', '臺北市中山區一江街41號',
    '台北市中山區一江街１８號', '臺北市 中山區 一江街 18號',
    '新北市板橋區文化路1段', '苗栗縣造橋鄉大西村1鄰1號',
    # Roads whose narrow rules a codepoint-ordered read would shadow.
    '新北市三峽區三樹路291號', '新北市三峽區三樹路100號',
    '宜蘭縣羅東鎮公正路561號', '新北市貢寮區巫里岸街2號',
    '桃園市中壢區忠孝路1號', '高雄市苓雅區三多三路1號',
    '臺中市西屯區台灣大道三段99號', '臺南市安平區建平七街100之1號',
    '', '號', '1號', '之1號', '臺北市信義區市府路',
]


def build(csv_path, out_path):
    order_rules_by_csv_row()

    rows = list(csv.reader(io.open(csv_path, encoding='utf-8')))[1:]

    queries = []
    for i in range(0, len(rows), STRIDE):
        city, area, road = rows[i][1], rows[i][2], rows[i][3]
        queries.append(city)
        queries.append(city + area)
        queries.append(area + road)   # middle-token lookup
        queries.append(city + road)   # middle-token lookup
        for no in NOS:
            queries.append(city + area + road + no)
    queries += EDGE_CASES
    queries = list(dict.fromkeys(q for q in queries if '\t' not in q and '\n' not in q))

    with tempfile.TemporaryDirectory() as tmp:
        db_path = str(Path(tmp) / 'index.db')
        directory = Directory(db_path)
        with open(csv_path, encoding='utf-8') as f:
            directory.load_chp_csv(f)

        with io.open(out_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join('%s\t%s' % (q, directory.find(q)) for q in queries))

    print('%d queries -> %s' % (len(queries), out_path))


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2])

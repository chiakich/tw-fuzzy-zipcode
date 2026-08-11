#!/usr/bin/env python3
"""Fetch the English post office names for P.O. boxes into data/mailbox_en.csv.

Source (政府資料開放授權條款-第1版):

    郵局專用信箱一覽表
    https://www.post.gov.tw/post/internet/SearchZone/index.jsp?ID=130111

data/mailbox.csv (data.gov.tw dataset 27770) carries the same English in its
信箱英文名稱 column, but with the line breaks stripped, so the office name runs
straight into the city: 'Taipei HanzhongTaipei City  10899Taiwan ( R.O.C.)'.
Splitting that back apart is guesswork, and it fails outright on the two
offices whose own name contains a city ('Taipei City GovernmentTaipei City').
The page keeps the <br>, which is the delimiter that makes the split exact. It
is also fresher: the CSV's English still embeds legacy 5-digit ZIP codes.

Only the office name is kept. The city and the ZIP code are rebuilt at pack
time from data the project already trusts — the page writes 屏東縣 as
'Pingtung City' and 金門縣 as 'Jinmen County', neither of which matches the
official county names in data/district_en.tsv.

Usage:
    python3 scripts/fetch_mailbox_en.py [data_dir]
"""
import csv
import html
import re
import subprocess
import sys
import time
from pathlib import Path

URL = 'https://www.post.gov.tw/post/internet/SearchZone/index.jsp?ID=130111'

COUNTIES = [
    '基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市',
    '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣',
    '臺東縣', '花蓮縣', '宜蘭縣', '澎湖縣', '金門縣', '連江縣',
]

ROW_RE = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
CELL_RE = re.compile(r'<td[^>]*>(.*?)</td>', re.S)
# 'P.O.BOX ○○ ', 'P. O. BOX ○○', and 苗栗府前's 'P.O.BOX 12－○○ '.
PREFIX_RE = re.compile(r'^P\.?\s*O\.?\s*BOX\s*[\d○－\-\s,]*', re.I)
CITY_RE = re.compile(r'\b(?:City|County)\b')


def fetch(county):
    # Python's TLS stack rejects this host ('Missing Subject Key Identifier')
    # where curl accepts it; shelling out keeps verification on rather than
    # reaching for an unverified SSL context.
    return subprocess.run(
        ['curl', '-sS', '--fail', '--max-time', '60', '-X', 'POST', URL,
         '--data-urlencode', 'mid_area_sn=',
         '--data-urlencode', 'list=2',
         '--data-urlencode', 'mail_city=%s' % county,
         '--data-urlencode', 'Submit=查詢'],
        check=True, capture_output=True, text=True, encoding='utf-8').stdout


def cell_text(cell, keep_breaks=False):
    s = re.sub(r'<br\s*/?>', '\n', cell, flags=re.I) if keep_breaks else cell
    s = html.unescape(re.sub(r'<[^>]+>', '', s))
    lines = (re.sub(r'[ \t　]+', ' ', line).strip() for line in s.split('\n'))
    return '\n'.join(line for line in lines if line)


def office_name(english):
    """The office name out of the three-line box address, or '' if there is none.

    Last line is the country and the one before it the city plus ZIP, so
    whatever precedes them is the name. Five rows break that shape — the name
    runs onto the city's line, or splits across two of its own — so those fall
    back to cutting at the first City/County token.
    """
    lines = [line for line in english.split('\n') if line.strip()]
    if not lines:
        return ''
    body = lines[:-2] if len(lines) >= 3 else CITY_RE.split(lines[0])[:1]
    return PREFIX_RE.sub('', ' '.join(body)).strip(' ,')


def build(data_dir):
    data_dir = Path(data_dir)
    rows, skipped = [], 0
    for county in COUNTIES:
        found = 0
        for row in ROW_RE.findall(fetch(county)):
            cells = CELL_RE.findall(row)
            if len(cells) < 6:
                continue
            name = cell_text(cells[0]).split('\n')[0].strip()
            english = office_name(cell_text(cells[3], keep_breaks=True))
            if not name or name.startswith('郵局名稱'):
                continue
            # No box open at this office, so no address to write on it.
            if not english:
                skipped += 1
                continue
            rows.append({'局名': name, '縣市': county, '英文局名': english})
            found += 1
        print('  %s: %d' % (county, found))
        time.sleep(0.5)

    rows.sort(key=lambda r: r['局名'])
    out = data_dir / 'mailbox_en.csv'
    with open(out, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['局名', '縣市', '英文局名'])
        writer.writeheader()
        writer.writerows(rows)
    print('mailbox_en.csv: %d office(s), %d without a box open' % (len(rows), skipped))


if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'data')

#!/usr/bin/env python3
"""Convert Chunghwa Post's rall1.dbf (from the 3+3 application installer,
extracted by hand — see README) into the same 5-column CSV shape the
original zipcodetw project used (ZIPCODE,CITY,AREA,ROAD,SCOOP), so the
existing scripts/pack.py pipeline can consume it unchanged.

rall1.dbf is Visual FoxPro DBF, Big5-encoded (FoxPro language driver 0x78).
It carries far more columns than we need (pre-split house-number/lane/alley
range fields) but SCOOP still holds the same free-text rule string the
original CSV had (e.g. "單  21號至  39號"), which is all Address/Rule
parsing in zipcodetw's util.py actually consumes.

Usage:
    python3 scripts/dbf_to_csv.py rall1.dbf data/2606_01.csv
"""
import csv
import sys


def read_fields(header):
    fields = []
    off = 32
    while header[off] != 0x0D:
        raw = header[off:off + 32]
        name = raw[0:11].split(b'\x00')[0].decode('ascii')
        ftype = chr(raw[11])
        flen = raw[16]
        fields.append((name, ftype, flen))
        off += 32
    return fields


def convert(dbf_path, csv_path):
    with open(dbf_path, 'rb') as f:
        header = f.read(1480)
        header_len = int.from_bytes(header[8:10], 'little')
        record_len = int.from_bytes(header[10:12], 'little')
        assert header_len == 1480, header_len  # matches the file we inspected
        fields = read_fields(header)
        f.seek(header_len)
        body = f.read()

    num_records = len(body) // record_len
    field_offsets = {}
    off = 1  # byte 0 of each record is the deletion flag
    for name, ftype, flen in fields:
        field_offsets[name] = (off, flen)
        off += flen

    def get(rec, name):
        start, length = field_offsets[name]
        # cp950 (Big5 + Microsoft's extensions) decodes every record in the
        # 2606 dataset with zero errors; plain 'big5' fails on 26 rows with
        # rarer characters (e.g. some village/road names).
        return rec[start:start + length].decode('cp950').strip()

    with open(csv_path, 'w', newline='', encoding='utf-8') as out:
        writer = csv.writer(out)
        writer.writerow(['ZIPCODE', 'CITY', 'AREA', 'ROAD', 'SCOOP'])
        n = 0
        for i in range(num_records):
            rec = body[i * record_len:(i + 1) * record_len]
            if rec[0:1] == b'*':  # dBase soft-delete marker
                continue
            row = [get(rec, k) for k in ('ZIPCODE', 'CITY', 'AREA', 'ROAD', 'SCOOP')]
            if not row[0]:  # a handful of trailing/blank records
                continue
            writer.writerow(row)
            n += 1

    print(f'{num_records} DBF records -> {n} CSV rows -> {csv_path}')


if __name__ == '__main__':
    convert(sys.argv[1], sys.argv[2])

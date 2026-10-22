"""Audit supplied box-office files without changing either source file.

Uses only Python's standard library. The JSON output is intended for the
private reported-outcome catalog; it is not a training fixture.
"""

import argparse
import csv
import io
import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def workbook_rows(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(node.itertext()) for node in root.findall(f"{{{MAIN}}}si")]
        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        cells = []
        for row in sheet.findall(f".//{{{MAIN}}}sheetData/{{{MAIN}}}row"):
            result = {}
            for cell in row.findall(f"{{{MAIN}}}c"):
                column = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                value = cell.find(f"{{{MAIN}}}v")
                inline = cell.find(f"{{{MAIN}}}is")
                if cell.attrib.get("t") == "s" and value is not None:
                    result[column] = shared[int(value.text)]
                elif inline is not None:
                    result[column] = "".join(inline.itertext())
                elif value is not None:
                    result[column] = value.text
            cells.append(result)
    columns = list(cells[0])
    headers = {column: cells[0][column] for column in columns}
    return [{label: row.get(column) for column, label in headers.items()} for row in cells[1:]]


def number(value):
    return None if value is None or value == "" else float(value)


def integer(value):
    parsed = number(value)
    return int(parsed) if parsed is not None and parsed.is_integer() else None


def zip_rows(path):
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist() if name.endswith("verified_concerts.csv")]
        if len(names) != 1:
            raise ValueError("Expected one verified_concerts.csv in the ZIP")
        return list(csv.DictReader(io.StringIO(archive.read(names[0]).decode("utf-8-sig"))))


def catalog_record(row):
    capacity = integer(row.get("Sellable capacity per show"))
    sold = integer(row.get("Paid tickets sold (total)"))
    show_count = integer(row.get("Number of shows"))
    kind = "single_show_outcome"
    if show_count != 1:
        kind = "multi_show_aggregate"
    elif capacity is None or capacity < 1:
        kind = "missing_capacity"
    elif sold is None or sold < 0 or sold > capacity:
        kind = "invalid_paid_tickets"
    return {
        "sourceKey": str(row.get("Record ID") or "").strip(),
        "eventDate": str(row.get("Event date") or "").strip(),
        "eventType": str(row.get("Event type") or "").strip(),
        "headliner": str(row.get("Headliner / event") or "").strip(),
        "venue": str(row.get("Venue") or "").strip(),
        "city": str(row.get("City") or "").strip(),
        "country": str(row.get("Country") or "").strip(),
        "showCount": show_count,
        "sellableCapacity": capacity,
        "paidTicketsSold": sold,
        "sourcePublisher": str(row.get("Source publisher") or "").strip(),
        "sourceUrl": str(row.get("Source URL") or "").strip(),
        "outcomeType": kind,
        "preEventFeatureCutoff": str(row.get("Feature cutoff / forecast date") or "").strip() or None,
        "trainingEligible": False,
        "trainingExclusion": "No timestamped pre-event feature vector or Qloo receipt exists in the source files.",
        "sourceClassification": "publisher_reported_transcription_not_independently_audited",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("verified_zip", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    rows = workbook_rows(args.workbook)
    zipped = zip_rows(args.verified_zip)
    catalog = [catalog_record(row) for row in rows]
    ids = [row["sourceKey"] for row in catalog]
    if not ids or len(set(ids)) != len(ids):
        raise ValueError("Workbook source IDs must be nonempty and unique")
    by_id = {row["sourceKey"]: row for row in catalog}
    mismatches = []
    for row in zipped:
        other = by_id.get(row["event_id"])
        if other is None:
            mismatches.append({"id": row["event_id"], "field": "missing_in_workbook"})
            continue
        pairs = (("eventDate", "event_date"), ("city", "city"),
                 ("sellableCapacity", "sellable_capacity_per_show"),
                 ("paidTicketsSold", "tickets_sold_total"))
        for field, zip_field in pairs:
            left = other[field]
            right = integer(row[zip_field]) if field in ("sellableCapacity", "paidTicketsSold") else row[zip_field]
            if left != right:
                mismatches.append({"id": row["event_id"], "field": field, "workbook": left, "zip": right})
    counts = {kind: sum(row["outcomeType"] == kind for row in catalog)
              for kind in sorted(set(row["outcomeType"] for row in catalog))}
    report = {
        "schemaVersion": 1,
        "summary": {
            "workbookRecords": len(catalog), "zipRecords": len(zipped),
            "zipOverlapsWorkbook": sum(row["event_id"] in by_id for row in zipped),
            "zipMismatches": mismatches, "outcomeTypes": counts,
            "trainingEligible": 0,
            "limitation": "Published post-event outcomes without timestamped pre-event price, competition, Qloo or popularity features. Real paid tickets sold are not gate scans. No attendance accuracy, price elasticity or Qloo lift can be estimated from these files.",
        },
        "catalog": catalog,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()

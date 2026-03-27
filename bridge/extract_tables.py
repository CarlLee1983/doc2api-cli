#!/usr/bin/env python3
"""
doc2api bridge — Extract tables from PDF using pdfplumber.
Outputs JSON to stdout. Logs to stderr.

Usage:
    python3 extract_tables.py <pdf_path> [--pages 1-10]
"""

import json
import sys
import os


def extract_tables(pdf_path, page_range=None):
    try:
        import pdfplumber
    except ImportError:
        print(json.dumps({
            "ok": False,
            "error": "pdfplumber not installed. Run: pip install pdfplumber"
        }))
        sys.exit(1)

    if not os.path.isfile(pdf_path):
        print(json.dumps({
            "ok": False,
            "error": f"File not found: {pdf_path}"
        }))
        sys.exit(1)

    tables = []

    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages

        if page_range:
            start, end = page_range
            pages = pages[start - 1:end]

        for page in pages:
            page_tables = page.extract_tables()
            if not page_tables:
                continue

            for table_idx, table in enumerate(page_tables):
                if not table or len(table) < 2:
                    continue

                headers = [str(cell or "").strip() for cell in table[0]]
                rows = []
                for row in table[1:]:
                    rows.append([str(cell or "").strip() for cell in row])

                tables.append({
                    "page": page.page_number,
                    "table_index": table_idx,
                    "headers": headers,
                    "rows": rows,
                })

    print(json.dumps({"ok": True, "tables": tables}, ensure_ascii=False))


def parse_page_range(s):
    if not s:
        return None
    try:
        parts = s.split("-")
        if len(parts) == 1:
            n = int(parts[0])
            return (n, n)
        if len(parts) == 2:
            return (int(parts[0]), int(parts[1]))
        raise ValueError(f"Invalid format: {s}")
    except ValueError:
        print(json.dumps({"ok": False, "error": f"Invalid page range: {s}. Expected N or N-M (e.g., 1-10)"}))
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: extract_tables.py <pdf_path> [--pages 1-10]"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    pages = None

    for i, arg in enumerate(sys.argv[2:], 2):
        if arg == "--pages" and i + 1 < len(sys.argv):
            pages = parse_page_range(sys.argv[i + 1])

    extract_tables(pdf_path, pages)

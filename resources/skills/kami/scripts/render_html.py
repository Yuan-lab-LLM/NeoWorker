#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

PLACEHOLDER = re.compile(r"\{\{[^}]+\}\}")


def pdf_font_names(pdf_path: Path) -> set[str]:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    fonts: set[str] = set()
    for page in reader.pages:
        resources = page.get("/Resources")
        if resources is None:
            continue
        font_dict = resources.get("/Font")
        if not isinstance(font_dict, dict):
            continue
        for obj in font_dict.values():
            try:
                resolved = obj.get_object() if hasattr(obj, "get_object") else obj
            except Exception:
                resolved = obj
            if isinstance(resolved, dict):
                base = resolved.get("/BaseFont")
                if base:
                    fonts.add(str(base).lstrip("/"))
    return fonts


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a Kami HTML file to PDF.")
    parser.add_argument("source_html", help="Path to the source HTML file")
    parser.add_argument("output_pdf", help="Path to the rendered PDF")
    parser.add_argument("--max-pages", type=int, default=0, help="Optional hard page limit")
    args = parser.parse_args()

    source = Path(args.source_html).expanduser().resolve()
    output = Path(args.output_pdf).expanduser().resolve()

    if not source.exists():
        print(f"[kami] source not found: {source}", file=sys.stderr)
        return 1

    html = source.read_text(encoding="utf-8", errors="replace")
    placeholders = sorted(set(PLACEHOLDER.findall(html)))
    if placeholders:
        print(
            f"[kami] unfilled placeholders in {source.name}: {', '.join(placeholders)}",
            file=sys.stderr,
        )
        return 2

    try:
        from weasyprint import HTML
        from pypdf import PdfReader
    except ImportError as exc:
        print(f"[kami] missing dependency: {exc}", file=sys.stderr)
        return 3

    output.parent.mkdir(parents=True, exist_ok=True)
    HTML(filename=str(source), base_url=str(source.parent)).write_pdf(str(output))

    page_count = len(PdfReader(str(output)).pages)
    if args.max_pages and page_count > args.max_pages:
        print(
            f"[kami] page overflow: {page_count} pages (limit {args.max_pages})",
            file=sys.stderr,
        )
        return 4

    fonts = sorted(pdf_font_names(output))
    print(f"[kami] source: {source}")
    print(f"[kami] output: {output}")
    print(f"[kami] pages: {page_count}")
    if fonts:
        print(f"[kami] embedded fonts: {', '.join(fonts)}")

    try:
        result = subprocess.run(
            ["pdffonts", str(output)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0 and result.stdout.strip():
            print("[kami] pdffonts:")
            print(result.stdout.rstrip())
    except FileNotFoundError:
        pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

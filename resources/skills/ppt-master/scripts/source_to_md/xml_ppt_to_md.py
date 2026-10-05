"""Dependency-free PowerPoint to Markdown fallback.

The primary converter uses python-pptx because it exposes more presentation
features. NeoWorker also needs to work on a clean machine, however, where that
optional package may not be installed. This module keeps the source-import
path usable by reading the Open XML package directly and reusing PPT Master
analysis helpers that already have no third-party dependency.
"""

from __future__ import annotations

import json
import mimetypes
import re
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow is optional
    Image = None

_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from template_fill_pptx.analyzer import analyze_pptx  # noqa: E402
from template_fill_pptx.diagram_read import smartart_to_markdown  # noqa: E402
from template_fill_pptx.ooxml import (  # noqa: E402
    NS,
    REL_NS,
    _container_geometry,
    _normalize_part,
    _parse_slide_refs,
    _read_xml,
    _slide_relationships,
)
from _conversion_profile import write_conversion_profile_best_effort  # noqa: E402


def _safe_filename(value: str) -> str:
    filename = re.sub(r"[^\w.\-]+", "_", value, flags=re.UNICODE).strip("._")
    return filename or "image"


def _image_size(blob: bytes) -> tuple[int | None, int | None]:
    if Image is None:
        return None, None
    try:
        from io import BytesIO

        with Image.open(BytesIO(blob)) as image:
            return image.width, image.height
    except (OSError, ValueError):
        return None, None


def _escape_cell(value: object) -> str:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    text = "<br>".join(line.strip() for line in text.split("\n"))
    return text.replace("|", r"\|") or " "


def _table_to_markdown(table: dict[str, Any]) -> str:
    rows = table.get("rows") or []
    normalized: list[list[str]] = []
    for row in rows:
        cells = row.get("cells") if isinstance(row, dict) else []
        normalized.append(
            [_escape_cell(cell.get("text", "")) for cell in cells if isinstance(cell, dict)]
        )
    if not normalized:
        return ""
    column_count = max(len(row) for row in normalized)
    normalized = [row + [" "] * (column_count - len(row)) for row in normalized]
    lines = [
        "| " + " | ".join(normalized[0]) + " |",
        "| " + " | ".join(["---"] * column_count) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in normalized[1:])
    return "\n".join(lines)


def _chart_to_markdown(chart: dict[str, Any]) -> str:
    chart_type = str(chart.get("chart_type") or "").strip()
    header = f"> [Chart] {chart.get('chart_id') or 'Chart'}"
    if chart_type:
        header += f" — {chart_type}"
    categories = [str(value) for value in chart.get("categories") or []]
    series = [item for item in chart.get("series") or [] if isinstance(item, dict)]
    if not series:
        return f"{header}\n\n> [Chart data unavailable]"
    names = [str(item.get("name") or f"Series {index}") for index, item in enumerate(series, 1)]
    row_count = max([len(categories), *(len(item.get("values") or []) for item in series)])
    lines = [
        header,
        "",
        "| Category | " + " | ".join(_escape_cell(name) for name in names) + " |",
        "| --- | " + " | ".join(["---"] * len(names)) + " |",
    ]
    for row_index in range(row_count):
        category = categories[row_index] if row_index < len(categories) else str(row_index + 1)
        values = []
        for item in series:
            raw_values = item.get("values") or []
            values.append(raw_values[row_index] if row_index < len(raw_values) else "")
        lines.append(
            "| "
            + " | ".join([_escape_cell(category)] + [_escape_cell(value) for value in values])
            + " |"
        )
    return "\n".join(lines)


def _slot_shape_id(slot: dict[str, Any]) -> str:
    return str(slot.get("slot_id") or "").rsplit("_sh", 1)[-1]


def _table_shape_ids(tables: list[dict[str, Any]]) -> set[str]:
    result: set[str] = set()
    for table in tables:
        table_id = str(table.get("table_id") or "")
        if "tbl" in table_id:
            result.add(table_id.rsplit("tbl", 1)[-1])
    return result


def _text_block(text: object) -> str:
    lines = [str(line).strip() for line in str(text or "").splitlines() if str(line).strip()]
    if not lines:
        return ""
    if len(lines) == 1:
        return lines[0]
    return "\n".join(f"- {line}" for line in lines)


def _content_blocks(slide: dict[str, Any]) -> list[str]:
    blocks: list[str] = []
    tables = [item for item in slide.get("tables") or [] if isinstance(item, dict)]
    table_shape_ids = _table_shape_ids(tables)
    diagram_shape_ids = {
        str(item.get("shape_id"))
        for item in slide.get("diagrams") or []
        if isinstance(item, dict) and item.get("shape_id") is not None
    }

    for slot in slide.get("slots") or []:
        if not isinstance(slot, dict):
            continue
        shape_id = _slot_shape_id(slot)
        if shape_id in table_shape_ids or shape_id in diagram_shape_ids:
            continue
        block = _text_block(slot.get("text"))
        if block:
            blocks.append(block)

    for table in tables:
        block = _table_to_markdown(table)
        if block:
            blocks.append(block)

    for chart in slide.get("charts") or []:
        if isinstance(chart, dict):
            blocks.append(_chart_to_markdown(chart))

    for diagram in slide.get("diagrams") or []:
        if isinstance(diagram, dict):
            try:
                blocks.append(smartart_to_markdown(diagram))
            except (KeyError, TypeError, ValueError):
                blocks.append("> [SmartArt content unavailable]")

    return blocks


def _extract_notes(
    package: zipfile.ZipFile,
    slide_refs: list[Any],
) -> dict[int, str]:
    notes_by_slide: dict[int, str] = {}
    notes_type = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
    for slide_ref in slide_refs:
        rels = _slide_relationships(package, slide_ref.rels_name)
        notes_rel = next(
            (
                rel
                for rel in rels.values()
                if rel.get("type") == notes_type and rel.get("target")
            ),
            None,
        )
        if notes_rel is None:
            continue
        part_name = _normalize_part(str(notes_rel["target"]), slide_ref.part_name)
        try:
            root = _read_xml(package, part_name)
        except RuntimeError:
            continue
        paragraphs: list[str] = []
        for paragraph in root.findall(".//a:p", NS):
            text = "".join(node.text or "" for node in paragraph.findall(".//a:t", NS)).strip()
            if text:
                paragraphs.append(text)
        if paragraphs:
            notes_by_slide[slide_ref.index] = "\n\n".join(paragraphs)
    return notes_by_slide


def _extract_images(
    package: zipfile.ZipFile,
    slide_refs: list[Any],
    asset_dir: Path,
) -> tuple[dict[int, list[str]], list[dict[str, Any]]]:
    image_names_by_slide: dict[int, list[str]] = {}
    manifest_by_part: dict[str, dict[str, Any]] = {}
    used_names: set[str] = set()
    occurrence_index = 0

    for slide_ref in slide_refs:
        try:
            slide_root = _read_xml(package, slide_ref.part_name)
        except RuntimeError:
            continue
        rels = _slide_relationships(package, slide_ref.rels_name)
        for picture in slide_root.findall(".//p:pic", NS):
            blip = picture.find(".//a:blip", NS)
            if blip is None:
                continue
            rel_id = blip.attrib.get(f"{{{NS['r']}}}embed") or blip.attrib.get(
                f"{{{NS['r']}}}link"
            )
            rel = rels.get(rel_id or "")
            if rel is None or not str(rel.get("type", "")).endswith("/image"):
                continue
            part_name = _normalize_part(str(rel["target"]), slide_ref.part_name)
            try:
                blob = package.read(part_name)
            except KeyError:
                continue

            entry = manifest_by_part.get(part_name)
            if entry is None:
                filename = _safe_filename(Path(part_name).name)
                if "." not in filename:
                    filename += mimetypes.guess_extension(
                        mimetypes.guess_type(part_name)[0] or ""
                    ) or ".bin"
                if filename in used_names:
                    stem = Path(filename).stem
                    suffix = Path(filename).suffix
                    counter = 2
                    while f"{stem}_{counter}{suffix}" in used_names:
                        counter += 1
                    filename = f"{stem}_{counter}{suffix}"
                used_names.add(filename)
                asset_dir.mkdir(parents=True, exist_ok=True)
                (asset_dir / filename).write_bytes(blob)
                width, height = _image_size(blob)
                entry = {
                    "index": len(manifest_by_part) + 1,
                    "filename": filename,
                    "original_filename": filename,
                    "asset_kind": "bitmap",
                    "svg_renderable": True,
                    "pptx_native_supported": True,
                    "source_kind": "pptx_picture",
                    "source_ext": Path(part_name).suffix.lower(),
                    "source_target": part_name,
                    "content_type": mimetypes.guess_type(part_name)[0] or "",
                    "pixel_width": width,
                    "pixel_height": height,
                    "occurrences": [],
                }
                manifest_by_part[part_name] = entry

            geometry = _container_geometry(picture)
            c_nv_pr = picture.find(".//p:cNvPr", NS)
            shape_name = c_nv_pr.attrib.get("name", "") if c_nv_pr is not None else ""
            occurrence_index += 1
            width = geometry.get("width")
            height = geometry.get("height")
            entry["occurrences"].append(
                {
                    "slide_index": slide_ref.index,
                    "shape_name": shape_name,
                    "display_left_px": geometry.get("x"),
                    "display_top_px": geometry.get("y"),
                    "display_width_px": width,
                    "display_height_px": height,
                    "display_ratio": (
                        round(width / height, 6)
                        if isinstance(width, (int, float))
                        and isinstance(height, (int, float))
                        and height
                        else None
                    ),
                }
            )
            entry["usage_count"] = len(entry["occurrences"])
            image_names_by_slide.setdefault(slide_ref.index, []).append(
                f"![Slide {slide_ref.index} Image {occurrence_index}]"
                f"({asset_dir.name}/{entry['filename']})"
            )

    return image_names_by_slide, list(manifest_by_part.values())


def convert_presentation_to_markdown_xml(
    input_path: str,
    output_path: str | None = None,
    *,
    asset_dir: Path | None = None,
) -> str:
    """Convert a PPTX with only the Python standard library and repo helpers."""
    input_file = Path(input_path)
    out_file = Path(output_path) if output_path else input_file.with_suffix(".md")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    companion_dir = asset_dir or out_file.parent / f"{out_file.stem}_files"
    if companion_dir.exists():
        shutil.rmtree(companion_dir)

    analysis = analyze_pptx(input_file)
    slides = analysis.get("slides") or []
    conversion_warnings = [
        "python-pptx is unavailable; used the dependency-free Open XML fallback."
    ]

    with zipfile.ZipFile(input_file) as package:
        slide_refs = _parse_slide_refs(package)
        notes_by_slide = _extract_notes(package, slide_refs)
        image_names_by_slide, image_manifest = _extract_images(
            package,
            slide_refs,
            companion_dir,
        )

    lines = [
        f"# {input_file.stem}",
        "",
        f"- Source: `{input_file.name}`",
        f"- Total slides: {len(slides)}",
        "",
    ]
    for slide in slides:
        slide_index = int(slide.get("slide_index") or len(lines))
        lines.extend([f"## Slide {slide_index}", ""])
        blocks = _content_blocks(slide)
        blocks.extend(image_names_by_slide.get(slide_index, []))
        if blocks:
            lines.append("\n\n".join(blocks))
        else:
            lines.append("_No extractable text content._")
        lines.append("")
        notes = notes_by_slide.get(slide_index, "").strip()
        if notes:
            lines.extend(["### Speaker Notes", "", notes, ""])

    markdown_content = "\n".join(lines).strip() + "\n"
    out_file.write_text(markdown_content, encoding="utf-8")
    if image_manifest:
        companion_dir.mkdir(parents=True, exist_ok=True)
        (companion_dir / "image_manifest.json").write_text(
            json.dumps(image_manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    profile_path = write_conversion_profile_best_effort(
        input_path=str(input_file),
        markdown_path=out_file,
        converter="ppt_to_md.py",
        conversion_type=input_file.suffix.lstrip("."),
        asset_dir=companion_dir,
        warnings=conversion_warnings,
    )

    print("[WARN] python-pptx is unavailable; used the dependency-free Open XML fallback.")
    print(f"[OK] Saved Markdown to: {out_file}")
    if profile_path:
        print(f"   Wrote conversion profile -> {profile_path}")
    if image_manifest:
        print(f"   Extracted {len(image_manifest)} image file(s) -> {companion_dir}")
        print(f"   Wrote image manifest -> {companion_dir / 'image_manifest.json'}")
    return markdown_content

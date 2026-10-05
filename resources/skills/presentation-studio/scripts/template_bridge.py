#!/usr/bin/env python3
"""Native template inspection/fill. The bundled PPT Master owns OOXML writes.

This adapter never imports a PPTX as SVG or reconstructs its master/theme.
All parsing below is read-only; the source file is immutable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ppt-master" / "scripts"))
from attribution_guard import require_skill_integrity
from template_fill_pptx.analyzer import analyze_pptx
from template_fill_pptx.applier import apply_plan
from template_fill_pptx.checker import check_plan
from template_fill_pptx.ooxml import (
    NS, REL_NS, _parse_slide_refs, _normalize_part, _rels_name_for_part,
    _shape_identity, _text_containers, _container_geometry,
)
from template_fill_pptx.validator import validate_project


def digest(data):
    return hashlib.sha256(data).hexdigest()


def related(zf, part, kind):
    name = _rels_name_for_part(part)
    if name not in zf.namelist():
        return None
    root = ET.fromstring(zf.read(name))
    for rel in root.findall(f"{{{REL_NS}}}Relationship"):
        if rel.get("Type", "").endswith("/" + kind) and rel.get("TargetMode") != "External":
            return _normalize_part(rel.get("Target"), part)
    return None


def placeholder(shape):
    return shape.find(".//p:ph", NS)


def matching_shape(root, ph, master=False):
    if root is None or ph is None:
        return None
    candidates = []
    for shape in root.findall(".//p:sp", NS):
        other = placeholder(shape)
        if other is not None:
            if not master and other.get("idx", "0") == ph.get("idx", "0"):
                return shape
            if other.get("type", "body") == ph.get("type", "body"):
                candidates.append(shape)
    return candidates[0] if len(candidates) == 1 else None


def shape_metrics(chain, master, presentation, grouped=False, placeholder_type=None):
    """Resolve inherited placeholder geometry and conservative text capacity."""
    geometry = None
    for shape in chain:
        candidate = _container_geometry(shape)
        if all(candidate.get(key) is not None for key in ("x", "y", "width", "height")):
            geometry = candidate
            break
    ph = placeholder(chain[0])
    kind = placeholder_type or (ph.get("type") if ph is not None else None)
    style = "titleStyle" if kind in ("title", "ctrTitle") else "bodyStyle" if ph is not None else "otherStyle"
    inherited_styles = []
    if master is not None:
        inherited_styles.extend(master.findall(f"p:txStyles/p:{style}", NS))
    inherited_styles.extend(presentation.findall("p:defaultTextStyle", NS))
    sizes = []
    for node in [*chain, *inherited_styles]:
        # Prefer explicit shape sizes, then inherited placeholder and style sizes.
        sizes = [float(r.get("sz")) / 100 for r in node.findall(".//a:rPr", NS) + node.findall(".//a:defRPr", NS) + node.findall(".//a:endParaRPr", NS) if r.get("sz")]
        if sizes:
            break
    props = {}
    for shape in reversed(chain):
        body = shape.find("p:txBody/a:bodyPr", NS)
        if body is not None:
            props.update(body.attrib)
    issues = []
    if grouped:
        issues.append("Grouped text requires explicit visual editing; its transform is not supported for automatic fill")
    if any(int(x.get("rot", "0")) or x.get("flipH") == "1" or x.get("flipV") == "1" for s in chain for x in s.findall("p:spPr/a:xfrm", NS)) or int(props.get("rot", "0")):
        issues.append("Rotated/flipped text is not supported for automatic fill")
    if props.get("vert", "horz") != "horz" or int(props.get("numCol", "1")) != 1:
        issues.append("Vertical/multicolumn text requires explicit visual editing")
    if not sizes or not geometry:
        issues.append("Cannot resolve inherited font size or text frame")
    margins = {k: float(props.get(k, default)) / 914400 for k, default in (("lIns", 91440), ("rIns", 91440), ("tIns", 45720), ("bIns", 45720))}
    bounds = None
    if geometry:
        bounds = {"x": geometry["x"] / 96 + margins["lIns"], "y": geometry["y"] / 96 + margins["tIns"], "w": geometry["width"] / 96 - margins["lIns"] - margins["rIns"], "h": geometry["height"] / 96 - margins["tIns"] - margins["bIns"]}
    spacing = [float(n.get("val", "0")) / 100 / 72 for s in chain for n in s.findall(".//a:spcBef/a:spcPts", NS) + s.findall(".//a:spcAft/a:spcPts", NS)]
    leading = [float(n.get("val", "0")) / 100000 for s in chain for n in s.findall(".//a:lnSpc/a:spcPct", NS)]
    return {"bounds": bounds, "fontSize": max(sizes) if sizes else None, "paragraphSpacing": max(spacing, default=0) * 2, "leading": max([1.35, *leading]), "issues": issues}


def inspect(source):
    library = analyze_pptx(source)
    library["sourceSha256"] = digest(source.read_bytes())
    library["templateParts"] = {}
    library["themes"] = []
    with zipfile.ZipFile(source) as zf:
        presentation = ET.fromstring(zf.read("ppt/presentation.xml"))
        for name in zf.namelist():
            if name.startswith(("ppt/slideMasters/", "ppt/slideLayouts/", "ppt/theme/", "ppt/media/")) and not name.endswith("/"):
                library["templateParts"][name] = digest(zf.read(name))
            if name.startswith("ppt/theme/") and name.endswith(".xml"):
                theme = ET.fromstring(zf.read(name))
                library["themes"].append({"part": name, "name": theme.get("name"), "fonts": sorted({n.get("typeface") for n in theme.iter() if n.get("typeface")}), "colors": [dict(n.attrib) for n in theme.findall(".//a:clrScheme/*/*", NS)]})
        for ref, slide in zip(_parse_slide_refs(zf), library["slides"]):
            root = ET.fromstring(zf.read(ref.part_name))
            layout_part = related(zf, ref.part_name, "slideLayout")
            master_part = related(zf, layout_part, "slideMaster") if layout_part else None
            layout = ET.fromstring(zf.read(layout_part)) if layout_part else None
            master = ET.fromstring(zf.read(master_part)) if master_part else None
            slide.update({"part": ref.part_name, "layoutPart": layout_part, "masterPart": master_part})
            grouped = {id(s) for group in root.findall(".//p:grpSp", NS) for s in group.findall(".//p:sp", NS)}
            slots = {slot["slot_id"]: slot for slot in slide["slots"]}
            for order, shape in enumerate(_text_containers(root), 1):
                shape_id, name = _shape_identity(shape, order)
                slot = slots[f"s{ref.index:02d}_sh{shape_id}"]
                slot["shapeName"] = name
                slot["nativeObject"] = shape.tag.endswith("}graphicFrame")
                if slot["nativeObject"]:
                    continue
                ph = placeholder(shape)
                inherited_layout = matching_shape(layout, ph)
                layout_ph = placeholder(inherited_layout) if inherited_layout is not None else None
                resolved_ph = ET.Element("ph", {**(layout_ph.attrib if layout_ph is not None else {}), **ph.attrib}) if ph is not None else None
                inherited_master = matching_shape(master, resolved_ph, master=True)
                chain = [s for s in (shape, inherited_layout, inherited_master) if s is not None]
                slot["placeholderType"] = resolved_ph.get("type", "body") if resolved_ph is not None else None
                slot["capacity"] = shape_metrics(chain, master, presentation, id(shape) in grouped, slot["placeholderType"])
                # Object names provide deterministic opt-in bindings. Other text,
                # including logos/footers, must be classified in the editable plan.
                slot["suggestedField"] = name[3:] if name and name.startswith("nw:") else None
            for table in slide["tables"]:
                shape_id = table["table_id"].split("_tbl")[-1]
                frame = next(s for s in root.findall(".//p:graphicFrame", NS) if _shape_identity(s, 0)[0] == shape_id)
                table_xml = frame.find(".//a:tbl", NS)
                table["geometry"] = _container_geometry(frame)
                table["columnWidths"] = [int(c.get("w")) / 914400 for c in table_xml.findall("a:tblGrid/a:gridCol", NS)]
                for row_info, row in zip(table["rows"], table_xml.findall("a:tr", NS)):
                    row_info["height"] = int(row.get("h")) / 914400
                    for cell_info, cell in zip(row_info["cells"], row.findall("a:tc", NS)):
                        sizes = [float(n.get("sz")) / 100 for n in cell.findall(".//a:rPr", NS) + cell.findall(".//a:defRPr", NS) if n.get("sz")]
                        cell_info["fontSize"] = max(sizes) if sizes else None
                        props = cell.find("a:tcPr", NS)
                        cell_info["margins"] = {key: int(props.get(key, default) if props is not None else default) / 914400 for key, default in (("marL", 91440), ("marR", 91440), ("marT", 45720), ("marB", 45720))}
            for chart in slide["charts"]:
                shape_id = chart["chart_id"].split("_ch")[-1]
                frame = next(s for s in root.findall(".//p:graphicFrame", NS) if _shape_identity(s, 0)[0] == shape_id)
                g = _container_geometry(frame)
                chart["bounds"] = {"x": g["x"] / 96, "y": g["y"] / 96, "w": g["width"] / 96, "h": g["height"] / 96} if all(v is not None for v in g.values()) else None
            slide["pictures"] = [{"shapeId": _shape_identity(pic, 0)[0], "shapeName": _shape_identity(pic, 0)[1]} for pic in root.findall(".//p:pic", NS)]
    return library


def fill(source, payload, output):
    if digest(source.read_bytes()) != payload["sourceSha256"]:
        raise RuntimeError("Template changed since import; import it as a new project before building")
    library, plan = inspect(source), payload["fillPlan"]
    checked = check_plan(library, plan)
    if checked["summary"].get("error", 0):
        raise RuntimeError("Native template plan rejected: " + json.dumps(checked, ensure_ascii=False))
    project = output.parent / (output.stem + "-native")
    for folder in ("analysis", "exports", "validation"):
        (project / folder).mkdir(parents=True, exist_ok=True)
    (project / "analysis/template.slide_library.json").write_text(json.dumps(library, ensure_ascii=False), encoding="utf-8")
    (project / "analysis/fill_plan.json").write_text(json.dumps(plan, ensure_ascii=False), encoding="utf-8")
    candidate = project / "exports/presentation.pptx"
    apply_plan(source, plan, candidate)
    validation = validate_project(project)
    if validation["summary"].get("error", 0):
        raise RuntimeError("Native template read-back rejected: " + json.dumps(validation, ensure_ascii=False))
    preserved = []
    with zipfile.ZipFile(candidate) as zf:
        for part, sha in library["templateParts"].items():
            if part in zf.namelist():
                if digest(zf.read(part)) != sha:
                    raise RuntimeError(f"Template branding part changed unexpectedly: {part}")
                preserved.append(part)
    shutil.copyfile(candidate, output)
    return {"output": str(output), "sourceSha256": library["sourceSha256"], "preservedParts": preserved, "check": checked, "validation": validation}


def main():
    require_skill_integrity()
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["inspect", "fill"])
    parser.add_argument("--source", required=True)
    parser.add_argument("--plan")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source, output = Path(args.source).resolve(), Path(args.output).resolve()
    if source.suffix.lower() != ".pptx" or not source.is_file():
        raise RuntimeError("A readable native .pptx template is required")
    if source == output:
        raise RuntimeError("Cannot overwrite the source template")
    output.parent.mkdir(parents=True, exist_ok=True)
    if args.command == "inspect":
        output.write_text(json.dumps(inspect(source), ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        result = fill(source, json.loads(Path(args.plan).read_text(encoding="utf-8")), output)
        output.with_suffix(".template-report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Template error: {error}", file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "assets" / "templates"
DIAGRAMS = ROOT / "assets" / "diagrams"
FONTS = ROOT / "assets" / "fonts"

DOCUMENT_MAP = {
    "one-pager": {
        "kind": "html",
        "english": "one-pager-en.html",
        "chinese": "one-pager.html",
    },
    "long-doc": {
        "kind": "html",
        "english": "long-doc-en.html",
        "chinese": "long-doc.html",
    },
    "letter": {
        "kind": "html",
        "english": "letter-en.html",
        "chinese": "letter.html",
    },
    "portfolio": {
        "kind": "html",
        "english": "portfolio-en.html",
        "chinese": "portfolio.html",
    },
    "resume": {
        "kind": "html",
        "english": "resume-en.html",
        "chinese": "resume.html",
    },
    "slides": {
        "kind": "slides",
        "english": "slides-en.mjs",
        "chinese": "slides.mjs",
    },
    "diagram-architecture": {
        "kind": "diagram",
        "english": "architecture.html",
        "chinese": "architecture.html",
    },
    "diagram-flowchart": {
        "kind": "diagram",
        "english": "flowchart.html",
        "chinese": "flowchart.html",
    },
    "diagram-quadrant": {
        "kind": "diagram",
        "english": "quadrant.html",
        "chinese": "quadrant.html",
    },
}


def copy_open_fonts(destination: Path) -> list[str]:
    destination.mkdir(parents=True, exist_ok=True)
    copied: list[str] = []
    for font_path in sorted(FONTS.glob("*")):
        target = destination / font_path.name
        shutil.copy2(font_path, target)
        copied.append(target.name)
    return copied


def write_readme(project_dir: Path, document: str, language: str, kind: str, source_rel: str) -> None:
    output_ext = "pdf" if kind in {"html", "diagram"} else "pptx"
    render_script = ROOT / "scripts" / "render_html.py"
    slides_script = ROOT / "scripts" / "render_slides.mjs"
    lines = [
        "# Kami Project",
        "",
        f"- document: `{document}`",
        f"- language: `{language}`",
        f"- kind: `{kind}`",
        f"- source: `{source_rel}`",
        "",
        "Suggested commands:",
    ]
    if kind in {"html", "diagram"}:
        lines.extend(
            [
                "",
                "```bash",
                f"python3 \"{render_script}\" \"{source_rel}\" \"outputs/{Path(source_rel).stem}.{output_ext}\"",
                "```",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "```bash",
                f'node "{slides_script}" --source "{source_rel}" --output-dir "outputs" --format pptx',
                "```",
            ]
        )
    (project_dir / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def scaffold(project_dir: Path, document: str, language: str) -> dict[str, object]:
    spec = DOCUMENT_MAP.get(document)
    if not spec:
        raise SystemExit(f"Unsupported document type: {document}")
    if language not in {"english", "chinese"}:
        raise SystemExit(f"Unsupported language: {language}")

    project_dir.mkdir(parents=True, exist_ok=True)
    outputs_dir = project_dir / "outputs"
    outputs_dir.mkdir(exist_ok=True)
    fonts_dir = project_dir / "fonts"
    copied_fonts = copy_open_fonts(fonts_dir)

    file_name = spec[language]
    kind = str(spec["kind"])
    if kind == "html":
        source_dir = project_dir / "templates"
        source_path = source_dir / file_name
        source_dir.mkdir(exist_ok=True)
        shutil.copy2(TEMPLATES / file_name, source_path)
    elif kind == "slides":
        source_dir = project_dir / "templates"
        source_path = source_dir / file_name
        source_dir.mkdir(exist_ok=True)
        shutil.copy2(TEMPLATES / file_name, source_path)
    else:
        source_dir = project_dir / "diagrams"
        source_path = source_dir / file_name
        source_dir.mkdir(exist_ok=True)
        shutil.copy2(DIAGRAMS / file_name, source_path)

    manifest = {
        "document": document,
        "language": language,
        "kind": kind,
        "source": str(source_path.relative_to(project_dir)),
        "outputs_dir": "outputs",
        "fonts": copied_fonts,
    }
    (project_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_readme(project_dir, document, language, kind, manifest["source"])
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Scaffold a workspace-local Kami project.")
    parser.add_argument("--project-dir", required=True, help="Workspace-relative or absolute project directory")
    parser.add_argument("--document", required=True, choices=sorted(DOCUMENT_MAP.keys()))
    parser.add_argument("--language", required=True, choices=["english", "chinese"])
    args = parser.parse_args()

    project_dir = Path(args.project_dir).expanduser()
    if not project_dir.is_absolute():
        project_dir = (Path.cwd() / project_dir).resolve()
    else:
        project_dir = project_dir.resolve()

    manifest = scaffold(project_dir, args.document, args.language)
    print(json.dumps({"project_dir": str(project_dir), **manifest}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

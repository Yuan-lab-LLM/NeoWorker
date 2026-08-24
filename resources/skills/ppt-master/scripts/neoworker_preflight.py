#!/usr/bin/env python3
"""Check the bundled PPT Master core without mutating the environment."""

from __future__ import annotations

import importlib.util
import json
import platform
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REQUIRED_PATHS = (
    "SKILL.md",
    "LICENSE",
    "workflows/routing.md",
    "workflows/generate-pptx.md",
    "scripts/attribution_guard.py",
    "scripts/pptx_delivery_check.py",
)
OPTIONAL_MODULES = (
    "pptx",
    "openpyxl",
    "PIL",
    "lxml",
    "cairosvg",
)


def main() -> int:
    missing_paths = [item for item in REQUIRED_PATHS if not (ROOT / item).is_file()]
    modules = {
        name: importlib.util.find_spec(name) is not None for name in OPTIONAL_MODULES
    }
    report = {
        "status": "failed" if missing_paths else "ready",
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "skill_root": str(ROOT),
        "missing_required_paths": missing_paths,
        "optional_modules": modules,
        "packaging": {
            "heavy_comparison_gallery": False,
            "bundled_icon_corpus": False,
            "bundled_sound_corpus": False,
        },
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if missing_paths else 0


if __name__ == "__main__":
    raise SystemExit(main())

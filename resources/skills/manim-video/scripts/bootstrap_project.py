#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path


MODE_SCENES = {
    "auto": ["Hook", "Intuition", "Reveal", "Outro"],
    "concept-explainer": ["Hook", "Intuition", "Formalize", "Outro"],
    "equation-derivation": ["Hook", "Setup", "Derivation", "Conclusion"],
    "algorithm-visualization": ["Hook", "StateSetup", "Execution", "Conclusion"],
    "data-story": ["Hook", "Baseline", "Comparison", "Takeaway"],
    "architecture-diagram": ["Hook", "Components", "Connections", "ScaleOut"],
    "paper-explainer": ["Hook", "Problem", "Method", "Result"],
    "3d-visualization": ["Hook", "BuildShape", "RotateReveal", "Outro"],
}


def slugify(value: str) -> str:
    cleaned = []
    last_dash = False
    for char in value.lower():
        if char.isalnum():
            cleaned.append(char)
            last_dash = False
        elif not last_dash:
            cleaned.append("-")
            last_dash = True
    result = "".join(cleaned).strip("-")
    return result or "manim-video-project"


def write_text(path: Path, content: str, force: bool) -> bool:
    if path.exists() and not force:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.rstrip() + "\n", encoding="utf-8")
    return True


def make_plan(title: str, mode: str, audience: str, length_seconds: int, voiceover: str, scene_names: list[str]) -> str:
    scene_blocks = []
    per_scene = max(8, length_seconds // max(1, len(scene_names)))
    for index, scene in enumerate(scene_names, start=1):
        scene_blocks.append(
            f"""## Scene {index}: {scene} (~{per_scene}s)
**Purpose**: TODO
**Primary visual**: TODO
**Key motion**: TODO
**Subtitle / voiceover beat**: TODO
**Exit condition**: TODO
"""
        )

    return f"""# {title}

## Overview

- Topic: {title}
- Mode: {mode}
- Audience: {audience}
- Target runtime: {length_seconds}s
- Voiceover: {voiceover}
- Hook: TODO
- Aha moment: TODO

## Visual Language

- Background: #111827
- Primary: #60A5FA
- Secondary: #34D399
- Accent: #FBBF24
- Font: Menlo

## Narrative Arc

1. Hook
2. Build intuition
3. Reveal structure
4. Close with implication

{chr(10).join(scene_blocks)}
## Review Checklist

- Is each scene teaching one idea?
- Does every reveal get breathing room?
- Is the equation earned by the animation?
- Can the draft be rendered scene-by-scene?
"""


def make_script(title: str, scene_names: list[str]) -> str:
    lines = [
        "from manim import *",
        "",
        'BG = "#111827"',
        'PRIMARY = "#60A5FA"',
        'SECONDARY = "#34D399"',
        'ACCENT = "#FBBF24"',
        'MUTED = "#94A3B8"',
        'FONT = "Menlo"',
        "",
        "",
        "def clear_scene(scene: Scene) -> None:",
        "    if scene.mobjects:",
        "        scene.play(FadeOut(VGroup(*scene.mobjects)), run_time=0.4)",
        "",
        "",
    ]

    for index, scene_name in enumerate(scene_names, start=1):
        class_name = f"Scene{index:02d}{scene_name}"
        scene_title = title if index == 1 else scene_name.replace("Out", "Out ")
        lines.extend(
            [
                f"class {class_name}(Scene):",
                "    def construct(self):",
                "        self.camera.background_color = BG",
                f'        title = Text("{scene_title}", font=FONT, font_size=42, color=PRIMARY)',
                '        note = Text("TODO: replace scaffold content with the real beat.", font=FONT, font_size=24, color=MUTED)',
                "        note.next_to(title, DOWN, buff=0.5)",
                "        self.play(Write(title), run_time=1.2)",
                "        self.play(FadeIn(note, shift=UP * 0.2), run_time=0.7)",
                "        self.wait(0.8)",
                "        clear_scene(self)",
                "        self.wait(0.2)",
                "",
                "",
            ]
        )
    return "\n".join(lines)


def make_concat(scene_names: list[str]) -> str:
    return "\n".join(
        [f"file 'media/videos/script/480p15/Scene{index:02d}{scene}.mp4'" for index, scene in enumerate(scene_names, start=1)]
    )


def make_render(scene_names: list[str]) -> str:
    classes = " ".join([f"Scene{index:02d}{scene}" for index, scene in enumerate(scene_names, start=1)])
    first_scene = f"Scene01{scene_names[0]}"
    return f"""#!/usr/bin/env bash
set -euo pipefail

mode="${{1:-draft}}"

case "$mode" in
  draft)
    python3 -m manim -ql script.py {classes}
    ;;
  production)
    python3 -m manim -qh script.py {classes}
    ;;
  still)
    target="${{2:-{first_scene}}}"
    python3 -m manim -ql -s script.py "$target"
    ;;
  *)
    echo "Usage: bash render.sh [draft|production|still <SceneClass>]" >&2
    exit 1
    ;;
esac
"""


def make_voiceover(scene_names: list[str]) -> str:
    blocks = []
    for index, scene in enumerate(scene_names, start=1):
        blocks.append(f"## Scene {index}: {scene}\n\n- Narration: TODO\n- Sync note: TODO\n")
    return "\n".join(blocks)


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap a Manim video project")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--mode", default="auto")
    parser.add_argument("--audience", default="curious technical audience")
    parser.add_argument("--length-seconds", type=int, default=60)
    parser.add_argument("--voiceover", default="auto")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    project_dir = Path(args.project_dir).expanduser()
    if not project_dir.is_absolute():
        project_dir = Path.cwd() / project_dir
    project_dir.mkdir(parents=True, exist_ok=True)

    mode = args.mode if args.mode in MODE_SCENES else "auto"
    scene_names = MODE_SCENES[mode]

    created = []
    if write_text(project_dir / "plan.md", make_plan(args.title, mode, args.audience, args.length_seconds, args.voiceover, scene_names), args.force):
        created.append("plan.md")
    if write_text(project_dir / "script.py", make_script(args.title, scene_names), args.force):
        created.append("script.py")
    if write_text(project_dir / "concat.txt", make_concat(scene_names), args.force):
        created.append("concat.txt")
    if write_text(project_dir / "render.sh", make_render(scene_names), args.force):
        created.append("render.sh")
    render_script = project_dir / "render.sh"
    if render_script.exists():
        render_script.chmod(0o755)
    if args.voiceover != "off" and write_text(project_dir / "voiceover.md", make_voiceover(scene_names), args.force):
        created.append("voiceover.md")

    slug = slugify(args.title)
    print(f"project_dir={project_dir}")
    print(f"project_slug={slug}")
    print("created=" + ",".join(created))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

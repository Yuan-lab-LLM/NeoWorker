# Manim Video Guidance

## What Makes This Better Than A Plain Skill Import

- It starts with environment verification instead of assuming Manim already works.
- It generates a workspace-local project skeleton so the run leaves usable files behind.
- It separates project deliverables from run artifacts, which makes review and reruns easier.
- It treats draft rendering as the default and production rendering as an explicit final step.

## Use Manim When

- The core idea benefits from geometry, state changes, or exact programmatic timing.
- The subject is mathematical, algorithmic, structural, or data-driven.
- The user wants a clean, reproducible technical explainer instead of timeline-based video editing.

## Avoid Manim When

- The request is mostly live footage, character animation, or cinematic compositing.
- The output is static or can be communicated better as a diagram, slide, or screenshot.
- The user needs quick social-video editing more than precise technical animation.

## Working Contract

Every run should leave behind:

- `plan.md`: narrative arc, scene list, visual language, pacing notes
- `script.py`: one `Scene` subclass per beat, shared constants at the top
- `concat.txt`: ordered scene clip list
- `render.sh`: draft and production render commands
- optional `voiceover.md`: narration beats aligned to scenes

Every run artifact should leave behind:

- `project-manifest.md`: where the project lives and what changed
- `render-checklist.md`: exact commands, dependency state, review gate
- `review-notes.md`: risks, polish tasks, and what still needs human eyes

## Narrative Rubric

Default arc:

1. Hook: a question, contrast, or surprising result
2. Build intuition: show the shape or state change before the formula
3. Formalize: introduce notation, labels, or algorithm steps only after the visual anchor exists
4. Reveal: the key transformation or conclusion
5. Extend: implication, edge case, or closing summary

Alternate arcs:

- Problem -> failed attempt -> insight -> working solution
- Compare A vs B -> contrast -> verdict
- Build-up -> components -> interactions -> full system view

## Scene Design Rules

- One idea per scene. Split instead of overloading.
- Use no more than five or six simultaneously salient elements.
- Set `self.camera.background_color` in every scene.
- Use shared constants for colors, font size, and motion timing.
- Prefer monospace `Text`; keep equations in `MathTex` raw strings.
- Follow key reveals with `self.wait()` so the viewer can absorb them.
- Clean the scene before exit with a group fade-out unless you intentionally carry an element forward.

## Visual Language

Suggested default palette:

- Background: `#111827`
- Primary: `#60A5FA`
- Secondary: `#34D399`
- Accent: `#FBBF24`
- Quiet line/grid: `#94A3B8`

Timing defaults:

- Title reveal: `run_time=1.2`, then `self.wait(0.8)`
- Core reveal: `run_time=1.8`, then `self.wait(1.5)`
- Supporting annotation: `run_time=0.7`, then `self.wait(0.4)`
- Cleanup: `run_time=0.4`

Typography defaults:

- Title: 44-52
- Section heading: 32-38
- Body/explainer text: 24-30
- Labels: 18-24

## Implementation Pattern

Minimal structure:

```python
from manim import *

BG = "#111827"
PRIMARY = "#60A5FA"
SECONDARY = "#34D399"
ACCENT = "#FBBF24"
MUTED = "#94A3B8"
FONT = "Menlo"


class Scene01Hook(Scene):
    def construct(self):
        self.camera.background_color = BG
        title = Text("Why Gradient Descent Works", font=FONT, font_size=46, color=PRIMARY)
        self.play(Write(title), run_time=1.2)
        self.wait(0.8)
        self.play(FadeOut(title), run_time=0.4)
```

Rules for `script.py`:

- Keep shared constants at the top.
- Name scenes predictably: `Scene01Hook`, `Scene02Intuition`, `Scene03Reveal`.
- Use helper functions only if they remove real repetition.
- Keep each scene independently renderable.
- Prefer `ReplacementTransform` or `TransformMatchingTex` over stacking new text on top of old text.

## Planning Checklist For `plan.md`

- Topic and target audience
- Hook
- Aha moment
- Mode
- Target runtime
- Palette and typography choices
- Scene list with duration targets
- Visual inventory for each scene
- Narration notes if voiceover is enabled
- What the final frame should leave in memory

## Render Flow

1. Run `bash scripts/setup.sh`
2. Render draft quality first
3. Review stills or draft video
4. Fix clarity and pacing issues
5. Render production quality only after the draft passes review

Suggested commands:

```bash
bash render.sh draft
bash render.sh still Scene02Intuition
bash render.sh production
```

## Review Gate

Before calling a scene done, verify:

- The scene is readable without pausing every frame.
- The viewer can tell what changed and why.
- Colors are consistent and intentional.
- Text never collides with geometry.
- The scene exits cleanly.
- Draft render works before production render is attempted.

## Common Good Defaults

- Iterate at 480p or 720p first.
- Keep total runtime short unless the user asks for a long explainer.
- If the topic is dense, reduce scope instead of cramming.
- If narration exists, let animation lead and voiceover reinforce, not duplicate every pixel.

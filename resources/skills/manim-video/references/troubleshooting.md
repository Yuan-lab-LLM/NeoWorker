# Manim Video Troubleshooting

## Setup Failures

### `python3` missing or too old

- Require Python 3.10 or newer.
- On macOS, prefer Homebrew Python if the system Python is outdated.

### `import manim` fails

- Install in the active environment: `python3 -m pip install manim`
- If pip build dependencies fail, install Cairo/Pango toolchain first, then retry.

### No LaTeX engine found

- Install a TeX distribution with `pdflatex` and `dvisvgm`.
- On macOS, `mactex-no-gui` is the practical path.
- On Linux, use a TeX Live package set that includes `pdflatex` and `dvisvgm`.

### `ffmpeg` missing

- Install `ffmpeg` and rerun `bash scripts/setup.sh`.

## Render Failures

### LaTeX parse errors in `MathTex`

- Use raw strings: `MathTex(r\"\\frac{a}{b}\")`
- Strip unsupported LaTeX macros before assuming Manim is broken.

### Animating an object that is not on screen yet

- Create or add the mobject before using `.animate`.
- If the first appearance is the animation itself, use `Create`, `Write`, or `FadeIn`.

### Text overlaps geometry

- Reduce visible element count.
- Use `next_to`, `to_edge`, and `arrange` with explicit buffers.
- Split the scene if the layout still feels cramped.

### Scene feels rushed

- Increase `self.wait()` after the reveal, not just the animation duration.
- Remove one competing motion instead of slowing everything evenly.

### Draft render works but production is too slow

- Keep polishing at draft quality.
- Render only the target scene while iterating.
- Move to production only after the narrative and layout are stable.

## Debug Moves

- Render one scene at a time.
- Use a still render for layout debugging before rerendering animation.
- Confirm the generated `concat.txt` matches the actual scene names.
- If a scene is unstable, simplify it before adding polish back.

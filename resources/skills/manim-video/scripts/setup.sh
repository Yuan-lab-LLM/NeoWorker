#!/usr/bin/env bash
set -euo pipefail

GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

ok() {
  printf "  ${GREEN}+${RESET} %s\n" "$1"
}

warn() {
  printf "  ${YELLOW}!${RESET} %s\n" "$1"
}

fail() {
  printf "  ${RED}x${RESET} %s\n" "$1"
}

platform="$(uname -s)"
errors=0
warnings=0

printf "\nManim Video Skill - Setup Check\n\n"

if command -v python3 >/dev/null 2>&1; then
  py_version="$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
  py_ok="$(python3 - <<'PY'
import sys
print("yes" if sys.version_info >= (3, 10) else "no")
PY
)"
  if [ "$py_ok" = "yes" ]; then
    ok "Python ${py_version}"
  else
    fail "Python ${py_version} is too old; require Python 3.10+"
    errors=$((errors + 1))
  fi
else
  fail "python3 not found"
  errors=$((errors + 1))
fi

if python3 -c "import manim" >/dev/null 2>&1; then
  manim_version="$(python3 -m manim --version 2>/dev/null | head -n 1 || true)"
  if [ -n "$manim_version" ]; then
    ok "${manim_version}"
  else
    ok "Manim import check passed"
  fi
else
  fail "Manim not installed in the active Python environment ('python3 -m pip install manim')"
  errors=$((errors + 1))
fi

if command -v ffmpeg >/dev/null 2>&1; then
  ok "ffmpeg $(ffmpeg -version 2>/dev/null | head -n 1)"
else
  fail "ffmpeg not found"
  errors=$((errors + 1))
fi

latex_engine=""
for candidate in pdflatex xelatex lualatex; do
  if command -v "$candidate" >/dev/null 2>&1; then
    latex_engine="$candidate"
    break
  fi
done

if [ -n "$latex_engine" ]; then
  ok "LaTeX engine: ${latex_engine}"
else
  fail "No LaTeX engine found ('pdflatex', 'xelatex', or 'lualatex')"
  errors=$((errors + 1))
fi

if command -v dvisvgm >/dev/null 2>&1; then
  ok "dvisvgm"
else
  warn "dvisvgm not found; some MathTex renders may fail depending on TeX setup"
  warnings=$((warnings + 1))
fi

case "$platform" in
  Darwin)
    warn "macOS install hints: brew install python ffmpeg && brew install --cask mactex-no-gui"
    warnings=$((warnings + 1))
    ;;
  Linux)
    warn "Linux install hints: python3.10+, ffmpeg, TeX Live with pdflatex + dvisvgm"
    warnings=$((warnings + 1))
    ;;
  *)
    warn "Platform ${platform} is untested for this skill"
    warnings=$((warnings + 1))
    ;;
esac

printf "\n"
if [ "$errors" -eq 0 ]; then
  printf "${GREEN}All required prerequisites satisfied.${RESET}\n"
else
  printf "${RED}%s required prerequisite(s) missing.${RESET}\n" "$errors"
fi

if [ "$warnings" -gt 0 ]; then
  printf "${YELLOW}%s warning(s) noted above.${RESET}\n" "$warnings"
fi
printf "\n"

if [ "$errors" -ne 0 ]; then
  exit 1
fi

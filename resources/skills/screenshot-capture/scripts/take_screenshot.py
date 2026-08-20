#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def timestamp() -> str:
    return dt.datetime.now().strftime("%Y-%m-%d %H.%M.%S")


def default_filename(system: str) -> str:
    if system == "Darwin":
        return f"Screen Shot {timestamp()}.png"
    return f"Screenshot {timestamp()}.png"


def default_directory(system: str, mode: str) -> Path:
    if mode == "temp":
        return Path(tempfile.gettempdir())
    if system == "Darwin":
        return Path.home() / "Desktop"
    return Path.home() / "Pictures" / "Screenshots"


def normalize_path(path: str | None, system: str, mode: str) -> Path:
    if path:
        out = Path(path).expanduser()
    else:
        out = default_directory(system, mode) / default_filename(system)
    if out.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        out = out.with_suffix(".png")
    out.parent.mkdir(parents=True, exist_ok=True)
    return out


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def run_capture(cmd: list[str]) -> None:
    run(cmd)


def run_osascript(script: str) -> str:
    proc = subprocess.run(
        ["osascript", "-l", "JavaScript", "-e", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout.strip()


def list_windows(app_filter: str | None = None) -> list[dict[str, object]]:
    app_filter = (app_filter or "").strip()
    script = f"""
ObjC.import('CoreGraphics');
var opts = $.kCGWindowListOptionOnScreenOnly | $.kCGWindowListExcludeDesktopElements;
var info = $.CGWindowListCopyWindowInfo(opts, $.kCGNullWindowID);
var windows = JSON.parse(ObjC.deepUnwrap ? JSON.stringify(ObjC.deepUnwrap(info)) : JSON.stringify(info));
if (!Array.isArray(windows)) {{
  windows = [];
}}
var filterText = {json.dumps(app_filter)};
var result = windows
  .filter(function (w) {{
    var owner = String(w.kCGWindowOwnerName || '');
    var title = String(w.kCGWindowName || '');
    var layer = Number(w.kCGWindowLayer || 0);
    if (layer !== 0) return false;
    if (!owner) return false;
    if (filterText && owner.toLowerCase().indexOf(filterText.toLowerCase()) === -1) return false;
    return true;
  }})
  .map(function (w) {{
    return {{
      id: Number(w.kCGWindowNumber || 0),
      owner: String(w.kCGWindowOwnerName || ''),
      title: String(w.kCGWindowName || ''),
      layer: Number(w.kCGWindowLayer || 0),
      bounds: w.kCGWindowBounds || null,
    }};
  }});
console.log(JSON.stringify(result));
"""
    output = run_osascript(script)
    if not output:
        return []
    data = json.loads(output)
    return data if isinstance(data, list) else []


def frontmost_app_name() -> str:
    script = 'tell application "System Events" to get name of first application process whose frontmost is true'
    proc = subprocess.run(["osascript", "-e", script], check=True, capture_output=True, text=True)
    return proc.stdout.strip()


def capture_macos(output: Path, args: argparse.Namespace) -> list[Path]:
    if args.list_windows:
        windows = list_windows(args.app)
        if args.window_name:
            needle = args.window_name.lower()
            windows = [w for w in windows if needle in str(w.get("title", "")).lower()]
        for window in windows:
            title = str(window.get("title", "")) or "(untitled)"
            print(f'{window["id"]}\t{window["owner"]}\t{title}')
        return []

    if args.window_id is not None:
        run_capture(["/usr/sbin/screencapture", "-x", f"-l{args.window_id}", str(output)])
        return [output]

    if args.region:
        run_capture(["/usr/sbin/screencapture", "-x", f"-R{args.region}", str(output)])
        return [output]

    if args.app or args.window_name or args.active_window:
        app_filter = args.app
        if args.active_window and not app_filter:
            app_filter = frontmost_app_name()

        windows = list_windows(app_filter)
        if args.window_name:
            needle = args.window_name.lower()
            windows = [w for w in windows if needle in str(w.get("title", "")).lower()]

        if not windows:
            target = app_filter or args.window_name or "requested target"
            raise SystemExit(f"No matching windows found for {target!r}. Run --list-windows and retry with --window-id.")

        captured_paths: list[Path] = []
        for index, window in enumerate(windows):
            window_id = int(window.get("id", 0))
            if window_id <= 0:
                continue
            if len(windows) == 1:
                destination = output
            else:
                suffix = f"-w{window_id}"
                destination = output.with_name(f"{output.stem}{suffix}{output.suffix}")
            run_capture(["/usr/sbin/screencapture", "-x", f"-l{window_id}", str(destination)])
            captured_paths.append(destination)

        return captured_paths

    run_capture(["/usr/sbin/screencapture", "-x", str(output)])
    return [output]


def capture_linux(output: Path, args: argparse.Namespace) -> list[Path]:
    if args.list_windows:
        raise SystemExit("--list-windows is macOS-only.")
    if args.app or args.window_name:
        raise SystemExit("--app and --window-name are macOS-only. Use --active-window or --window-id on Linux.")

    scrot = shutil.which("scrot")
    gnome_screenshot = shutil.which("gnome-screenshot")
    import_cmd = shutil.which("import")

    if args.region:
        if scrot:
            run_capture([scrot, "-a", args.region, str(output)])
            return [output]
        if import_cmd:
            x, y, w, h = args.region.split(",")
            geometry = f"{w}x{h}+{x}+{y}"
            run_capture([import_cmd, "-window", "root", "-crop", geometry, str(output)])
            return [output]
        raise SystemExit("Region capture requires scrot or ImageMagick import.")

    if args.window_id is not None and import_cmd:
        run_capture([import_cmd, "-window", str(args.window_id), str(output)])
        return [output]

    if args.active_window:
        if scrot:
            run_capture([scrot, "-u", str(output)])
            return [output]
        if gnome_screenshot:
            run_capture([gnome_screenshot, "-w", "-f", str(output)])
            return [output]
        if import_cmd:
            run_capture([import_cmd, "-window", "root", str(output)])
            return [output]
        raise SystemExit("Active window capture requires scrot, gnome-screenshot, or import.")

    if scrot:
        run_capture([scrot, str(output)])
        return [output]
    if gnome_screenshot:
        run_capture([gnome_screenshot, "-f", str(output)])
        return [output]
    if import_cmd:
        run_capture([import_cmd, "-window", "root", str(output)])
        return [output]

    raise SystemExit("Install scrot, gnome-screenshot, or ImageMagick import to capture screenshots on Linux.")


def capture_windows(output: Path, args: argparse.Namespace) -> list[Path]:
    raise SystemExit(
        "Use the PowerShell helper on Windows: powershell -ExecutionPolicy Bypass -File <path-to-skill>/scripts/take_screenshot.ps1",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture screenshots for NeoWorker.")
    parser.add_argument("--mode", choices=["default", "temp"], default="default")
    parser.add_argument("--path")
    parser.add_argument("--app")
    parser.add_argument("--window-name")
    parser.add_argument("--list-windows", action="store_true")
    parser.add_argument("--window-id", type=int)
    parser.add_argument("--region")
    parser.add_argument("--active-window", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    system = platform.system()
    output = normalize_path(args.path, system, args.mode)

    if system == "Darwin":
        paths = capture_macos(output, args)
    elif system == "Linux":
        paths = capture_linux(output, args)
    elif system == "Windows":
        paths = capture_windows(output, args)
    else:
        raise SystemExit(f"Unsupported platform: {system}")

    for path in paths:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

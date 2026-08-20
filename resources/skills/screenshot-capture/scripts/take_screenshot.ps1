param(
  [ValidateSet("default", "temp")]
  [string]$Mode = "default",

  [string]$Path,

  [string]$Region,

  [switch]$ActiveWindow,

  [int]$WindowHandle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$script:Native = @"
using System;
using System.Runtime.InteropServices;

public static class NativeMethods {
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}

[StructLayout(LayoutKind.Sequential)]
public struct RECT {
  public int Left;
  public int Top;
  public int Right;
  public int Bottom;
}
"@

Add-Type -TypeDefinition $script:Native

function Get-DefaultOutputDirectory {
  param([string]$CurrentMode)

  if ($CurrentMode -eq "temp") {
    return [System.IO.Path]::GetTempPath()
  }

  $pictures = [Environment]::GetFolderPath("MyPictures")
  $screenshots = Join-Path $pictures "Screenshots"
  if (-not (Test-Path $screenshots)) {
    New-Item -ItemType Directory -Path $screenshots -Force | Out-Null
  }
  return $screenshots
}

function Get-DefaultFilename {
  $stamp = Get-Date -Format "yyyy-MM-dd HH.mm.ss"
  return "Screenshot $stamp.png"
}

function Resolve-OutputPath {
  param(
    [string]$ExplicitPath,
    [string]$CurrentMode
  )

  if ($ExplicitPath) {
    $resolved = [System.IO.Path]::GetFullPath($ExplicitPath)
  } else {
    $resolved = Join-Path (Get-DefaultOutputDirectory -CurrentMode $CurrentMode) (Get-DefaultFilename)
  }

  $dir = Split-Path -Parent $resolved
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  if ([System.IO.Path]::GetExtension($resolved) -eq "") {
    $resolved = "$resolved.png"
  }

  return $resolved
}

function Capture-Rectangle {
  param(
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [string]$OutputPath
  )

  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($X, $Y, 0, 0, $bitmap.Size)
    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Capture-Window {
  param(
    [IntPtr]$Handle,
    [string]$OutputPath
  )

  $rect = New-Object RECT
  if (-not [NativeMethods]::GetWindowRect($Handle, [ref]$rect)) {
    throw "Unable to read the window bounds."
  }

  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -le 0 -or $height -le 0) {
    throw "The target window has invalid bounds."
  }

  Capture-Rectangle -X $rect.Left -Y $rect.Top -Width $width -Height $height -OutputPath $OutputPath
}

$outputPath = Resolve-OutputPath -ExplicitPath $Path -CurrentMode $Mode

if ($Region) {
  $parts = $Region.Split(",")
  if ($parts.Count -ne 4) {
    throw "Region must be x,y,w,h"
  }
  $x = [int]$parts[0]
  $y = [int]$parts[1]
  $w = [int]$parts[2]
  $h = [int]$parts[3]
  Capture-Rectangle -X $x -Y $y -Width $w -Height $h -OutputPath $outputPath
  Write-Output $outputPath
  exit 0
}

if ($PSBoundParameters.ContainsKey("WindowHandle")) {
  Capture-Window -Handle ([IntPtr]$WindowHandle) -OutputPath $outputPath
  Write-Output $outputPath
  exit 0
}

if ($ActiveWindow) {
  $handle = [NativeMethods]::GetForegroundWindow()
  if ($handle -eq [IntPtr]::Zero) {
    throw "No active window found."
  }
  Capture-Window -Handle $handle -OutputPath $outputPath
  Write-Output $outputPath
  exit 0
}

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
Capture-Rectangle -X $bounds.X -Y $bounds.Y -Width $bounds.Width -Height $bounds.Height -OutputPath $outputPath
Write-Output $outputPath

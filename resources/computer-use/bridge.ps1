$ErrorActionPreference = "Stop"

Add-Type -ReferencedAssemblies @("System.Drawing", "System.Windows.Forms") -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class WinComputerUse {
  private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [StructLayout(LayoutKind.Sequential)]
  private struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct INPUT {
    public int type;
    public InputUnion U;
  }

  [StructLayout(LayoutKind.Explicit)]
  private struct InputUnion {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct HARDWAREINPUT {
    public uint uMsg;
    public ushort wParamL;
    public ushort wParamH;
  }

  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")] private static extern short VkKeyScan(char ch);
  [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hWnd, uint gaFlags);

  private const int INPUT_MOUSE = 0;
  private const int INPUT_KEYBOARD = 1;
  private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  private const uint MOUSEEVENTF_LEFTUP = 0x0004;
  private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
  private const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
  private const uint MOUSEEVENTF_WHEEL = 0x0800;
  private const uint MOUSEEVENTF_HWHEEL = 0x1000;
  private const uint KEYEVENTF_KEYUP = 0x0002;
  private const uint KEYEVENTF_UNICODE = 0x0004;
  private const int SW_RESTORE = 9;
  private const uint GA_ROOT = 2;

  public static Dictionary<string, object> CheckPermissions() {
    return new Dictionary<string, object> {
      {"accessibility", true},
      {"screenRecording", true}
    };
  }

  public static List<Dictionary<string, object>> ListApps() {
    Dictionary<int, Dictionary<string, object>> apps = new Dictionary<int, Dictionary<string, object>>();
    IntPtr foreground = GetForegroundWindow();
    EnumWindows(delegate(IntPtr hwnd, IntPtr lparam) {
      if (!IsCandidateWindow(hwnd)) return true;
      uint rawPid;
      GetWindowThreadProcessId(hwnd, out rawPid);
      int pid = unchecked((int)rawPid);
      if (pid <= 0 || apps.ContainsKey(pid)) return true;
      string name = "Unknown App";
      try { name = Process.GetProcessById(pid).ProcessName; } catch {}
      apps[pid] = new Dictionary<string, object> {
        {"appName", name},
        {"pid", pid},
        {"isFrontmost", hwnd == foreground}
      };
      return true;
    }, IntPtr.Zero);
    return new List<Dictionary<string, object>>(apps.Values);
  }

  public static List<Dictionary<string, object>> ListWindows(int pid) {
    List<Dictionary<string, object>> windows = new List<Dictionary<string, object>>();
    IntPtr foreground = GetForegroundWindow();
    IntPtr main = IntPtr.Zero;
    try { main = Process.GetProcessById(pid).MainWindowHandle; } catch {}
    EnumWindows(delegate(IntPtr hwnd, IntPtr lparam) {
      if (!IsWindow(hwnd)) return true;
      uint rawPid;
      GetWindowThreadProcessId(hwnd, out rawPid);
      if (unchecked((int)rawPid) != pid) return true;
      RECT rect;
      if (!GetWindowRect(hwnd, out rect)) return true;
      int width = Math.Max(0, rect.Right - rect.Left);
      int height = Math.Max(0, rect.Bottom - rect.Top);
      if (width <= 0 || height <= 0) return true;
      string title = GetTitle(hwnd);
      bool visible = IsWindowVisible(hwnd);
      bool minimized = IsIconic(hwnd);
      windows.Add(new Dictionary<string, object> {
        {"windowId", hwnd.ToInt64()},
        {"title", title},
        {"framePoints", new Dictionary<string, object> {
          {"x", rect.Left},
          {"y", rect.Top},
          {"w", width},
          {"h", height}
        }},
        {"scaleFactor", 1},
        {"isMinimized", minimized},
        {"isOnscreen", visible && !minimized},
        {"isMain", main != IntPtr.Zero && hwnd == main},
        {"isFocused", hwnd == foreground}
      });
      return true;
    }, IntPtr.Zero);
    return windows;
  }

  public static Dictionary<string, object> GetFrontmost() {
    IntPtr hwnd = GetForegroundWindow();
    if (hwnd == IntPtr.Zero) throw new Exception("window_not_found: No foreground window is available.");
    uint rawPid;
    GetWindowThreadProcessId(hwnd, out rawPid);
    int pid = unchecked((int)rawPid);
    string appName = "Unknown App";
    try { appName = Process.GetProcessById(pid).ProcessName; } catch {}
    return new Dictionary<string, object> {
      {"appName", appName},
      {"pid", pid},
      {"windowTitle", GetTitle(hwnd)},
      {"windowId", hwnd.ToInt64()}
    };
  }

  public static Dictionary<string, object> Screenshot(long windowId) {
    IntPtr hwnd = new IntPtr(windowId);
    ActivateWindow(windowId);
    RequireForeground(hwnd);
    RECT rect = RequireWindowRect(hwnd);
    int width = rect.Right - rect.Left;
    int height = rect.Bottom - rect.Top;
    using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
    using (Graphics graphics = Graphics.FromImage(bitmap))
    using (MemoryStream stream = new MemoryStream()) {
      graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
      bitmap.Save(stream, ImageFormat.Png);
      return new Dictionary<string, object> {
        {"pngBase64", Convert.ToBase64String(stream.ToArray())},
        {"width", width},
        {"height", height},
        {"scaleFactor", 1}
      };
    }
  }

  public static void ActivateWindow(long windowId) {
    IntPtr hwnd = new IntPtr(windowId);
    if (!IsWindow(hwnd)) throw new Exception("window_not_found: The target window no longer exists.");
    if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE);
    SetForegroundWindow(hwnd);
    for (int i = 0; i < 10; i++) {
      Thread.Sleep(50);
      if (IsForegroundWindow(hwnd)) return;
      SetForegroundWindow(hwnd);
    }
    throw new Exception("window_not_foreground: Could not bring the target window to the foreground safely.");
  }

  public static void ActivateProcess(int pid) {
    List<Dictionary<string, object>> windows = ListWindows(pid);
    if (windows.Count == 0) throw new Exception("window_not_found: No visible window is available for the target process.");
    Dictionary<string, object> chosen = windows[0];
    foreach (Dictionary<string, object> candidate in windows) {
      if (candidate.ContainsKey("isFocused") && (bool)candidate["isFocused"]) { chosen = candidate; break; }
      if (candidate.ContainsKey("isMain") && (bool)candidate["isMain"]) { chosen = candidate; }
    }
    ActivateWindow(Convert.ToInt64(chosen["windowId"]));
  }

  public static void MouseClick(long windowId, double x, double y, string button, int clickCount) {
    Point p = ToScreenPoint(windowId, x, y);
    ActivateWindow(windowId);
    if (button == "back" || button == "forward") {
      throw new Exception("unsupported_button: Windows computer use does not support back/forward mouse buttons yet.");
    }
    SetCursorPos(p.X, p.Y);
    uint down = MOUSEEVENTF_LEFTDOWN;
    uint up = MOUSEEVENTF_LEFTUP;
    if (button == "right") { down = MOUSEEVENTF_RIGHTDOWN; up = MOUSEEVENTF_RIGHTUP; }
    if (button == "wheel") { down = MOUSEEVENTF_MIDDLEDOWN; up = MOUSEEVENTF_MIDDLEUP; }
    int count = Math.Max(1, clickCount);
    for (int i = 0; i < count; i++) {
      MouseInput(down, 0);
      MouseInput(up, 0);
      Thread.Sleep(60);
    }
  }

  public static void MouseMove(long windowId, double x, double y) {
    Point p = ToScreenPoint(windowId, x, y);
    SetCursorPos(p.X, p.Y);
  }

  public static void MouseDrag(long windowId, double[][] path) {
    if (path == null || path.Length < 2) throw new Exception("invalid_args: Drag requires at least two points.");
    Point first = ToScreenPoint(windowId, path[0][0], path[0][1]);
    ActivateWindow(windowId);
    SetCursorPos(first.X, first.Y);
    MouseInput(MOUSEEVENTF_LEFTDOWN, 0);
    Thread.Sleep(50);
    for (int i = 1; i < path.Length; i++) {
      Point next = ToScreenPoint(windowId, path[i][0], path[i][1]);
      SetCursorPos(next.X, next.Y);
      Thread.Sleep(20);
    }
    MouseInput(MOUSEEVENTF_LEFTUP, 0);
  }

  public static void ScrollAtPoint(long windowId, double x, double y, int scrollX, int scrollY) {
    Point p = ToScreenPoint(windowId, x, y);
    ActivateWindow(windowId);
    SetCursorPos(p.X, p.Y);
    if (scrollY != 0) MouseInput(MOUSEEVENTF_WHEEL, unchecked((uint)(scrollY * 120)));
    if (scrollX != 0) MouseInput(MOUSEEVENTF_HWHEEL, unchecked((uint)(scrollX * 120)));
  }

  public static void TypeText(long windowId, string text) {
    ActivateWindow(windowId);
    foreach (char ch in text ?? "") {
      if (ch == '\n') {
        SendVk(0x0D, false);
        SendVk(0x0D, true);
      } else {
        SendUnicode(ch, false);
        SendUnicode(ch, true);
      }
      Thread.Sleep(2);
    }
  }

  public static void KeyPress(long windowId, string keyText, string[] modifiers) {
    ActivateWindow(windowId);
    List<ushort> mods = new List<ushort>();
    if (modifiers != null) {
      foreach (string mod in modifiers) {
        ushort vk = ModifierToVk(mod);
        if (vk != 0) mods.Add(vk);
      }
    }
    ushort key = KeyToVk(keyText);
    foreach (ushort mod in mods) SendVk(mod, false);
    SendVk(key, false);
    SendVk(key, true);
    for (int i = mods.Count - 1; i >= 0; i--) SendVk(mods[i], true);
  }

  public static Dictionary<string, object> FalseResult(string reason) {
    return new Dictionary<string, object> {
      {"pressed", false},
      {"focused", false},
      {"exists", false},
      {"found", false},
      {"reason", reason}
    };
  }

  private static bool IsCandidateWindow(IntPtr hwnd) {
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return false;
    RECT rect;
    if (!GetWindowRect(hwnd, out rect)) return false;
    if ((rect.Right - rect.Left) <= 0 || (rect.Bottom - rect.Top) <= 0) return false;
    return GetTitle(hwnd).Trim().Length > 0;
  }

  private static string GetTitle(IntPtr hwnd) {
    StringBuilder sb = new StringBuilder(512);
    GetWindowText(hwnd, sb, sb.Capacity);
    return sb.ToString();
  }

  private static RECT RequireWindowRect(IntPtr hwnd) {
    if (!IsWindow(hwnd)) throw new Exception("window_not_found: The target window no longer exists.");
    if (IsIconic(hwnd)) throw new Exception("window_minimized: Windows computer use requires the target window to be visible and non-minimized.");
    RECT rect;
    if (!GetWindowRect(hwnd, out rect)) throw new Exception("window_not_found: Could not read the target window bounds.");
    if ((rect.Right - rect.Left) <= 0 || (rect.Bottom - rect.Top) <= 0) {
      throw new Exception("screenshot_failed: The target window has empty bounds.");
    }
    return rect;
  }

  private static Point ToScreenPoint(long windowId, double x, double y) {
    RECT rect = RequireWindowRect(new IntPtr(windowId));
    return new Point(rect.Left + (int)Math.Round(x), rect.Top + (int)Math.Round(y));
  }

  private static bool IsForegroundWindow(IntPtr hwnd) {
    IntPtr foreground = GetForegroundWindow();
    if (foreground == IntPtr.Zero) return false;
    if (foreground == hwnd) return true;
    return GetAncestor(foreground, GA_ROOT) == hwnd;
  }

  private static void RequireForeground(IntPtr hwnd) {
    if (!IsForegroundWindow(hwnd)) {
      throw new Exception("window_not_foreground: Refusing to capture or act because the target window is not foreground.");
    }
  }

  private static void MouseInput(uint flags, uint data) {
    INPUT input = new INPUT();
    input.type = INPUT_MOUSE;
    input.U.mi = new MOUSEINPUT { dx = 0, dy = 0, mouseData = data, dwFlags = flags, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  private static void SendVk(ushort vk, bool up) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki = new KEYBDINPUT { wVk = vk, wScan = 0, dwFlags = up ? KEYEVENTF_KEYUP : 0, time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  private static void SendUnicode(char ch, bool up) {
    INPUT input = new INPUT();
    input.type = INPUT_KEYBOARD;
    input.U.ki = new KEYBDINPUT { wVk = 0, wScan = ch, dwFlags = KEYEVENTF_UNICODE | (up ? KEYEVENTF_KEYUP : 0), time = 0, dwExtraInfo = IntPtr.Zero };
    SendInput(1, new INPUT[] { input }, Marshal.SizeOf(typeof(INPUT)));
  }

  private static ushort ModifierToVk(string key) {
    string lower = (key ?? "").Trim().ToLowerInvariant();
    if (lower == "ctrl" || lower == "control") return 0x11;
    if (lower == "shift") return 0x10;
    if (lower == "alt" || lower == "option") return 0x12;
    if (lower == "win" || lower == "windows" || lower == "cmd" || lower == "command") return 0x5B;
    return 0;
  }

  private static ushort KeyToVk(string key) {
    string lower = (key ?? "").Trim().ToLowerInvariant();
    if (lower == "return" || lower == "enter") return 0x0D;
    if (lower == "escape" || lower == "esc") return 0x1B;
    if (lower == "tab") return 0x09;
    if (lower == "space") return 0x20;
    if (lower == "backspace") return 0x08;
    if (lower == "delete") return 0x2E;
    if (lower == "up") return 0x26;
    if (lower == "down") return 0x28;
    if (lower == "left") return 0x25;
    if (lower == "right") return 0x27;
    if (lower == "home") return 0x24;
    if (lower == "end") return 0x23;
    if (lower == "pageup") return 0x21;
    if (lower == "pagedown") return 0x22;
    if (lower.Length >= 2 && lower[0] == 'f') {
      int n;
      if (Int32.TryParse(lower.Substring(1), out n) && n >= 1 && n <= 24) return (ushort)(0x70 + n - 1);
    }
    if (lower.Length == 1) {
      char ch = lower[0];
      if (ch >= 'a' && ch <= 'z') return (ushort)Char.ToUpperInvariant(ch);
      if (ch >= '0' && ch <= '9') return (ushort)ch;
      short vk = VkKeyScan(ch);
      if (vk != -1) return (ushort)(vk & 0xff);
    }
    throw new Exception("invalid_args: Could not resolve key '" + key + "'.");
  }
}
"@

function Write-BridgeResponse {
  param(
    [string]$Id,
    [bool]$Ok,
    [object]$Result,
    [string]$Message,
    [string]$Code
  )

  if ($Ok) {
    $payload = @{ id = $Id; ok = $true; result = $Result }
  } else {
    $payload = @{ id = $Id; ok = $false; error = @{ message = $Message; code = $Code } }
  }
  [Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress -Depth 12))
  [Console]::Out.Flush()
}

function Get-ErrorCode {
  param([string]$Message)
  if ($Message -match "(^|[^a-z_])([a-z]+(?:_[a-z]+)+):") { return $Matches[2] }
  return "internal_error"
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $id = "invalid"
  try {
    $request = $line | ConvertFrom-Json
    if ($request.id) { $id = [string]$request.id }
    switch ([string]$request.cmd) {
      "checkPermissions" { $result = [WinComputerUse]::CheckPermissions() }
      "openPermissionPane" { $result = @{ opened = $false; reason = "Windows does not expose macOS-style computer-use permission panes." } }
      "listApps" { $result = [WinComputerUse]::ListApps() }
      "listWindows" { $result = [WinComputerUse]::ListWindows([int]$request.pid) }
      "getFrontmost" { $result = [WinComputerUse]::GetFrontmost() }
      "screenshot" { $result = [WinComputerUse]::Screenshot([long]$request.windowId) }
      "activateApp" { [WinComputerUse]::ActivateProcess([int]$request.pid); $result = @{} }
      "raiseWindow" { [WinComputerUse]::ActivateWindow([long]$request.windowId); $result = @{} }
      "unminimizeWindow" { [WinComputerUse]::ActivateWindow([long]$request.windowId); $result = @{} }
      "mouseClick" { [WinComputerUse]::MouseClick([long]$request.windowId, [double]$request.x, [double]$request.y, [string]$request.button, [int]$request.clickCount); $result = @{} }
      "mouseMove" { [WinComputerUse]::MouseMove([long]$request.windowId, [double]$request.x, [double]$request.y); $result = @{} }
      "mouseDrag" {
        $points = @()
        foreach ($point in @($request.path)) {
          $points += ,([double[]]@([double]$point.x, [double]$point.y))
        }
        [WinComputerUse]::MouseDrag([long]$request.windowId, [double[][]]$points)
        $result = @{}
      }
      "scrollAtPoint" { [WinComputerUse]::ScrollAtPoint([long]$request.windowId, [double]$request.x, [double]$request.y, [int]$request.scrollX, [int]$request.scrollY); $result = @{} }
      "typeText" { [WinComputerUse]::TypeText([long]$request.windowId, [string]$request.text); $result = @{} }
      "keyPress" { [WinComputerUse]::KeyPress([long]$request.windowId, [string]$request.keyText, [string[]]@($request.modifiers)); $result = @{} }
      "axPressAtPoint" { $result = [WinComputerUse]::FalseResult("Windows provider uses SendInput for click actions.") }
      "axFocusAtPoint" { $result = [WinComputerUse]::FalseResult("Windows provider uses SendInput for focus actions.") }
      "axDescribeAtPoint" { $result = @{} }
      "axFindTextInput" { $result = [WinComputerUse]::FalseResult("Windows UI Automation text targeting is not available in this helper path.") }
      "axFocusTextInput" { $result = [WinComputerUse]::FalseResult("Windows UI Automation text targeting is not available in this helper path.") }
      "axFindFocusableElement" { $result = [WinComputerUse]::FalseResult("Windows UI Automation focus targeting is not available in this helper path.") }
      "axFindActionableElement" { $result = [WinComputerUse]::FalseResult("Windows UI Automation action targeting is not available in this helper path.") }
      "focusedElement" { $result = [WinComputerUse]::FalseResult("Windows provider types through the active window focus.") }
      "setValue" { $result = @{} }
      default { throw "unknown_command: Unknown command '$($request.cmd)'" }
    }
    Write-BridgeResponse -Id $id -Ok $true -Result $result
  } catch {
    $message = $_.Exception.Message
    Write-BridgeResponse -Id $id -Ok $false -Message $message -Code (Get-ErrorCode $message)
  }
}

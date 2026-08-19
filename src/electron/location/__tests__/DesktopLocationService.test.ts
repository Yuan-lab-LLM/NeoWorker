import { describe, expect, it, vi } from "vitest";
import {
  DesktopLocationError,
  DesktopLocationService,
  LinuxGeoClueProvider,
  MacOSCoreLocationProvider,
  type NativeLocationProvider,
  WindowsLocationProvider,
} from "../DesktopLocationService";

describe("DesktopLocationService", () => {
  it("uses the first available native provider", async () => {
    const unavailableProvider: NativeLocationProvider = {
      name: "unavailable",
      isAvailable: vi.fn().mockResolvedValue(false),
      getCurrentLocation: vi.fn(),
    };
    const availableProvider: NativeLocationProvider = {
      name: "macos_core_location",
      isAvailable: vi.fn().mockResolvedValue(true),
      getCurrentLocation: vi.fn().mockResolvedValue({
        latitude: 40.1,
        longitude: -73.2,
        accuracyMeters: 10,
        timestamp: Date.parse("2026-05-20T12:00:00Z"),
        source: "macos_core_location",
      }),
    };

    const result = await new DesktopLocationService([
      unavailableProvider,
      availableProvider,
    ]).getCurrentLocation({ accuracy: "precise" });

    expect(result.source).toBe("macos_core_location");
    expect(unavailableProvider.getCurrentLocation).not.toHaveBeenCalled();
    expect(availableProvider.getCurrentLocation).toHaveBeenCalledWith({ accuracy: "precise" });
  });

  it("reports unsupported platforms when no native provider is available", async () => {
    const service = new DesktopLocationService([]);

    await expect(service.getCurrentLocation()).rejects.toThrow(
      /not implemented yet|not supported|not built or bundled/,
    );
  });
});

describe("MacOSCoreLocationProvider", () => {
  it("is available only on macOS when the helper exists", async () => {
    const provider = new MacOSCoreLocationProvider({
      platform: "darwin",
      helperPath: "/helper",
      existsSync: (candidate) => candidate === "/helper",
    });

    await expect(provider.isAvailable()).resolves.toBe(true);

    const linuxProvider = new MacOSCoreLocationProvider({
      platform: "linux",
      helperPath: "/helper",
      existsSync: () => true,
    });
    await expect(linuxProvider.isAvailable()).resolves.toBe(false);
  });

  it("parses native helper success output", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        ok: true,
        location: {
          latitude: 40.1,
          longitude: -73.2,
          accuracyMeters: 12,
          timestamp: Date.parse("2026-05-20T12:00:00Z"),
          source: "macos_core_location",
        },
      }),
      stderr: "",
    });
    const provider = new MacOSCoreLocationProvider({
      platform: "darwin",
      helperPath: "/helper",
      existsSync: () => true,
      runner,
      tmpdir: () => "/tmp",
      unlinkSync: vi.fn(),
    });
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await provider.getCurrentLocation({ accuracy: "coarse", timeoutMs: 5000 });

    expect(result).toEqual({
      latitude: 40.1,
      longitude: -73.2,
      accuracyMeters: 12,
      timestamp: Date.parse("2026-05-20T12:00:00Z"),
      source: "macos_core_location",
    });
    expect(runner).toHaveBeenCalledWith(
      "/helper",
      [
        "--accuracy",
        "coarse",
        "--timeout-ms",
        "5000",
        "--response-file",
        expect.stringMatching(/^\/tmp\/neoworker-location-/),
      ],
      expect.objectContaining({ timeout: 6000 }),
    );
    vi.restoreAllMocks();
  });

  it("launches bundled macOS helper as an app bundle and reads response file output", async () => {
    const response = JSON.stringify({
      ok: true,
      location: {
        latitude: 40.1,
        longitude: -73.2,
        accuracyMeters: 12,
        timestamp: Date.parse("2026-05-20T12:00:00Z"),
        source: "macos_core_location",
      },
    });
    const runner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const unlinkSync = vi.fn();
    const provider = new MacOSCoreLocationProvider({
      platform: "darwin",
      existsSync: (candidate) =>
        candidate === "/app/build/location-helper-macos/NeoWorkerLocationHelper.app" ||
        candidate.startsWith("/tmp/neoworker-location-"),
      runner,
      readFileSync: vi.fn(() => response) as Any,
      unlinkSync,
      tmpdir: () => "/tmp",
    });
    const cwd = vi.spyOn(process, "cwd").mockReturnValue("/app");
    vi.spyOn(Date, "now").mockReturnValue(456);
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const result = await provider.getCurrentLocation({ accuracy: "precise", timeoutMs: 7000 });

    expect(result.source).toBe("macos_core_location");
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/open",
      [
        "-W",
        "-n",
        "/app/build/location-helper-macos/NeoWorkerLocationHelper.app",
        "--args",
        "--accuracy",
        "precise",
        "--timeout-ms",
        "7000",
        "--response-file",
        expect.stringMatching(/^\/tmp\/neoworker-location-/),
      ],
      expect.objectContaining({ timeout: 10000 }),
    );
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/neoworker-location-/));
    cwd.mockRestore();
    vi.restoreAllMocks();
  });

  it("parses native helper denial errors", async () => {
    const runner = vi.fn().mockRejectedValue({
      stdout: JSON.stringify({
        ok: false,
        error: {
          code: "LOCATION_DENIED",
          message: "Location access was denied by macOS.",
        },
      }),
    });
    const provider = new MacOSCoreLocationProvider({
      platform: "darwin",
      helperPath: "/helper",
      existsSync: () => true,
      runner,
    });

    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_DENIED",
      message: "Location access was denied by macOS.",
    });
  });

  it("fails fast when the macOS helper is missing", async () => {
    const provider = new MacOSCoreLocationProvider({
      platform: "darwin",
      helperPath: "/missing-helper",
      existsSync: () => false,
    });

    await expect(provider.getCurrentLocation()).rejects.toBeInstanceOf(DesktopLocationError);
    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_NOT_CONFIGURED",
    });
  });
});

describe("WindowsLocationProvider", () => {
  it("is available only on win32 when the helper exists", async () => {
    const provider = new WindowsLocationProvider({
      platform: "win32",
      helperPath: "/helper.ps1",
      existsSync: (candidate) => candidate === "/helper.ps1",
    });
    await expect(provider.isAvailable()).resolves.toBe(true);

    const darwinProvider = new WindowsLocationProvider({
      platform: "darwin",
      helperPath: "/helper.ps1",
      existsSync: () => true,
    });
    await expect(darwinProvider.isAvailable()).resolves.toBe(false);
  });

  it("parses native helper success output", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        ok: true,
        location: {
          latitude: 47.6,
          longitude: -122.3,
          accuracyMeters: 50,
          timestamp: Date.parse("2026-05-20T12:00:00Z"),
          source: "windows_location",
        },
      }),
      stderr: "",
    });
    const provider = new WindowsLocationProvider({
      platform: "win32",
      helperPath: "/helper.ps1",
      existsSync: () => true,
      runner,
      tmpdir: () => "/tmp",
      unlinkSync: vi.fn(),
    });
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await provider.getCurrentLocation({ accuracy: "coarse", timeoutMs: 5000 });

    expect(result).toEqual({
      latitude: 47.6,
      longitude: -122.3,
      accuracyMeters: 50,
      timestamp: Date.parse("2026-05-20T12:00:00Z"),
      source: "windows_location",
    });
    expect(runner).toHaveBeenCalledWith(
      expect.stringContaining("powershell.exe"),
      expect.arrayContaining([
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "/helper.ps1",
        "--accuracy",
        "coarse",
        "--timeout-ms",
        "5000",
        "--response-file",
        expect.stringMatching(/^\/tmp\/neoworker-location-/),
      ]),
      expect.objectContaining({ timeout: 8000 }),
    );
    vi.restoreAllMocks();
  });

  it("parses denial errors", async () => {
    const runner = vi.fn().mockRejectedValue({
      stdout: JSON.stringify({
        ok: false,
        error: {
          code: "LOCATION_DENIED",
          message: "Location access was denied by Windows.",
        },
      }),
    });
    const provider = new WindowsLocationProvider({
      platform: "win32",
      helperPath: "/helper.ps1",
      existsSync: () => true,
      runner,
    });

    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_DENIED",
      message: "Location access was denied by Windows.",
    });
  });

  it("reads from response file when stdout is empty", async () => {
    const response = JSON.stringify({
      ok: true,
      location: {
        latitude: 47.6,
        longitude: -122.3,
        accuracyMeters: 50,
        timestamp: Date.parse("2026-05-20T12:00:00Z"),
        source: "windows_location",
      },
    });
    const runner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const unlinkSync = vi.fn();
    const provider = new WindowsLocationProvider({
      platform: "win32",
      helperPath: "/helper.ps1",
      existsSync: () => true,
      runner,
      readFileSync: vi.fn(() => response) as Any,
      unlinkSync,
      tmpdir: () => "/tmp",
    });
    vi.spyOn(Date, "now").mockReturnValue(456);
    vi.spyOn(Math, "random").mockReturnValue(0.25);

    const result = await provider.getCurrentLocation();

    expect(result.source).toBe("windows_location");
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/neoworker-location-/));
    vi.restoreAllMocks();
  });

  it("fails fast when the helper is missing", async () => {
    const provider = new WindowsLocationProvider({
      platform: "win32",
      helperPath: "/missing.ps1",
      existsSync: () => false,
    });

    await expect(provider.getCurrentLocation()).rejects.toBeInstanceOf(DesktopLocationError);
    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_NOT_CONFIGURED",
    });
  });
});

describe("LinuxGeoClueProvider", () => {
  it("is available only on linux when the helper exists", async () => {
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/helper.sh",
      existsSync: (candidate) => candidate === "/helper.sh",
    });
    await expect(provider.isAvailable()).resolves.toBe(true);

    const darwinProvider = new LinuxGeoClueProvider({
      platform: "darwin",
      helperPath: "/helper.sh",
      existsSync: () => true,
    });
    await expect(darwinProvider.isAvailable()).resolves.toBe(false);
  });

  it("parses native helper success output", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        ok: true,
        location: {
          latitude: 52.5,
          longitude: 13.4,
          accuracyMeters: 100,
          timestamp: Date.parse("2026-05-20T12:00:00Z"),
          source: "linux_geoclue",
        },
      }),
      stderr: "",
    });
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/helper.sh",
      existsSync: () => true,
      runner,
      tmpdir: () => "/tmp",
      unlinkSync: vi.fn(),
    });
    vi.spyOn(Date, "now").mockReturnValue(123);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await provider.getCurrentLocation({ accuracy: "precise", timeoutMs: 8000 });

    expect(result).toEqual({
      latitude: 52.5,
      longitude: 13.4,
      accuracyMeters: 100,
      timestamp: Date.parse("2026-05-20T12:00:00Z"),
      source: "linux_geoclue",
    });
    expect(runner).toHaveBeenCalledWith(
      "/bin/bash",
      [
        "/helper.sh",
        "--accuracy",
        "precise",
        "--timeout-ms",
        "8000",
        "--response-file",
        expect.stringMatching(/^\/tmp\/neoworker-location-/),
      ],
      expect.objectContaining({ timeout: 11000 }),
    );
    vi.restoreAllMocks();
  });

  it("parses denial errors", async () => {
    const runner = vi.fn().mockRejectedValue({
      stdout: JSON.stringify({
        ok: false,
        error: {
          code: "LOCATION_DENIED",
          message: "GeoClue2 denied location access.",
        },
      }),
    });
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/helper.sh",
      existsSync: () => true,
      runner,
    });

    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_DENIED",
      message: "GeoClue2 denied location access.",
    });
  });

  it("reads from response file when stdout is empty", async () => {
    const response = JSON.stringify({
      ok: true,
      location: {
        latitude: 52.5,
        longitude: 13.4,
        accuracyMeters: 100,
        timestamp: Date.parse("2026-05-20T12:00:00Z"),
        source: "linux_geoclue",
      },
    });
    const runner = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const unlinkSync = vi.fn();
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/helper.sh",
      existsSync: () => true,
      runner,
      readFileSync: vi.fn(() => response) as Any,
      unlinkSync,
      tmpdir: () => "/tmp",
    });
    vi.spyOn(Date, "now").mockReturnValue(789);
    vi.spyOn(Math, "random").mockReturnValue(0.75);

    const result = await provider.getCurrentLocation();

    expect(result.source).toBe("linux_geoclue");
    expect(unlinkSync).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/neoworker-location-/));
    vi.restoreAllMocks();
  });

  it("fails fast when the helper is missing", async () => {
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/missing.sh",
      existsSync: () => false,
    });

    await expect(provider.getCurrentLocation()).rejects.toBeInstanceOf(DesktopLocationError);
    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_NOT_CONFIGURED",
    });
  });

  it("reports not configured for missing gdbus via helper error envelope", async () => {
    const runner = vi.fn().mockRejectedValue({
      stdout: JSON.stringify({
        ok: false,
        error: {
          code: "LOCATION_NOT_CONFIGURED",
          message: "gdbus is not available. Install glib2 utilities for location support.",
        },
      }),
    });
    const provider = new LinuxGeoClueProvider({
      platform: "linux",
      helperPath: "/helper.sh",
      existsSync: () => true,
      runner,
    });

    await expect(provider.getCurrentLocation()).rejects.toMatchObject({
      code: "LOCATION_NOT_CONFIGURED",
      message: expect.stringContaining("gdbus"),
    });
  });
});

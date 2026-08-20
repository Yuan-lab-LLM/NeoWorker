import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppWindow,
  ChevronRight,
  CircleAlert,
  HardDrive,
  Laptop,
  Link2,
  Monitor,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import type { ManagedDevice, ManagedDeviceSummary } from "../../shared/types";
import { LOCAL_MANAGED_DEVICE_ID } from "../../shared/types";
import "./device-settings.css";
import { translate } from "../i18n/index";

type DeviceSettingsPanelProps = {
  onOpenRemoteAccess: () => void;
  onOpenIntegrations: () => void;
};

function formatBytes(value?: number): string {
  if (!value || !Number.isFinite(value) || value <= 0)
    return translate(
      "generated.components.devicesettingspanel.25.0",
      "Not reported",
    );
  const units = ["B", "KB", "MB", "GB", "TB"];
  let next = value;
  let index = 0;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  return `${next.toFixed(next >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function deviceStatus(device: ManagedDevice): {
  label: string;
  tone: "online" | "muted" | "alert";
} {
  if (device.role === "local" || device.status === "connected") {
    return {
      label:
        device.role === "local"
          ? translate(
              "generated.components.devicesettingspanel.38.1",
              "This machine is online",
            )
          : translate(
              "generated.components.devicesettingspanel.38.2",
              "Connected",
            ),
      tone: "online",
    };
  }
  if (device.status === "error")
    return {
      label: translate(
        "generated.components.devicesettingspanel.40.3",
        "Need to be processed",
      ),
      tone: "alert",
    };
  return {
    label: translate(
      "generated.components.devicesettingspanel.41.4",
      "Not connected",
    ),
    tone: "muted",
  };
}

export function DeviceSettingsPanel({
  onOpenRemoteAccess,
  onOpenIntegrations,
}: DeviceSettingsPanelProps) {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [summaries, setSummaries] = useState<
    Record<string, ManagedDeviceSummary>
  >({});
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDevices = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [listed, controlPlane] = await Promise.all([
        window.electronAPI?.listManagedDevices?.(),
        window.electronAPI?.getControlPlaneSettings?.(),
      ]);
      const nextDevices =
        listed?.ok && Array.isArray(listed.devices)
          ? (listed.devices as ManagedDevice[])
          : [];
      setDevices(nextDevices);
      setSelectedDeviceId((current) => {
        if (current && nextDevices.some((device) => device.id === current))
          return current;
        const configuredId = controlPlane?.activeManagedDeviceId;
        if (
          configuredId &&
          nextDevices.some((device) => device.id === configuredId)
        )
          return configuredId;
        return (
          nextDevices.find((device) => device.id === LOCAL_MANAGED_DEVICE_ID)
            ?.id ??
          nextDevices[0]?.id ??
          null
        );
      });

      const summaries = await Promise.all(
        nextDevices.map(async (device) => {
          try {
            const result = await window.electronAPI?.getDeviceSummary?.(
              device.id,
            );
            return result?.ok && result.summary
              ? ([device.id, result.summary] as const)
              : null;
          } catch {
            return null;
          }
        }),
      );
      setSummaries(
        Object.fromEntries(
          summaries.filter(
            (entry): entry is readonly [string, ManagedDeviceSummary] =>
              Boolean(entry),
          ),
        ),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  );
  const selectedSummary = selectedDevice
    ? summaries[selectedDevice.id]
    : undefined;
  const selectedStatus = selectedDevice ? deviceStatus(selectedDevice) : null;
  const firstAlert = selectedSummary?.alerts?.[0];

  const selectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void window.electronAPI?.saveControlPlaneSettings?.({
      activeManagedDeviceId: deviceId,
    });
  };

  if (loading) {
    return (
      <div className="device-settings-loading">
        {translate(
          "generated.components.devicesettingspanel.105.5",
          "Loading device and operating environment...",
        )}
      </div>
    );
  }

  return (
    <section
      className="device-settings-panel"
      aria-labelledby="device-settings-title"
    >
      <header className="device-settings-header">
        <div>
          <p className="device-settings-eyebrow">
            {translate(
              "generated.components.devicesettingspanel.112.6",
              "Operating environment",
            )}
          </p>
          <h2 id="device-settings-title">
            {translate(
              "generated.components.devicesettingspanel.113.7",
              "Equipment and operating environment",
            )}
          </h2>
          <p>
            {translate(
              "generated.components.devicesettingspanel.114.8",
              "Manage the connection, permissions and resource status of the local machine and remote devices to ensure stable operation of the agent.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="device-settings-refresh"
          onClick={() => void loadDevices(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={15}
            className={refreshing ? "is-spinning" : undefined}
          />
          {refreshing
            ? translate(
                "generated.components.devicesettingspanel.123.9",
                "Refreshing",
              )
            : translate(
                "generated.components.devicesettingspanel.123.10",
                "refresh status",
              )}
        </button>
      </header>

      <div className="device-settings-health" role="status">
        <span
          className={`device-settings-status-dot ${selectedStatus?.tone ?? "muted"}`}
        />
        <strong>
          {selectedStatus?.label ??
            translate(
              "generated.components.devicesettingspanel.129.11",
              "No device added yet",
            )}
        </strong>
        <span>
          {firstAlert
            ? firstAlert.title
            : translate(
                "generated.components.devicesettingspanel.130.12",
                "The device status will be updated synchronously here",
              )}
        </span>
      </div>

      <div className="device-settings-layout">
        <aside
          className="device-settings-device-list"
          aria-label={translate(
            "generated.components.devicesettingspanel.134.13",
            "Managed device",
          )}
        >
          <div className="device-settings-list-heading">
            <span>
              {translate(
                "generated.components.devicesettingspanel.136.14",
                "Managed device",
              )}
            </span>
            <span>{devices.length}</span>
          </div>
          {devices.length > 0 ? (
            devices.map((device) => {
              const status = deviceStatus(device);
              const selected = device.id === selectedDeviceId;
              return (
                <button
                  key={device.id}
                  type="button"
                  className={`device-settings-device-row ${selected ? "is-selected" : ""}`}
                  onClick={() => selectDevice(device.id)}
                >
                  {device.role === "local" ? (
                    <Laptop size={19} />
                  ) : (
                    <Monitor size={19} />
                  )}
                  <span>
                    <strong>
                      {device.role === "local"
                        ? translate(
                            "generated.components.devicesettingspanel.151.15",
                            "native device",
                          )
                        : device.name}
                    </strong>
                    <small>
                      {device.role === "local"
                        ? translate(
                            "generated.components.devicesettingspanel.152.16",
                            "Native operating environment",
                          )
                        : device.transport ||
                          translate(
                            "generated.components.devicesettingspanel.152.17",
                            "remote device",
                          )}
                    </small>
                  </span>
                  <i className={status.tone} aria-label={status.label} />
                </button>
              );
            })
          ) : (
            <p className="device-settings-empty">
              {translate(
                "generated.components.devicesettingspanel.158.18",
                "There are no devices to manage yet.",
              )}
            </p>
          )}
          <button
            type="button"
            className="device-settings-add"
            onClick={onOpenRemoteAccess}
          >
            <Link2 size={16} />{" "}
            {translate(
              "generated.components.devicesettingspanel.161.19",
              "Pair a remote device",
            )}
          </button>
        </aside>

        <div className="device-settings-content">
          {selectedDevice ? (
            <>
              <section className="device-settings-identity">
                <span className="device-settings-machine-icon">
                  {selectedDevice.role === "local" ? (
                    <Laptop size={26} />
                  ) : (
                    <Monitor size={26} />
                  )}
                </span>
                <div>
                  <div className="device-settings-identity-title">
                    <h3>
                      {selectedDevice.role === "local"
                        ? translate(
                            "generated.components.devicesettingspanel.174.20",
                            "native device",
                          )
                        : selectedDevice.name}
                    </h3>
                    <span
                      className={`device-settings-badge ${selectedStatus?.tone}`}
                    >
                      {selectedStatus?.label}
                    </span>
                  </div>
                  <p>
                    {selectedDevice.platform || "macOS"} ·{" "}
                    {selectedDevice.transport ||
                      translate(
                        "generated.components.devicesettingspanel.177.21",
                        "Run locally",
                      )}
                  </p>
                </div>
              </section>

              <section className="device-settings-group">
                <div className="device-settings-group-heading">
                  <span className="device-settings-section-number">1</span>
                  <div>
                    <h3>
                      {translate(
                        "generated.components.devicesettingspanel.184.22",
                        "native device",
                      )}
                    </h3>
                    <p>
                      {translate(
                        "generated.components.devicesettingspanel.184.23",
                        "The current running environment used by the agent to perform tasks.",
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="device-settings-row"
                  onClick={() =>
                    navigator.clipboard?.writeText(selectedDevice.id)
                  }
                >
                  <Laptop size={18} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.devicesettingspanel.188.24",
                        "Device identification",
                      )}
                    </strong>
                    <small>{selectedDevice.id}</small>
                  </span>
                  <span className="device-settings-row-value">
                    {translate(
                      "generated.components.devicesettingspanel.189.25",
                      "Click to copy",
                    )}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </section>

              <section className="device-settings-group">
                <div className="device-settings-group-heading">
                  <span className="device-settings-section-number">2</span>
                  <div>
                    <h3>
                      {translate(
                        "generated.components.devicesettingspanel.196.26",
                        "Run permission",
                      )}
                    </h3>
                    <p>
                      {translate(
                        "generated.components.devicesettingspanel.196.27",
                        "Allows the agent to perform authorized work on this device.",
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="device-settings-row"
                  onClick={onOpenIntegrations}
                >
                  <AppWindow size={18} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.devicesettingspanel.200.28",
                        "Apps and Accounts",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.devicesettingspanel.200.29",
                        "Manage connectors, channels, and linked accounts",
                      )}
                    </small>
                  </span>
                  <span className="device-settings-row-value">
                    {translate(
                      "generated.components.devicesettingspanel.201.30",
                      "Go to management",
                    )}
                  </span>
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="device-settings-row"
                  onClick={onOpenRemoteAccess}
                >
                  <ShieldCheck size={18} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.devicesettingspanel.205.31",
                        "remote access",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.devicesettingspanel.205.32",
                        "Configure secure connections between remote devices",
                      )}
                    </small>
                  </span>
                  <span className="device-settings-row-value">
                    {translate(
                      "generated.components.devicesettingspanel.206.33",
                      "access control",
                    )}
                  </span>
                  <ChevronRight size={16} />
                </button>
              </section>

              <section className="device-settings-group">
                <div className="device-settings-group-heading">
                  <span className="device-settings-section-number">3</span>
                  <div>
                    <h3>
                      {translate(
                        "generated.components.devicesettingspanel.213.34",
                        "Storage and resources",
                      )}
                    </h3>
                    <p>
                      {translate(
                        "generated.components.devicesettingspanel.213.35",
                        "Check local resources to avoid affecting the continuous execution of tasks.",
                      )}
                    </p>
                  </div>
                </div>
                <div
                  className={`device-settings-row ${firstAlert ? "has-alert" : ""}`}
                >
                  <HardDrive size={18} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.devicesettingspanel.217.36",
                        "local storage",
                      )}
                    </strong>
                    <small>
                      {selectedSummary
                        ? translate(
                            "devices.storage.summary",
                            "{workspaces} workspaces · {artifacts} artifacts",
                            {
                              workspaces:
                                selectedSummary.storage.workspaceCount,
                              artifacts: selectedSummary.storage.artifactCount,
                            },
                          )
                        : translate(
                            "generated.components.devicesettingspanel.217.37",
                            "Storage summary has not been reported yet",
                          )}
                    </small>
                  </span>
                  <span className="device-settings-row-value">
                    {selectedSummary
                      ? formatBytes(selectedSummary.storage.freeBytes)
                      : "—"}
                  </span>
                </div>
                <div className="device-settings-row">
                  <Wifi size={18} />
                  <span>
                    <strong>
                      {translate(
                        "generated.components.devicesettingspanel.222.38",
                        "connection status",
                      )}
                    </strong>
                    <small>
                      {selectedDevice.role === "local"
                        ? translate(
                            "generated.components.devicesettingspanel.222.39",
                            "This device is running locally",
                          )
                        : translate(
                            "generated.components.devicesettingspanel.222.40",
                            "The remote connection status will be automatically refreshed",
                          )}
                    </small>
                  </span>
                  <span
                    className={`device-settings-row-value ${selectedStatus?.tone}`}
                  >
                    {selectedStatus?.label}
                  </span>
                </div>
                {firstAlert ? (
                  <p className="device-settings-alert">
                    <CircleAlert size={15} />
                    {firstAlert.title}
                  </p>
                ) : null}
              </section>

              <section className="device-settings-pairing">
                <span>
                  <PlugZap size={19} />
                </span>
                <div>
                  <strong>
                    {translate(
                      "generated.components.devicesettingspanel.230.41",
                      "Need to run a task on another device?",
                    )}
                  </strong>
                  <p>
                    {translate(
                      "generated.components.devicesettingspanel.230.42",
                      "Once you pair your remote device, you can use it securely from here.",
                    )}
                  </p>
                </div>
                <button type="button" onClick={onOpenRemoteAccess}>
                  {translate(
                    "generated.components.devicesettingspanel.231.43",
                    "Pairing devices",
                  )}
                  <ChevronRight size={16} />
                </button>
              </section>
            </>
          ) : (
            <div className="device-settings-empty-state">
              <Monitor size={28} />
              <h3>
                {translate(
                  "generated.components.devicesettingspanel.237.44",
                  "No device added yet",
                )}
              </h3>
              <p>
                {translate(
                  "generated.components.devicesettingspanel.238.45",
                  "Pair a remote device first, or complete the operating environment configuration locally.",
                )}
              </p>
              <button type="button" onClick={onOpenRemoteAccess}>
                {translate(
                  "generated.components.devicesettingspanel.239.46",
                  "Configure device",
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { MCPRegistryBrowser } from "./MCPRegistryBrowser";
import { ConnectorSetupModal, ConnectorProvider } from "./ConnectorSetupModal";
import { translate, useLanguage } from "../i18n";

// Types (matching preload types)
type MCPTransportType = "stdio" | "sse" | "websocket";
type MCPConnectionStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

interface MCPServerConfig {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: MCPTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  connectionTimeout?: number;
  requestTimeout?: number;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, Any>;
    required?: string[];
  };
}

interface MCPServerStatus {
  id: string;
  name: string;
  status: MCPConnectionStatus;
  error?: string;
  tools: MCPTool[];
  lastPing?: number;
}

interface MCPSettingsData {
  servers: MCPServerConfig[];
  autoConnect: boolean;
  toolNamePrefix: string;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
  registryEnabled: boolean;
  registryUrl?: string;
  hostEnabled: boolean;
  hostPort?: number;
}

interface MCPUpdateInfo {
  serverId: string;
  currentVersion: string;
  latestVersion: string;
}

const DEFAULT_MCP_SETTINGS: MCPSettingsData = {
  servers: [],
  autoConnect: false,
  toolNamePrefix: "mcp_",
  maxReconnectAttempts: 3,
  reconnectDelayMs: 1000,
  registryEnabled: true,
  registryUrl: "",
  hostEnabled: false,
  hostPort: 3333,
};

type SecureMcpTunnelTargetType = "neoworker-host" | "http";
type SecureMcpTunnelState =
  "stopped" | "connecting" | "connected" | "reconnecting" | "error";

interface SecureMcpTunnelPolicy {
  allowedTools: string[];
  readOnly: boolean;
  maxRequestBytes: number;
  maxResponseBytes: number;
  requestTimeoutMs: number;
}

interface SecureMcpTunnelConfig {
  id: string;
  name: string;
  enabled: boolean;
  relayUrl: string;
  targetType: SecureMcpTunnelTargetType;
  targetUrl?: string;
  neoworkerHostPort?: number;
  policy: SecureMcpTunnelPolicy;
  hasClientToken: boolean;
  hasCallerToken: boolean;
  lastConnectedAt?: number;
  lastError?: string;
}

interface SecureMcpTunnelStatus {
  tunnelId: string;
  name: string;
  state: SecureMcpTunnelState;
  relayUrl: string;
  targetUrl: string;
  connectedAt?: number;
  lastConnectedAt?: number;
  lastError?: string;
  reconnectAttempts: number;
  lastRequestAt?: number;
}

interface SecureMcpTunnelAuditEvent {
  id: string;
  tunnelId: string;
  timestamp: number;
  caller?: string;
  method: string;
  toolName?: string;
  approved: boolean;
  status: "success" | "blocked" | "error";
  durationMs?: number;
  error?: string;
}

export function MCPSettings() {
  useLanguage();
  const t = translate;
  const [settings, setSettings] = useState<MCPSettingsData | null>(null);
  const [serverStatuses, setServerStatuses] = useState<MCPServerStatus[]>([]);
  const [secureTunnels, setSecureTunnels] = useState<SecureMcpTunnelConfig[]>(
    [],
  );
  const [secureTunnelStatuses, setSecureTunnelStatuses] = useState<
    SecureMcpTunnelStatus[]
  >([]);
  const [secureTunnelAudit, setSecureTunnelAudit] = useState<
    SecureMcpTunnelAuditEvent[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<
    "servers" | "registry" | "tunnels" | "settings"
  >("servers");

  // Add server form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerCommand, setNewServerCommand] = useState("");
  const [newServerArgs, setNewServerArgs] = useState("");
  const [newServerEnv, setNewServerEnv] = useState("");
  const [showAddTunnelForm, setShowAddTunnelForm] = useState(false);
  const [newTunnelName, setNewTunnelName] = useState("NeoWorker tools");
  const [newTunnelRelayUrl, setNewTunnelRelayUrl] = useState(
    "http://127.0.0.1:8787",
  );
  const [newTunnelTargetType, setNewTunnelTargetType] =
    useState<SecureMcpTunnelTargetType>("neoworker-host");
  const [newTunnelTargetUrl, setNewTunnelTargetUrl] = useState(
    "http://127.0.0.1:3333/mcp",
  );
  const [newTunnelClientToken, setNewTunnelClientToken] = useState("");
  const [newTunnelCallerToken, setNewTunnelCallerToken] = useState("");
  const [newTunnelAllowedTools, setNewTunnelAllowedTools] = useState("");
  const [newTunnelReadOnly, setNewTunnelReadOnly] = useState(false);

  // Tools modal state
  const [viewingToolsFor, setViewingToolsFor] = useState<string | null>(null);
  const [serverTools, setServerTools] = useState<MCPTool[]>([]);

  // Test result
  const [testingServer, setTestingServer] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    serverId: string;
    success: boolean;
    error?: string;
    tools?: number;
  } | null>(null);

  // Connecting/disconnecting state
  const [connectingServer, setConnectingServer] = useState<string | null>(null);

  // Connection error state (shows errors inline instead of alerts)
  const [connectionErrors, setConnectionErrors] = useState<
    Record<string, string>
  >({});

  // Update state
  const [availableUpdates, setAvailableUpdates] = useState<MCPUpdateInfo[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingServer, setUpdatingServer] = useState<string | null>(null);

  // Connector setup modal state
  const [connectorSetup, setConnectorSetup] = useState<{
    provider: ConnectorProvider;
    serverId: string;
    serverName: string;
    env?: Record<string, string>;
  } | null>(null);

  // Edit server modal state
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [editServerArgs, setEditServerArgs] = useState("");
  const [editServerEnv, setEditServerEnv] = useState("");
  const [editServerPaths, setEditServerPaths] = useState<string[]>([]);

  useEffect(() => {
    loadData();

    // Subscribe to status changes
    const unsubscribe = window.electronAPI.onMCPStatusChange((statuses) => {
      setServerStatuses(statuses);
    });
    const unsubscribeTunnels = window.electronAPI.onSecureMcpTunnelStatusChange(
      (statuses) => {
        setSecureTunnelStatuses(statuses);
      },
    );

    return () => {
      unsubscribe();
      unsubscribeTunnels();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [
        loadedSettings,
        statuses,
        tunnelSettings,
        tunnelStatuses,
        tunnelAudit,
      ] = await Promise.all([
        window.electronAPI.getMCPSettings(),
        window.electronAPI.getMCPStatus(),
        window.electronAPI.getSecureMcpTunnelSettings(),
        window.electronAPI.getSecureMcpTunnelStatus(),
        window.electronAPI.getSecureMcpTunnelAudit(),
      ]);
      const nextSettings = loadedSettings || DEFAULT_MCP_SETTINGS;
      setSettings(nextSettings);
      setServerStatuses(statuses || []);
      setSecureTunnels(tunnelSettings?.tunnels || []);
      setSecureTunnelStatuses(tunnelStatuses || []);
      setSecureTunnelAudit(tunnelAudit || []);
    } catch (error) {
      console.error("Failed to load MCP settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async () => {
    if (!newServerName || !newServerCommand) return;

    try {
      setSaving(true);
      const args = newServerArgs
        ? newServerArgs.split(" ").filter((a) => a.trim())
        : [];
      const env: Record<string, string> = {};

      if (newServerEnv) {
        newServerEnv.split("\n").forEach((line) => {
          const [key, ...valueParts] = line.split("=");
          if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join("=").trim();
          }
        });
      }

      await window.electronAPI.addMCPServer({
        name: newServerName,
        transport: "stdio" as MCPTransportType,
        command: newServerCommand,
        args: args.length > 0 ? args : undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
        enabled: true,
      });

      // Reset form
      setNewServerName("");
      setNewServerCommand("");
      setNewServerArgs("");
      setNewServerEnv("");
      setShowAddForm(false);

      // Reload data
      await loadData();
    } catch (error: Any) {
      console.error("Failed to add server:", error);
      alert(
        t("mcp.error.addServer", "Failed to add server: {message}", {
          message: error.message,
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddTunnel = async () => {
    if (!newTunnelName || !newTunnelRelayUrl) return;
    try {
      setSaving(true);
      const allowedTools = newTunnelAllowedTools
        .split("\n")
        .map((tool) => tool.trim())
        .filter(Boolean);
      await window.electronAPI.createSecureMcpTunnel({
        name: newTunnelName,
        relayUrl: newTunnelRelayUrl,
        targetType: newTunnelTargetType,
        targetUrl:
          newTunnelTargetType === "http" ? newTunnelTargetUrl : undefined,
        neoworkerHostPort: 3333,
        clientToken: newTunnelClientToken || undefined,
        callerToken: newTunnelCallerToken || undefined,
        enabled: false,
        policy: {
          allowedTools,
          readOnly: newTunnelReadOnly,
        },
      });
      setShowAddTunnelForm(false);
      setNewTunnelClientToken("");
      setNewTunnelCallerToken("");
      await loadData();
    } catch (error: Any) {
      alert(`Failed to add tunnel: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStartTunnel = async (tunnelId: string) => {
    try {
      setSaving(true);
      await window.electronAPI.startSecureMcpTunnel(tunnelId);
      await loadData();
    } catch (error: Any) {
      alert(`Failed to start tunnel: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStopTunnel = async (tunnelId: string) => {
    try {
      setSaving(true);
      await window.electronAPI.stopSecureMcpTunnel(tunnelId);
      await loadData();
    } catch (error: Any) {
      alert(`Failed to stop tunnel: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveTunnel = async (tunnelId: string) => {
    if (
      !confirm(t("mcp.confirm.removeTunnel", "Remove this secure MCP tunnel?"))
    )
      return;
    try {
      await window.electronAPI.deleteSecureMcpTunnel(tunnelId);
      await loadData();
    } catch (error: Any) {
      alert(`Failed to remove tunnel: ${error.message}`);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    if (!confirm("Are you sure you want to remove this server?")) return;

    try {
      await window.electronAPI.removeMCPServer(serverId);
      await loadData();
    } catch (error: Any) {
      console.error("Failed to remove server:", error);
      alert(`Failed to remove server: ${error.message}`);
    }
  };

  const handleConnectServer = async (serverId: string) => {
    try {
      setConnectingServer(serverId);
      // Clear any previous error for this server
      setConnectionErrors((prev) => {
        const { [serverId]: _, ...rest } = prev;
        return rest;
      });
      await window.electronAPI.connectMCPServer(serverId);
    } catch (error: Any) {
      console.error("Failed to connect server:", error);
      // Store error in state for inline display
      setConnectionErrors((prev) => ({
        ...prev,
        [serverId]:
          error.message || t("mcp.error.connectionFailed", "Connection failed"),
      }));
    } finally {
      setConnectingServer(null);
    }
  };

  const handleDisconnectServer = async (serverId: string) => {
    try {
      setConnectingServer(serverId);
      // Clear any previous error for this server
      setConnectionErrors((prev) => {
        const { [serverId]: _, ...rest } = prev;
        return rest;
      });
      await window.electronAPI.disconnectMCPServer(serverId);
    } catch (error: Any) {
      console.error("Failed to disconnect server:", error);
      setConnectionErrors((prev) => ({
        ...prev,
        [serverId]:
          error.message || t("mcp.error.disconnectFailed", "Disconnect failed"),
      }));
    } finally {
      setConnectingServer(null);
    }
  };

  const handleTestServer = async (serverId: string) => {
    try {
      setTestingServer(serverId);
      setTestResult(null);
      const result = await window.electronAPI.testMCPServer(serverId);
      setTestResult({ serverId, ...result });
    } catch (error: Any) {
      setTestResult({ serverId, success: false, error: error.message });
    } finally {
      setTestingServer(null);
    }
  };

  const handleViewTools = async (serverId: string) => {
    try {
      const tools = await window.electronAPI.getMCPServerTools(serverId);
      setServerTools(tools);
      setViewingToolsFor(serverId);
    } catch (error) {
      console.error("Failed to get server tools:", error);
    }
  };

  const handleToggleEnabled = async (serverId: string, enabled: boolean) => {
    try {
      await window.electronAPI.updateMCPServer(serverId, { enabled });
      await loadData();
    } catch (error: Any) {
      console.error("Failed to update server:", error);
    }
  };

  const isFilesystemServer = (config: MCPServerConfig | undefined): boolean => {
    if (!config) return false;
    // Check if it's the filesystem server by command or name
    const commandMatch =
      config.command?.includes("server-filesystem") ||
      config.args?.some((arg) => arg.includes("server-filesystem"));
    const nameMatch = config.name?.toLowerCase() === "filesystem";
    return commandMatch || nameMatch;
  };

  const handleOpenEditServer = (serverId: string) => {
    const config = settings?.servers.find((s) => s.id === serverId);
    if (!config) return;

    // For Filesystem server, extract paths from args (after -y @modelcontextprotocol/server-filesystem)
    if (isFilesystemServer(config)) {
      const paths: string[] = [];
      const args = config.args || [];
      // Find paths - they come after the package name
      let foundPackage = false;
      for (const arg of args) {
        if (arg.includes("server-filesystem")) {
          foundPackage = true;
          continue;
        }
        if (foundPackage && arg.startsWith("/")) {
          paths.push(arg);
        }
      }
      setEditServerPaths(paths);
    } else {
      setEditServerPaths([]);
    }

    // Convert args array to space-separated string (excluding filesystem paths for that server)
    if (isFilesystemServer(config)) {
      // For filesystem server, only show non-path args
      const nonPathArgs = (config.args || []).filter(
        (arg) => !arg.startsWith("/") || arg.includes("server-filesystem"),
      );
      setEditServerArgs(nonPathArgs.join(" "));
    } else {
      setEditServerArgs(config.args?.join(" ") || "");
    }

    // Convert env object to KEY=VALUE format
    const envString = config.env
      ? Object.entries(config.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")
      : "";
    setEditServerEnv(envString);

    setEditingServer(serverId);
  };

  const handleSaveEditServer = async () => {
    if (!editingServer) return;

    try {
      const config = settings?.servers.find((s) => s.id === editingServer);

      // Parse args from space-separated string
      let args = editServerArgs
        ? editServerArgs.split(" ").filter((a) => a.trim())
        : [];

      // For Filesystem server, append the paths to args
      if (isFilesystemServer(config)) {
        args = [...args, ...editServerPaths];
      }

      // Parse env from KEY=VALUE format
      const env: Record<string, string> = {};
      if (editServerEnv) {
        editServerEnv.split("\n").forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) {
            const idx = trimmed.indexOf("=");
            if (idx > 0) {
              const key = trimmed.substring(0, idx).trim();
              const value = trimmed.substring(idx + 1).trim();
              env[key] = value;
            }
          }
        });
      }

      await window.electronAPI.updateMCPServer(editingServer, {
        args: args.length > 0 ? args : undefined,
        env: Object.keys(env).length > 0 ? env : undefined,
      });

      setEditingServer(null);
      await loadData();
    } catch (error: Any) {
      console.error("Failed to update server:", error);
      alert(`Failed to update server: ${error.message}`);
    }
  };

  const handleAddPath = async () => {
    try {
      const result = await window.electronAPI.selectFolder();
      if (result && !editServerPaths.includes(result)) {
        setEditServerPaths([...editServerPaths, result]);
      }
    } catch (error) {
      console.error("Failed to open folder picker:", error);
    }
  };

  const handleRemovePath = (pathToRemove: string) => {
    setEditServerPaths(editServerPaths.filter((p) => p !== pathToRemove));
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      await window.electronAPI.saveMCPSettings(settings);
    } catch (error: Any) {
      console.error("Failed to save settings:", error);
      alert(`Failed to save settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getConnectorProvider = (name?: string): ConnectorProvider | null => {
    if (!name) return null;
    const normalized = name.toLowerCase();
    if (normalized.includes("salesforce")) return "salesforce";
    if (normalized.includes("jira")) return "jira";
    if (normalized.includes("hubspot")) return "hubspot";
    if (normalized.includes("zendesk")) return "zendesk";
    return null;
  };

  const handleOpenConnectorSetup = (
    provider: ConnectorProvider,
    serverId: string,
    serverName: string,
    env?: Record<string, string>,
  ) => {
    setConnectorSetup({ provider, serverId, serverName, env });
  };

  const handleCheckUpdates = async () => {
    try {
      setCheckingUpdates(true);
      const updates = await window.electronAPI.checkMCPUpdates();
      setAvailableUpdates(updates);
      if (updates.length === 0) {
        alert("All MCP servers are up to date!");
      }
    } catch (error: Any) {
      console.error("Failed to check for updates:", error);
      alert(`Failed to check for updates: ${error.message}`);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleUpdateServer = async (serverId: string) => {
    try {
      setUpdatingServer(serverId);
      await window.electronAPI.updateMCPServerFromRegistry(serverId);
      // Remove from available updates
      setAvailableUpdates((prev) =>
        prev.filter((u) => u.serverId !== serverId),
      );
      // Reload data
      await loadData();
      alert("Server updated successfully!");
    } catch (error: Any) {
      console.error("Failed to update server:", error);
      alert(`Failed to update server: ${error.message}`);
    } finally {
      setUpdatingServer(null);
    }
  };

  const getUpdateInfo = (serverId: string): MCPUpdateInfo | undefined => {
    return availableUpdates.find((u) => u.serverId === serverId);
  };

  const getStatusColor = (status: MCPConnectionStatus): string => {
    switch (status) {
      case "connected":
        return "var(--color-success)";
      case "connecting":
      case "reconnecting":
        return "var(--color-warning)";
      case "error":
        return "var(--color-error)";
      default:
        return "var(--color-text-tertiary)";
    }
  };

  const getStatusText = (status: MCPConnectionStatus): string => {
    switch (status) {
      case "connected":
        return t("mcp.status.connected", "Connected");
      case "connecting":
        return t("mcp.status.connecting", "Connecting...");
      case "reconnecting":
        return t("mcp.status.reconnecting", "Reconnecting...");
      case "error":
        return t("mcp.status.error", "Error");
      default:
        return t("mcp.status.disconnected", "Disconnected");
    }
  };

  const getTunnelStatus = (
    tunnelId: string,
  ): SecureMcpTunnelStatus | undefined => {
    return secureTunnelStatuses.find((status) => status.tunnelId === tunnelId);
  };

  const getTunnelStatusColor = (state: SecureMcpTunnelState): string => {
    switch (state) {
      case "connected":
        return "var(--color-success)";
      case "connecting":
      case "reconnecting":
        return "var(--color-warning)";
      case "error":
        return "var(--color-error)";
      default:
        return "var(--color-text-tertiary)";
    }
  };

  if (loading) {
    return (
      <div className="settings-loading">
        {t("mcp.loading", "Loading MCP settings...")}
      </div>
    );
  }

  return (
    <div className="mcp-settings">
      {/* Sub-navigation */}
      <div className="mcp-settings-nav">
        <button
          className={`mcp-nav-button ${activeView === "servers" ? "active" : ""}`}
          onClick={() => setActiveView("servers")}
        >
          {t("mcp.nav.installed", "Installed")}
        </button>
        <button
          className={`mcp-nav-button ${activeView === "registry" ? "active" : ""}`}
          onClick={() => setActiveView("registry")}
        >
          {t("mcp.nav.registry", "Browse Registry")}
        </button>
        <button
          className={`mcp-nav-button ${activeView === "tunnels" ? "active" : ""}`}
          onClick={() => setActiveView("tunnels")}
        >
          {t("mcp.nav.tunnels", "Secure Tunnels")}
        </button>
        <button
          className={`mcp-nav-button ${activeView === "settings" ? "active" : ""}`}
          onClick={() => setActiveView("settings")}
        >
          {t("mcp.nav.settings", "Settings")}
        </button>
      </div>

      {activeView === "servers" && (
        <>
          <div className="settings-section mcp-view-section mcp-servers-section">
            <div className="settings-section-header mcp-view-header">
              <h3>{t("mcp.servers.title", "MCP Servers")}</h3>
              <div className="mcp-header-actions">
                <button
                  className="button-small button-secondary"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates}
                >
                  {checkingUpdates
                    ? t("mcp.action.checking", "Checking...")
                    : t("mcp.action.checkUpdates", "Check for Updates")}
                </button>
                <button
                  className="button-small button-primary"
                  onClick={() => setShowAddForm(!showAddForm)}
                >
                  {showAddForm
                    ? t("mcp.action.cancel", "Cancel")
                    : t("mcp.action.addServerPlus", "+ Add Server")}
                </button>
              </div>
            </div>
            <p className="settings-description">
              {t(
                "mcp.servers.description",
                "Connect to MCP servers to extend NeoWorker with additional tools. Tools from connected servers will be available to the AI agent.",
              )}
            </p>

            {showAddForm && (
              <div className="mcp-add-form">
                <h4>{t("mcp.addServer.title", "Add New MCP Server")}</h4>
                <div className="settings-field">
                  <label>{t("mcp.addServer.name", "Server Name")}</label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., Filesystem Server"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>{t("mcp.addServer.command", "Command")}</label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., npx -y @modelcontextprotocol/server-filesystem"
                    value={newServerCommand}
                    onChange={(e) => setNewServerCommand(e.target.value)}
                  />
                  <p className="settings-hint">
                    {t(
                      "mcp.addServer.commandHint",
                      "The command to start the MCP server",
                    )}
                  </p>
                </div>
                <div className="settings-field">
                  <label>
                    {t(
                      "mcp.addServer.arguments",
                      "Arguments (space-separated)",
                    )}
                  </label>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="e.g., /Users/me/Documents"
                    value={newServerArgs}
                    onChange={(e) => setNewServerArgs(e.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>
                    {t(
                      "mcp.addServer.env",
                      "Environment Variables (KEY=value, one per line)",
                    )}
                  </label>
                  <textarea
                    className="settings-textarea"
                    placeholder="API_KEY=xxx&#10;DEBUG=true"
                    value={newServerEnv}
                    onChange={(e) => setNewServerEnv(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="mcp-form-actions">
                  <button
                    className="button-primary"
                    onClick={handleAddServer}
                    disabled={!newServerName || !newServerCommand || saving}
                  >
                    {saving
                      ? t("mcp.action.adding", "Adding...")
                      : t("mcp.action.addServer", "Add Server")}
                  </button>
                </div>
              </div>
            )}

            {serverStatuses.length === 0 && !showAddForm ? (
              <div className="mcp-empty-state">
                <p>{t("mcp.empty.title", "No MCP servers configured.")}</p>
                <p className="settings-hint">
                  {t(
                    "mcp.empty.hint",
                    'Click "Add Server" to connect to an MCP server and extend NeoWorker capabilities.',
                  )}
                </p>
              </div>
            ) : (
              <div className="mcp-server-list">
                {serverStatuses.map((serverStatus) => {
                  const config = settings?.servers.find(
                    (s) => s.id === serverStatus.id,
                  );
                  const isConnecting = connectingServer === serverStatus.id;
                  const isTesting = testingServer === serverStatus.id;
                  const updateInfo = getUpdateInfo(serverStatus.id);
                  const isUpdating = updatingServer === serverStatus.id;
                  const connectorProvider = getConnectorProvider(
                    serverStatus.name,
                  );

                  return (
                    <div key={serverStatus.id} className="mcp-server-card">
                      <div className="mcp-server-header">
                        <div className="mcp-server-info">
                          <div className="mcp-server-name-row">
                            <span className="mcp-server-name">
                              {serverStatus.name}
                            </span>
                            {updateInfo && (
                              <span
                                className="mcp-update-badge"
                                title={t(
                                  "mcp.update.availableTitle",
                                  "Update available: {current} -> {latest}",
                                  {
                                    current: updateInfo.currentVersion,
                                    latest: updateInfo.latestVersion,
                                  },
                                )}
                              >
                                {t("mcp.update.badge", "Update")}
                              </span>
                            )}
                            <span
                              className="mcp-server-status"
                              style={{
                                color: getStatusColor(serverStatus.status),
                              }}
                            >
                              <span
                                className="mcp-status-dot"
                                style={{
                                  backgroundColor: getStatusColor(
                                    serverStatus.status,
                                  ),
                                }}
                              />
                              {getStatusText(serverStatus.status)}
                            </span>
                          </div>
                          {config?.command && (
                            <span
                              className="mcp-server-command"
                              title={`${config.command} ${config.args?.join(" ") || ""}`.trim()}
                            >
                              {config.command} {config.args?.join(" ")}
                            </span>
                          )}
                        </div>
                        <div className="mcp-server-toggle">
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={config?.enabled ?? false}
                              onChange={(e) =>
                                handleToggleEnabled(
                                  serverStatus.id,
                                  e.target.checked,
                                )
                              }
                            />
                            <span className="toggle-slider" />
                          </label>
                        </div>
                      </div>

                      {(serverStatus.error ||
                        connectionErrors[serverStatus.id]) && (
                        <div className="mcp-server-error">
                          <span className="mcp-error-icon">
                            <AlertTriangle size={14} strokeWidth={2} />
                          </span>
                          {connectionErrors[serverStatus.id] ||
                            serverStatus.error}
                          {connectionErrors[serverStatus.id] && (
                            <button
                              className="mcp-error-dismiss"
                              onClick={() =>
                                setConnectionErrors((prev) => {
                                  const { [serverStatus.id]: _, ...rest } =
                                    prev;
                                  return rest;
                                })
                              }
                              title={t("mcp.action.dismiss", "Dismiss")}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mcp-server-tools-count">
                        {t(
                          "mcp.tools.availableCount",
                          "{count} tools available",
                          {
                            count: serverStatus.tools.length,
                          },
                        )}
                      </div>

                      <div className="mcp-server-actions">
                        {serverStatus.status === "connected" ? (
                          <button
                            className="button-small button-secondary"
                            onClick={() =>
                              handleDisconnectServer(serverStatus.id)
                            }
                            disabled={isConnecting}
                          >
                            {isConnecting
                              ? t(
                                  "mcp.action.disconnecting",
                                  "Disconnecting...",
                                )
                              : t("mcp.action.disconnect", "Disconnect")}
                          </button>
                        ) : (
                          <button
                            className="button-small button-primary"
                            onClick={() => handleConnectServer(serverStatus.id)}
                            disabled={isConnecting || !config?.enabled}
                          >
                            {isConnecting
                              ? t("mcp.status.connecting", "Connecting...")
                              : t("mcp.action.connect", "Connect")}
                          </button>
                        )}

                        {connectorProvider && (
                          <button
                            className="button-small button-primary"
                            onClick={() =>
                              handleOpenConnectorSetup(
                                connectorProvider,
                                serverStatus.id,
                                serverStatus.name,
                                config?.env,
                              )
                            }
                          >
                            {t("mcp.action.setup", "Setup")}
                          </button>
                        )}

                        <button
                          className="button-small button-secondary"
                          onClick={() => handleViewTools(serverStatus.id)}
                          disabled={serverStatus.status !== "connected"}
                        >
                          {t("mcp.action.viewTools", "View Tools")}
                        </button>

                        <button
                          className="button-small button-secondary"
                          onClick={() => handleOpenEditServer(serverStatus.id)}
                          title={t(
                            "mcp.action.configureTitle",
                            "Configure arguments and environment variables",
                          )}
                        >
                          {t("mcp.action.configure", "Configure")}
                        </button>

                        <button
                          className="button-small button-secondary"
                          onClick={() => handleTestServer(serverStatus.id)}
                          disabled={isTesting}
                        >
                          {isTesting
                            ? t("mcp.action.testing", "Testing...")
                            : t("mcp.action.test", "Test")}
                        </button>

                        {updateInfo && (
                          <button
                            className="button-small button-success"
                            onClick={() => handleUpdateServer(serverStatus.id)}
                            disabled={isUpdating}
                            title={t(
                              "mcp.update.fromTo",
                              "Update from {current} to {latest}",
                              {
                                current: updateInfo.currentVersion,
                                latest: updateInfo.latestVersion,
                              },
                            )}
                          >
                            {isUpdating
                              ? t("mcp.update.updating", "Updating...")
                              : t(
                                  "mcp.update.toVersion",
                                  "Update to {version}",
                                  { version: updateInfo.latestVersion },
                                )}
                          </button>
                        )}

                        <button
                          className="button-small button-danger"
                          onClick={() => handleRemoveServer(serverStatus.id)}
                        >
                          {t("mcp.action.remove", "Remove")}
                        </button>
                      </div>

                      {testResult?.serverId === serverStatus.id && (
                        <div
                          className={`mcp-test-result ${testResult.success ? "success" : "error"}`}
                        >
                          {testResult.success
                            ? t(
                                "mcp.test.success",
                                "Connection successful ({count} tools)",
                                { count: testResult.tools },
                              )
                            : `✗ ${testResult.error}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {activeView === "registry" && (
        <div className="settings-section mcp-view-section mcp-registry-section">
          <h3>{t("mcp.registry.title", "MCP Server Registry")}</h3>
          <p className="settings-description">
            {t(
              "mcp.registry.description",
              "Browse and install MCP servers from the official registry. Click on a server to see details and install with one click.",
            )}
          </p>
          <MCPRegistryBrowser
            onInstall={() => {
              loadData();
              setActiveView("servers");
            }}
            installedServerIds={settings?.servers.map((s) => s.name) || []}
          />
        </div>
      )}

      {activeView === "tunnels" && (
        <div className="settings-section mcp-view-section mcp-tunnels-section">
          <div className="settings-section-header mcp-view-header">
            <h3>{t("mcp.tunnels.title", "Secure MCP Tunnels")}</h3>
            <button
              className="button-small button-primary"
              onClick={() => setShowAddTunnelForm(!showAddTunnelForm)}
            >
              {showAddTunnelForm
                ? t("mcp.action.cancel", "Cancel")
                : t("mcp.tunnels.addPlus", "+ Add Tunnel")}
            </button>
          </div>
          <p className="settings-description">
            {t(
              "mcp.tunnels.description",
              "Expose selected local MCP tools through an outbound-only NeoWorker relay. No public port is opened on this machine.",
            )}
          </p>

          {showAddTunnelForm && (
            <div className="mcp-add-form mcp-tunnel-form">
              <h4>{t("mcp.tunnels.addTitle", "Add Secure MCP Tunnel")}</h4>
              <div className="mcp-tunnel-form-grid">
                <div className="settings-field">
                  <label>{t("mcp.tunnels.name", "Tunnel Name")}</label>
                  <input
                    className="settings-input"
                    value={newTunnelName}
                    onChange={(e) => setNewTunnelName(e.target.value)}
                  />
                </div>
                <div className="settings-field">
                  <label>{t("mcp.tunnels.relayUrl", "Relay URL")}</label>
                  <input
                    className="settings-input"
                    value={newTunnelRelayUrl}
                    onChange={(e) => setNewTunnelRelayUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8787"
                  />
                </div>
                <div className="settings-field">
                  <label>{t("mcp.tunnels.target", "Target")}</label>
                  <select
                    className="settings-select"
                    value={newTunnelTargetType}
                    onChange={(e) =>
                      setNewTunnelTargetType(
                        e.target.value as SecureMcpTunnelTargetType,
                      )
                    }
                  >
                    <option value="neoworker-host">
                      {t(
                        "mcp.tunnels.target.neoworkerHost",
                        "NeoWorker MCP host",
                      )}
                    </option>
                    <option value="http">
                      {t(
                        "mcp.tunnels.target.privateHttp",
                        "Private HTTP MCP URL",
                      )}
                    </option>
                  </select>
                </div>
                {newTunnelTargetType === "http" && (
                  <div className="settings-field">
                    <label>{t("mcp.tunnels.targetUrl", "Target URL")}</label>
                    <input
                      className="settings-input"
                      value={newTunnelTargetUrl}
                      onChange={(e) => setNewTunnelTargetUrl(e.target.value)}
                      placeholder="http://127.0.0.1:3333/mcp"
                    />
                  </div>
                )}
                <div className="settings-field">
                  <label>{t("mcp.tunnels.clientToken", "Client Token")}</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={newTunnelClientToken}
                    onChange={(e) => setNewTunnelClientToken(e.target.value)}
                    placeholder={t(
                      "mcp.tunnels.clientTokenPlaceholder",
                      "Paste the relay client token",
                    )}
                  />
                </div>
                <div className="settings-field">
                  <label>{t("mcp.tunnels.callerToken", "Caller Token")}</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={newTunnelCallerToken}
                    onChange={(e) => setNewTunnelCallerToken(e.target.value)}
                    placeholder={t(
                      "mcp.tunnels.callerTokenPlaceholder",
                      "Optional: paste the relay caller token for local reference",
                    )}
                  />
                </div>
                <div className="settings-field mcp-tunnel-tools-field">
                  <label>
                    {t("mcp.tunnels.allowedTools", "Allowed Tools")}
                  </label>
                  <textarea
                    className="settings-textarea"
                    rows={4}
                    value={newTunnelAllowedTools}
                    onChange={(e) => setNewTunnelAllowedTools(e.target.value)}
                    placeholder={t(
                      "mcp.tunnels.allowedToolsPlaceholder",
                      "One tool name per line. Leave empty to allow all.",
                    )}
                  />
                </div>
              </div>
              <div className="settings-field mcp-tunnel-policy-field">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={newTunnelReadOnly}
                    onChange={(e) => setNewTunnelReadOnly(e.target.checked)}
                  />
                  <span>{t("mcp.tunnels.readOnly", "Read-only mode")}</span>
                </label>
              </div>
              <div className="mcp-form-actions">
                <button
                  className="button-primary"
                  onClick={handleAddTunnel}
                  disabled={
                    !newTunnelName ||
                    !newTunnelRelayUrl ||
                    !newTunnelClientToken ||
                    saving
                  }
                >
                  {saving
                    ? t("mcp.action.adding", "Adding...")
                    : t("mcp.tunnels.add", "Add Tunnel")}
                </button>
              </div>
            </div>
          )}

          {secureTunnels.length === 0 ? (
            <div className="mcp-empty-state mcp-tunnel-empty-state">
              <p>
                {t("mcp.tunnels.empty", "No secure MCP tunnels configured.")}
              </p>
            </div>
          ) : (
            <div className="mcp-server-list">
              {secureTunnels.map((tunnel) => {
                const status = getTunnelStatus(tunnel.id);
                const state = status?.state || "stopped";
                const recentAudit = secureTunnelAudit
                  .filter((event) => event.tunnelId === tunnel.id)
                  .slice(0, 3);
                return (
                  <div key={tunnel.id} className="mcp-server-card">
                    <div className="mcp-server-header">
                      <div className="mcp-server-info">
                        <div className="mcp-server-name-row">
                          <span className="mcp-server-name">{tunnel.name}</span>
                          <span
                            className="mcp-server-status"
                            style={{ color: getTunnelStatusColor(state) }}
                          >
                            <span
                              className="mcp-status-dot"
                              style={{
                                backgroundColor: getTunnelStatusColor(state),
                              }}
                            />
                            {state}
                          </span>
                        </div>
                        <span className="mcp-server-command">
                          {tunnel.relayUrl} {"->"}{" "}
                          {status?.targetUrl ||
                            (tunnel.targetType === "neoworker-host"
                              ? `http://127.0.0.1:${tunnel.neoworkerHostPort || 3333}/mcp`
                              : tunnel.targetUrl)}
                        </span>
                      </div>
                    </div>

                    {(status?.lastError || tunnel.lastError) && (
                      <div className="mcp-server-error">
                        <span className="mcp-error-icon">
                          <AlertTriangle size={14} strokeWidth={2} />
                        </span>
                        {status?.lastError || tunnel.lastError}
                      </div>
                    )}

                    <div className="mcp-server-tools-count">
                      {tunnel.policy.allowedTools.length > 0
                        ? t(
                            "mcp.tunnels.allowedToolsCount",
                            "{count} allowed tools",
                            {
                              count: tunnel.policy.allowedTools.length,
                            },
                          )
                        : t(
                            "mcp.tunnels.allToolsAllowed",
                            "All MCP tools allowed",
                          )}
                      {tunnel.policy.readOnly
                        ? t("mcp.tunnels.readOnlySuffix", " · read-only")
                        : ""}
                    </div>

                    <div className="mcp-server-actions">
                      {state === "connected" ||
                      state === "connecting" ||
                      state === "reconnecting" ? (
                        <button
                          className="button-small button-secondary"
                          onClick={() => handleStopTunnel(tunnel.id)}
                          disabled={saving}
                        >
                          {t("mcp.action.stop", "Stop")}
                        </button>
                      ) : (
                        <button
                          className="button-small button-primary"
                          onClick={() => handleStartTunnel(tunnel.id)}
                          disabled={saving || !tunnel.hasClientToken}
                        >
                          {t("mcp.action.start", "Start")}
                        </button>
                      )}
                      <button
                        className="button-small button-danger"
                        onClick={() => handleRemoveTunnel(tunnel.id)}
                      >
                        {t("mcp.action.remove", "Remove")}
                      </button>
                    </div>

                    {recentAudit.length > 0 && (
                      <div className="mcp-tools-list">
                        {recentAudit.map((event) => (
                          <div key={event.id} className="mcp-tool-item">
                            <div className="mcp-tool-name">
                              {event.toolName || event.method} · {event.status}
                            </div>
                            {event.error && (
                              <div className="mcp-tool-description">
                                {event.error}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeView === "settings" && settings && (
        <div className="settings-section mcp-view-section mcp-config-section">
          <h3>{t("mcp.config.title", "MCP Configuration")}</h3>

          <div className="mcp-config-panel">
            <div className="settings-field mcp-config-auto-connect">
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.autoConnect}
                  onChange={(e) =>
                    setSettings({ ...settings, autoConnect: e.target.checked })
                  }
                />
                <span>
                  {t(
                    "mcp.config.autoConnect",
                    "Auto-connect to enabled servers on startup",
                  )}
                </span>
              </label>
            </div>

            <div className="mcp-config-form-grid">
              <div className="settings-field mcp-config-prefix-field">
                <label>
                  {t("mcp.config.toolNamePrefix", "Tool Name Prefix")}
                </label>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="mcp_"
                  value={settings.toolNamePrefix}
                  onChange={(e) =>
                    setSettings({ ...settings, toolNamePrefix: e.target.value })
                  }
                />
                <p className="settings-hint">
                  {t(
                    "mcp.config.toolNamePrefixHint",
                    'Prefix added to MCP tool names to avoid conflicts with built-in tools. For example, a tool named "read_file" becomes "{prefix}read_file".',
                    { prefix: settings.toolNamePrefix || "mcp_" },
                  )}
                </p>
              </div>

              <div className="settings-field">
                <label>
                  {t(
                    "mcp.config.maxReconnectAttempts",
                    "Max Reconnect Attempts",
                  )}
                </label>
                <input
                  type="number"
                  className="settings-input"
                  min={0}
                  max={20}
                  value={settings.maxReconnectAttempts}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      maxReconnectAttempts: parseInt(e.target.value) || 0,
                    })
                  }
                />
                <p className="settings-hint">
                  {t(
                    "mcp.config.maxReconnectAttemptsHint",
                    "Number of times to attempt reconnection if a server disconnects unexpectedly.",
                  )}
                </p>
              </div>

              <div className="settings-field">
                <label>
                  {t("mcp.config.reconnectDelay", "Reconnect Delay (ms)")}
                </label>
                <input
                  type="number"
                  className="settings-input"
                  min={100}
                  max={60000}
                  value={settings.reconnectDelayMs}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      reconnectDelayMs: parseInt(e.target.value) || 1000,
                    })
                  }
                />
                <p className="settings-hint">
                  {t(
                    "mcp.config.reconnectDelayHint",
                    "Base delay between reconnection attempts (uses exponential backoff).",
                  )}
                </p>
              </div>
            </div>

            <div className="settings-actions">
              <button
                className="button-primary"
                onClick={handleSaveSettings}
                disabled={saving}
              >
                {saving
                  ? t("mcp.action.saving", "Saving...")
                  : t("mcp.action.saveSettings", "Save Settings")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tools Modal */}
      {viewingToolsFor && (
        <div
          className="mcp-modal-overlay"
          onClick={() => setViewingToolsFor(null)}
        >
          <div className="mcp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mcp-modal-header">
              <h3>{t("mcp.tools.availableTitle", "Available Tools")}</h3>
              <button
                className="mcp-modal-close"
                onClick={() => setViewingToolsFor(null)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mcp-modal-content">
              {serverTools.length === 0 ? (
                <p className="mcp-no-tools">
                  {t("mcp.tools.none", "No tools available from this server.")}
                </p>
              ) : (
                <div className="mcp-tools-list">
                  {serverTools.map((tool) => (
                    <div key={tool.name} className="mcp-tool-item">
                      <div className="mcp-tool-name">{tool.name}</div>
                      {tool.description && (
                        <div className="mcp-tool-description">
                          {tool.description}
                        </div>
                      )}
                      {tool.inputSchema.properties && (
                        <div className="mcp-tool-params">
                          <span className="mcp-tool-params-label">
                            {t("mcp.tools.parameters", "Parameters: ")}{" "}
                          </span>
                          {Object.keys(tool.inputSchema.properties).join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Server Modal */}
      {editingServer && (
        <div
          className="mcp-modal-overlay"
          onClick={() => setEditingServer(null)}
        >
          <div
            className="mcp-modal mcp-modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mcp-modal-header">
              <h3>{t("mcp.configure.title", "Configure Server")}</h3>
              <button
                className="mcp-modal-close"
                onClick={() => setEditingServer(null)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mcp-modal-content">
              {/* Filesystem Server: Show Allowed Paths UI */}
              {isFilesystemServer(
                settings?.servers.find((s) => s.id === editingServer),
              ) && (
                <div className="settings-field">
                  <label>
                    {t("mcp.configure.allowedPaths", "Allowed Paths")}
                  </label>
                  <p className="settings-description">
                    {t(
                      "mcp.configure.allowedPathsHint",
                      "The Filesystem server can only access these directories. Add folders you want to allow.",
                    )}
                  </p>
                  <div className="mcp-paths-list">
                    {editServerPaths.length === 0 ? (
                      <div className="mcp-paths-empty">
                        {t(
                          "mcp.configure.noPaths",
                          "No paths configured. Add at least one folder.",
                        )}
                      </div>
                    ) : (
                      editServerPaths.map((path, index) => (
                        <div key={index} className="mcp-path-item">
                          <span className="mcp-path-icon">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                          </span>
                          <span className="mcp-path-value">{path}</span>
                          <button
                            className="mcp-path-remove"
                            onClick={() => handleRemovePath(path)}
                            title={t("mcp.configure.removePath", "Remove path")}
                          >
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    className="button-small button-secondary mcp-add-path-btn"
                    onClick={handleAddPath}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {t("mcp.configure.addFolder", "Add Folder")}
                  </button>
                </div>
              )}

              {/* Non-Filesystem Server: Show generic args */}
              {!isFilesystemServer(
                settings?.servers.find((s) => s.id === editingServer),
              ) && (
                <div className="settings-field">
                  <label>
                    {t("mcp.configure.commandArguments", "Command Arguments")}
                  </label>
                  <input
                    type="text"
                    value={editServerArgs}
                    onChange={(e) => setEditServerArgs(e.target.value)}
                    placeholder="e.g., postgresql://user:pass@localhost/db"
                  />
                  <p className="settings-description">
                    {t(
                      "mcp.configure.commandArgumentsHint",
                      "Space-separated arguments passed to the server command. For PostgreSQL, enter the database URL here.",
                    )}
                  </p>
                </div>
              )}

              <div className="settings-field">
                <label>{t("mcp.configure.env", "Environment Variables")}</label>
                <textarea
                  value={editServerEnv}
                  onChange={(e) => setEditServerEnv(e.target.value)}
                  placeholder="KEY=value&#10;ANOTHER_KEY=another_value"
                  rows={5}
                  className="mcp-env-textarea"
                />
                <p className="settings-description">
                  {t(
                    "mcp.configure.envHint",
                    "One variable per line in KEY=value format. Examples: BRAVE_API_KEY, GITHUB_PERSONAL_ACCESS_TOKEN",
                  )}
                </p>
              </div>

              <div className="mcp-modal-actions">
                <button
                  className="button-secondary"
                  onClick={() => setEditingServer(null)}
                >
                  {t("mcp.action.cancel", "Cancel")}
                </button>
                <button
                  className="button-primary"
                  onClick={handleSaveEditServer}
                >
                  {t("mcp.configure.save", "Save Configuration")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {connectorSetup && (
        <ConnectorSetupModal
          provider={connectorSetup.provider}
          serverId={connectorSetup.serverId}
          serverName={connectorSetup.serverName}
          initialEnv={connectorSetup.env}
          onClose={() => setConnectorSetup(null)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileOutput,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import {
  getConnectorProfile,
  type ConnectorProfile,
} from "../../shared/connector-profiles";
import { translate, useLanguage } from "../i18n";
import { ConnectorBrandIcon } from "./ConnectorBrandIcon";
import type { ConnectorProvider } from "./ConnectorSetupModal";
import type { ConnectorEnvField } from "./ConnectorEnvModal";

type MCPConnectionStatus =
  "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

type MCPServerConfig = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  version?: string;
  author?: string;
  homepage?: string;
  repository?: string;
};

type MCPServerStatus = {
  id: string;
  name: string;
  status: MCPConnectionStatus;
  error?: string;
  tools: Array<{ name: string }>;
};

interface ConnectorDefinition {
  key: string;
  name: string;
  registryId: string;
  description: string;
  supportsOAuth: boolean;
  provider?: ConnectorProvider;
  envFields?: ConnectorEnvField[];
}

function getStatusColor(status: MCPConnectionStatus): string {
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
}

function getStatusText(status: MCPConnectionStatus): string {
  switch (status) {
    case "connected":
      return translate("connectorProfile.status.connected", "Connected");
    case "connecting":
      return translate("connectorProfile.status.connecting", "Connecting");
    case "reconnecting":
      return translate("connectorProfile.status.reconnecting", "Reconnecting");
    case "error":
      return translate("common.error", "Error");
    default:
      return translate("connectorProfile.status.disconnected", "Disconnected");
  }
}

type MCPRegistryEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  tools: Array<{ name: string; description?: string }>;
  tags: string[];
  category?: string;
  verified?: boolean;
  featured?: boolean;
};

type MCPUpdateInfo = {
  serverId: string;
  currentVersion: string;
  latestVersion: string;
  registryEntry: MCPRegistryEntry;
};

type ProfileExample = NonNullable<ConnectorProfile["examples"]>[number];

function fallbackExamples(connector: ConnectorDefinition): ProfileExample[] {
  return [
    {
      prompt: translate(
        "connectors.example.reviewRecent",
        "Review recent items in {name} that need attention",
        { name: connector.name },
      ),
      resultLabel: translate(
        "connectors.example.organizedResult",
        "Organized key information and next steps from {name}",
        { name: connector.name },
      ),
    },
    {
      prompt: `根据 ${connector.name} 的数据生成一份工作摘要`,
      resultLabel: translate(
        "generated.components.connectorprofileview.117.0",
        "An editable work summary has been generated",
      ),
    },
  ];
}

function fallbackFeatures(
  connector: ConnectorDefinition,
): ConnectorProfile["keyFeatures"] {
  return [
    {
      title: translate(
        "generated.components.connectorprofileview.125.1",
        "Retrieve key information",
      ),
      description: translate(
        "connectors.feature.naturalLanguageSearch",
        "Use natural language to find content in {name} that is relevant to the current work.",
        { name: connector.name },
      ),
    },
    {
      title: translate(
        "generated.components.connectorprofileview.129.2",
        "Organize into executable results",
      ),
      description: translate(
        "generated.components.connectorprofileview.130.3",
        "Consolidate scattered information into summaries, checklists, or next steps.",
      ),
    },
    {
      title: translate(
        "generated.components.connectorprofileview.133.4",
        "Keep working context",
      ),
      description: translate(
        "generated.components.connectorprofileview.134.5",
        "Bring the results back to the current workspace within the scope of authorization for continued use in subsequent tasks.",
      ),
    },
  ];
}

export interface ConnectorProfileViewProps {
  connector: ConnectorDefinition;
  config: MCPServerConfig | undefined;
  status: MCPServerStatus | undefined;
  installingId: string | null;
  connectingServer: string | null;
  connectionErrors: Record<string, string>;
  onClose: () => void;
  onInstall: (c: ConnectorDefinition) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onOpenSetup: (
    p: ConnectorProvider,
    id: string,
    name: string,
    env?: Record<string, string>,
  ) => void;
  onOpenEnvModal: (
    id: string,
    name: string,
    env: Record<string, string> | undefined,
    fields: ConnectorEnvField[],
  ) => void;
  onUpdate?: (serverId: string) => void | Promise<void>;
}

export function ConnectorProfileView({
  connector,
  config,
  status,
  installingId,
  connectingServer,
  connectionErrors,
  onClose,
  onInstall,
  onConnect,
  onDisconnect,
  onOpenSetup,
  onOpenEnvModal,
  onUpdate,
}: ConnectorProfileViewProps) {
  useLanguage();
  const t = translate;
  const profile = getConnectorProfile(connector.registryId) as
    ConnectorProfile | undefined;
  const isInstalled = Boolean(config);
  const serverStatus = status?.status || "disconnected";
  const isConnected = serverStatus === "connected";
  const isConnecting = connectingServer === config?.id;
  const errorMsg = config
    ? connectionErrors[config.id] || status?.error
    : undefined;

  const [registryEntry, setRegistryEntry] = useState<MCPRegistryEntry | null>(
    null,
  );
  const [updateInfo, setUpdateInfo] = useState<MCPUpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const registry = await window.electronAPI.fetchMCPRegistry();
        const entry = registry?.servers?.find(
          (s: { id: string }) => s.id === connector.registryId,
        );
        if (!cancelled && entry) setRegistryEntry(entry);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connector.registryId]);

  useEffect(() => {
    if (!config?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const updates = await window.electronAPI.checkMCPUpdates();
        const info = updates?.find(
          (u: MCPUpdateInfo) => u.serverId === config.id,
        );
        if (!cancelled && info) setUpdateInfo(info);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config?.id]);

  const tools = status?.tools ?? registryEntry?.tools ?? [];
  const toolNames = tools.map((t) => (typeof t === "string" ? t : t.name));
  const author = config?.author ?? registryEntry?.author ?? "";
  const homepage = config?.homepage ?? registryEntry?.homepage;
  const version = config?.version ?? registryEntry?.version ?? "";
  const connectorUrl = config?.url;

  const tagline = profile?.tagline ?? connector.description;
  const longDescription = profile?.longDescription ?? connector.description;
  const keyFeatures = profile?.keyFeatures?.length
    ? profile.keyFeatures
    : fallbackFeatures(connector);
  const examples = profile?.examples?.length
    ? profile.examples
    : fallbackExamples(connector);
  const handleConnectClick = async () => {
    if (!isInstalled) {
      onInstall(connector);
      return;
    }
    if (isConnected) {
      onDisconnect(config!.id);
      return;
    }
    onConnect(config!.id);
  };

  const getConnectButtonLabel = () => {
    if (!isInstalled) {
      return installingId === connector.registryId
        ? t("connectorProfile.installing", "Installing...")
        : t("connectorProfile.installConnect", "Install & Connect");
    }
    if (isConnected) {
      return isConnecting
        ? t("connectorProfile.disconnecting", "Disconnecting...")
        : t("connectorProfile.disconnect", "Disconnect");
    }
    return isConnecting
      ? t("connectorProfile.connecting", "Connecting...")
      : t("common.connect", "Connect");
  };

  const handleUpdate = async () => {
    if (!config?.id || updating) return;
    try {
      setUpdating(true);
      await window.electronAPI.updateMCPServerFromRegistry(config.id);
      setUpdateInfo(null);
      onUpdate?.(config.id);
    } finally {
      setUpdating(false);
    }
  };

  const handleCopyUrl = () => {
    if (connectorUrl) navigator.clipboard.writeText(connectorUrl);
  };

  return (
    <div className="mcp-modal-overlay" onClick={onClose}>
      <div className="cm-profile-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top nav: Back + Close */}
        <div className="cm-profile-nav">
          <button
            type="button"
            className="cm-profile-back"
            onClick={onClose}
            aria-label={t("common.back", "Back")}
          >
            <ArrowLeft size={18} strokeWidth={2} />
            <span>{t("common.back", "Back")}</span>
          </button>
          <button
            type="button"
            className="mcp-modal-close"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        {/* Header: Icon, Title, Tagline, Connect */}
        <div className="cm-profile-header">
          <ConnectorBrandIcon
            connectorKey={connector.key}
            name={connector.name}
            className="cm-profile-icon"
          />
          <div className="cm-profile-header-content">
            <h1 className="cm-profile-title">{connector.name}</h1>
            <p className="cm-profile-tagline">{tagline}</p>
          </div>
          <div className="cm-profile-header-actions">
            {updateInfo && (
              <button
                type="button"
                className="cm-profile-update-btn"
                onClick={handleUpdate}
                disabled={updating}
              >
                {updating
                  ? t("connectorProfile.updating", "Updating...")
                  : t("common.update", "Update")}
              </button>
            )}
            <button
              type="button"
              className={`cm-profile-connect-btn ${isConnected ? "connected" : ""}`}
              onClick={handleConnectClick}
              disabled={
                (isInstalled && isConnecting) ||
                (!isInstalled && installingId === connector.registryId)
              }
            >
              {getConnectButtonLabel()}
            </button>
            {isInstalled &&
              !isConnected &&
              connector.supportsOAuth &&
              connector.provider && (
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() =>
                    onOpenSetup(
                      connector.provider!,
                      config!.id,
                      config!.name,
                      config!.env,
                    )
                  }
                >
                  {t("connectorProfile.oauthSetup", "OAuth Setup")}
                </button>
              )}
            {isInstalled &&
              !isConnected &&
              connector.envFields &&
              connector.envFields.length > 0 && (
                <button
                  type="button"
                  className="button-secondary button-small"
                  onClick={() =>
                    onOpenEnvModal(
                      config!.id,
                      config!.name,
                      config!.env,
                      connector.envFields!,
                    )
                  }
                >
                  {t("common.configure", "Configure")}
                </button>
              )}
          </div>
        </div>

        {errorMsg && (
          <div className="mcp-server-error cm-profile-error">
            <span className="mcp-error-icon">
              <AlertTriangle size={14} strokeWidth={2} />
            </span>
            {errorMsg}
          </div>
        )}

        <div className="cm-profile-body">
          <div className="cm-profile-layout">
            <main className="cm-profile-main">
              <section
                className="cm-profile-overview-card"
                aria-label={t(
                  "connectorProfile.overview",
                  "Connector overview",
                )}
              >
                <Sparkles size={17} aria-hidden="true" />
                <p>{longDescription}</p>
              </section>

              <section
                className="cm-profile-examples"
                aria-labelledby="connector-workflows-title"
              >
                <div className="cm-profile-section-heading">
                  <div>
                    <span className="cm-profile-section-kicker">
                      {t("connectorProfile.examples", "Example")}
                    </span>
                    <h3 id="connector-workflows-title">
                      {t(
                        "connectorProfile.workflowExamples",
                        "can be used like this",
                      )}
                    </h3>
                  </div>
                  <span>
                    {t(
                      "connectorProfile.workflowHint",
                      "Click to copy the question",
                    )}
                  </span>
                </div>
                <div className="cm-profile-examples-grid">
                  {examples.map((ex, i) => (
                    <button
                      key={`${ex.prompt}-${i}`}
                      className="cm-example-card"
                      type="button"
                      onClick={() =>
                        void navigator.clipboard?.writeText(ex.prompt)
                      }
                      title={t(
                        "connectorProfile.copyExample",
                        "Copy this example",
                      )}
                    >
                      <span className="cm-example-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="cm-example-prompt">{ex.prompt}</span>
                      <span className="cm-example-result">
                        {ex.resultImageUrl ? (
                          <img
                            src={ex.resultImageUrl}
                            alt={
                              ex.resultLabel ??
                              t(
                                "connectorProfile.exampleOutput",
                                "Example results",
                              )
                            }
                          />
                        ) : (
                          <>
                            <span className="cm-example-output-icon">
                              <FileOutput size={18} aria-hidden="true" />
                            </span>
                            <span>
                              <small>
                                {t(
                                  "connectorProfile.exampleOutput",
                                  "expected results",
                                )}
                              </small>
                              <strong>
                                {ex.resultLabel ??
                                  t(
                                    "connectorProfile.exampleOutput",
                                    "Example results",
                                  )}
                              </strong>
                            </span>
                            <ChevronRight size={17} aria-hidden="true" />
                          </>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section
                className="cm-profile-features"
                aria-labelledby="connector-capabilities-title"
              >
                <div className="cm-profile-section-heading">
                  <div>
                    <span className="cm-profile-section-kicker">
                      {t("connectorProfile.keyFeatures", "key capabilities")}
                    </span>
                    <h3 id="connector-capabilities-title">
                      {t(
                        "connectorProfile.capabilities",
                        "What can be accomplished after connecting",
                      )}
                    </h3>
                  </div>
                </div>
                <div className="cm-profile-feature-grid">
                  {keyFeatures.map((feature, i) => (
                    <article
                      key={`${feature.title}-${i}`}
                      className="cm-profile-feature-card"
                    >
                      <span>
                        <Check size={15} aria-hidden="true" />
                      </span>
                      <div>
                        <h4>{feature.title}</h4>
                        <p>{feature.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </main>

            <aside
              className="cm-profile-aside"
              aria-label={t("connectorProfile.details", "Connection details")}
            >
              <section className="cm-profile-connection-card">
                <div className="cm-profile-aside-heading">
                  <ShieldCheck size={17} aria-hidden="true" />
                  <h3>
                    {t("connectorProfile.connection", "connection status")}
                  </h3>
                </div>
                <strong style={{ color: getStatusColor(serverStatus) }}>
                  {getStatusText(serverStatus)}
                </strong>
                <p>
                  {isConnected
                    ? t(
                        "connectorProfile.connectedHint",
                        "The connector is already available for use in tasks.",
                      )
                    : t(
                        "connectorProfile.connectHint",
                        "After connecting, the agent can call it within your authorization scope.",
                      )}
                </p>
              </section>

              <section className="cm-profile-aside-section">
                <div className="cm-profile-aside-heading">
                  <Wrench size={17} aria-hidden="true" />
                  <h3>{t("connectorProfile.tools", "Tools")}</h3>
                  <span>{toolNames.length}</span>
                </div>
                {toolNames.length > 0 ? (
                  <div className="cm-profile-tools-pills">
                    {toolNames.map((name) => (
                      <span key={name} className="cm-profile-tool-pill">
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="cm-profile-aside-empty">
                    {t(
                      "connectorProfile.toolsOnConnect",
                      "Once connected, available tools are displayed.",
                    )}
                  </p>
                )}
              </section>

              <section className="cm-profile-aside-section cm-profile-details">
                <div className="cm-profile-aside-heading">
                  <h3>{t("connectorProfile.details", "Details")}</h3>
                </div>
                <div className="cm-profile-details-grid">
                  <div className="cm-profile-detail-row">
                    <span className="cm-profile-detail-label">
                      {t(
                        "connectorProfile.connectionMethod",
                        "Connection method",
                      )}
                    </span>
                    <span className="cm-profile-detail-value">
                      {connector.supportsOAuth
                        ? "OAuth"
                        : t(
                            "connectorProfile.apiOrLocal",
                            "API / local configuration",
                          )}
                    </span>
                  </div>
                  {version ? (
                    <div className="cm-profile-detail-row">
                      <span className="cm-profile-detail-label">
                        {t("connectorProfile.version", "version")}
                      </span>
                      <span className="cm-profile-detail-value">
                        {version}
                        {updateInfo ? (
                          <span className="cm-profile-update-badge">
                            {t("connectorProfile.updateAvailable", "Updatable")}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {author ? (
                    <div className="cm-profile-detail-row">
                      <span className="cm-profile-detail-label">
                        {t("connectorProfile.developedBy", "Developer")}
                      </span>
                      <span className="cm-profile-detail-value">
                        {homepage ? (
                          <a
                            href={homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cm-profile-detail-link"
                          >
                            {author}
                            <ExternalLink size={12} />
                          </a>
                        ) : (
                          author
                        )}
                      </span>
                    </div>
                  ) : null}
                  {connectorUrl ? (
                    <div className="cm-profile-detail-row">
                      <span className="cm-profile-detail-label">
                        {t(
                          "connectorProfile.connectorUrl",
                          "connection address",
                        )}
                      </span>
                      <span className="cm-profile-detail-value cm-profile-detail-url">
                        <code>{connectorUrl}</code>
                        <button
                          type="button"
                          className="cm-profile-copy-btn"
                          onClick={handleCopyUrl}
                          aria-label={t("common.copyUrl", "Copy address")}
                        >
                          <Copy size={14} />
                        </button>
                      </span>
                    </div>
                  ) : null}
                  {homepage || registryEntry?.repository ? (
                    <div className="cm-profile-detail-row">
                      <span className="cm-profile-detail-label">
                        {t("connectorProfile.moreInfo", "More information")}
                      </span>
                      <span className="cm-profile-detail-links">
                        {homepage ? (
                          <a
                            href={homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cm-profile-detail-link"
                          >
                            {t(
                              "connectorProfile.documentation",
                              "Documentation",
                            )}
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                        {registryEntry?.repository ? (
                          <a
                            href={registryEntry.repository}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cm-profile-detail-link"
                          >
                            {t("connectorProfile.repository", "warehouse")}
                            <ExternalLink size={12} />
                          </a>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                </div>
              </section>

              <p className="cm-profile-trust-warning">
                {t(
                  "connectorProfile.trustWarning",
                  "Only connect to services you trust; connectors can only read or manipulate data to the extent you allow them.",
                )}
              </p>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

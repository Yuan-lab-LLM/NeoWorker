import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Power,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import QRCode from "qrcode";
import type {
  ChannelData,
  ChannelUserData,
  SecurityMode,
} from "../../shared/types";
import { NeoWorkerSelectMenu } from "./NeoWorkerSelectMenu";
import "./guided-channel-setup.css";
import "./weixin-settings.css";
import { translate, useLanguage } from "../i18n/index";
import { localizeErrorText } from "../utils/localized-error-text";

interface WeixinSettingsProps {
  onStatusChange?: (connected: boolean) => void;
}

type LoginPhase =
  "idle" | "loading" | "waiting" | "scanned" | "connecting" | "error";

function getSecurityOptions() {
  return [
  {
    value: "pairing",
    label: translate(
      "generated.components.weixinsettings.40.0",
      "Requires pairing",
    ),
    description: translate(
      "generated.components.weixinsettings.41.1",
      "The new contact can only be used after sending a pairing code.",
    ),
  },
  {
    value: "allowlist",
    label: translate(
      "generated.components.weixinsettings.45.2",
      "allow list only",
    ),
    description: translate(
      "generated.components.weixinsettings.46.3",
      "Only authorized contacts can initiate tasks",
    ),
  },
  {
    value: "open",
    label: translate(
      "generated.components.weixinsettings.50.4",
      "Available to everyone",
    ),
    description: translate(
      "generated.components.weixinsettings.51.5",
      "Available to anyone who messages Assistant",
    ),
  },
  ];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function WeixinSettings({ onStatusChange }: WeixinSettingsProps) {
  const language = useLanguage();
  const securityOptions = useMemo(getSecurityOptions, [language]);
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [users, setUsers] = useState<ChannelUserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const [securityMode, setSecurityMode] = useState<SecurityMode>("pairing");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingCopied, setPairingCopied] = useState(false);
  const cancelledRef = useRef(false);

  const loadChannel = useCallback(async () => {
    try {
      const channels = await window.electronAPI.getGatewayChannels();
      const existing =
        channels.find((entry: ChannelData) => entry.type === "weixin") || null;
      setChannel(existing);
      setSecurityMode(existing?.securityMode || "pairing");
      onStatusChange?.(existing?.status === "connected");
      if (existing) {
        setUsers(await window.electronAPI.getGatewayUsers(existing.id));
      } else {
        setUsers([]);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [onStatusChange]);

  useEffect(() => {
    loadChannel();
  }, [loadChannel]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onGatewayUsersUpdated?.((data) => {
      if (data.channelType === "weixin") loadChannel();
    });
    return () => unsubscribe?.();
  }, [loadChannel]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const finishLogin = useCallback(
    async (result: {
      accountId?: string;
      botToken?: string;
      baseUrl?: string;
      userId?: string;
    }) => {
      if (!result.accountId || !result.botToken || !result.baseUrl) {
        throw new Error(
          translate(
            "generated.components.weixinsettings.119.6",
            "WeChat login was successful, but the service did not return complete connection information. Please scan the code again.",
          ),
        );
      }
      setPhase("connecting");
      await window.electronAPI.addGatewayChannel({
        type: "weixin",
        name: translate("generated.components.weixinsettings.125.7", "WeChat"),
        weixinAccountId: result.accountId,
        weixinBotToken: result.botToken,
        weixinBaseUrl: result.baseUrl,
        weixinUserId: result.userId,
        securityMode,
      });
      await loadChannel();
      setQrDataUrl("");
      setPhase("idle");
    },
    [loadChannel, securityMode],
  );

  const pollLogin = useCallback(
    async (code: string) => {
      while (!cancelledRef.current) {
        const result = await window.electronAPI.pollWeixinLogin(code);
        if (cancelledRef.current) return;
        if (result.status === "scaned") {
          setPhase("scanned");
          continue;
        }
        if (result.status === "confirmed") {
          await finishLogin(result);
          return;
        }
        if (result.status === "expired") {
          setPhase("error");
          setError(
            translate(
              "generated.components.weixinsettings.154.8",
              "The QR code has expired, please refresh and scan the code again",
            ),
          );
          return;
        }
        setPhase("waiting");
      }
    },
    [finishLogin],
  );

  const startLogin = async () => {
    try {
      cancelledRef.current = false;
      setError("");
      setPhase("loading");
      const result = await window.electronAPI.startWeixinLogin();
      const dataUrl = await QRCode.toDataURL(result.qrContent, {
        width: 224,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#111827", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
      setPhase("waiting");
      void pollLogin(result.qrcode).catch((pollError) => {
        if (cancelledRef.current) return;
        setPhase("error");
        setError(errorMessage(pollError));
      });
    } catch (loginError) {
      setPhase("error");
      setError(errorMessage(loginError));
    }
  };

  const toggleEnabled = async () => {
    if (!channel) return;
    try {
      setBusy(true);
      setError("");
      if (channel.enabled) {
        await window.electronAPI.disableGatewayChannel(channel.id);
      } else {
        await window.electronAPI.enableGatewayChannel(channel.id);
      }
      await loadChannel();
    } catch (toggleError) {
      setError(errorMessage(toggleError));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    if (!channel) return;
    try {
      setBusy(true);
      setError("");
      const result = await window.electronAPI.testGatewayChannel(channel.id);
      if (!result.success)
        throw new Error(
          result.error ||
            translate(
              "generated.components.weixinsettings.212.9",
              "Connection test failed",
            ),
        );
      await loadChannel();
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setBusy(false);
    }
  };

  const removeChannel = async () => {
    if (
      !channel ||
      !confirm(
        translate(
          "generated.components.weixinsettings.222.10",
          "Are you sure you want to disconnect WeChat? After disconnecting, you need to scan the QR code to log in again.",
        ),
      )
    )
      return;
    try {
      setBusy(true);
      await window.electronAPI.removeGatewayChannel(channel.id);
      setChannel(null);
      setUsers([]);
      setPairingCode("");
      onStatusChange?.(false);
    } catch (removeError) {
      setError(errorMessage(removeError));
    } finally {
      setBusy(false);
    }
  };

  const updateSecurityMode = async (mode: SecurityMode) => {
    if (!channel) {
      setSecurityMode(mode);
      return;
    }
    try {
      await window.electronAPI.updateGatewayChannel({
        id: channel.id,
        securityMode: mode,
      });
      setSecurityMode(mode);
      setChannel({ ...channel, securityMode: mode });
    } catch (updateError) {
      setError(errorMessage(updateError));
    }
  };

  const generatePairingCode = async () => {
    if (!channel) return;
    try {
      setBusy(true);
      setPairingCopied(false);
      setPairingCode(
        await window.electronAPI.generateGatewayPairing(channel.id, ""),
      );
    } catch (pairingError) {
      setError(errorMessage(pairingError));
    } finally {
      setBusy(false);
    }
  };

  const copyPairingCode = async () => {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode);
    setPairingCopied(true);
    window.setTimeout(() => setPairingCopied(false), 1600);
  };

  const revokeUser = async (userId: string) => {
    if (!channel) return;
    await window.electronAPI.revokeGatewayAccess(channel.id, userId);
    await loadChannel();
  };

  if (loading) {
    return (
      <div className="weixin-settings weixin-loading" role="status">
        <div className="weixin-loading-mark" aria-hidden="true">
          <LoaderCircle size={19} className="spin" />
        </div>
        <div>
          <strong>
            {translate(
              "generated.components.weixinsettings.290.11",
              "Reading WeChat connection",
            )}
          </strong>
          <span>
            {translate(
              "generated.components.weixinsettings.291.12",
              "Synchronizing login status and contact information",
            )}
          </span>
        </div>
      </div>
    );
  }

  if (!channel) {
    const heading =
      phase === "scanned"
        ? translate(
            "generated.components.weixinsettings.300.13",
            "The code has been scanned, please confirm in WeChat",
          )
        : phase === "connecting"
          ? translate(
              "generated.components.weixinsettings.302.14",
              "Establishing connection",
            )
          : translate(
              "generated.components.weixinsettings.303.15",
              "Scan with WeChat to complete the connection",
            );

    return (
      <div className="weixin-settings guided-channel-setup weixin-guided weixin-settings-disconnected">
        <section className="guided-channel-shell">
          <aside className="guided-channel-guide">
            <div className="guided-channel-brand">
              <span
                className="guided-channel-brand-icon weixin-guided-brand-icon"
                aria-hidden="true"
              >
                <img src="./channel-icons/weixin.svg" alt="" />
              </span>
              <span>
                {translate(
                  "generated.components.weixinsettings.316.16",
                  "Personal WeChat",
                )}
              </span>
            </div>

            <div className="guided-channel-intro">
              <h3>
                {translate(
                  "generated.components.weixinsettings.320.17",
                  "Connect NeoWorker to personal WeChat",
                )}
              </h3>
              <p>
                {translate(
                  "generated.components.weixinsettings.321.18",
                  "There is no need to create an application or fill in a key. Use WeChat to scan the QR code to confirm and you can start the conversation.",
                )}
              </p>
            </div>

            <ol
              className="guided-channel-steps"
              aria-label={translate(
                "generated.components.weixinsettings.324.19",
                "Connection steps",
              )}
            >
              <li>
                <span className="guided-channel-step-index">1</span>
                <div>
                  <strong>
                    {translate(
                      "generated.components.weixinsettings.328.20",
                      "Generate login QR code",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.weixinsettings.329.21",
                      "NeoWorker will generate a QR code specific for this connection.",
                    )}
                  </small>
                </div>
              </li>
              <li>
                <span className="guided-channel-step-index">2</span>
                <div>
                  <strong>
                    {translate(
                      "generated.components.weixinsettings.335.22",
                      "Scan using WeChat",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.weixinsettings.336.23",
                      "Scan the QR code on your mobile phone WeChat and confirm this login.",
                    )}
                  </small>
                </div>
              </li>
              <li>
                <span className="guided-channel-step-index">3</span>
                <div>
                  <strong>
                    {translate(
                      "generated.components.weixinsettings.342.24",
                      "Send tasks directly",
                    )}
                  </strong>
                  <small>
                    {translate(
                      "generated.components.weixinsettings.343.25",
                      "The message is handed over to NeoWorker and the reply is automatically returned to the original conversation.",
                    )}
                  </small>
                </div>
              </li>
            </ol>

            <div className="weixin-guide-note">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                <strong>
                  {translate(
                    "generated.components.weixinsettings.351.26",
                    "New contacts protected by default",
                  )}
                </strong>
                {translate(
                  "generated.components.weixinsettings.352.27",
                  "New contacts need to be paired before they can initiate a task.",
                )}
              </span>
            </div>
          </aside>

          <div className="guided-channel-form weixin-guided-form">
            <div className="guided-channel-form-heading">
              <div>
                <span>
                  {translate(
                    "generated.components.weixinsettings.360.28",
                    "Scan the QR code to log in",
                  )}
                </span>
                <h4>{heading}</h4>
                <p>
                  {translate(
                    "generated.components.weixinsettings.363.29",
                    "The QR code is only used for this connection. After scanning the code to confirm, NeoWorker will automatically verify the login status.",
                  )}
                </p>
              </div>
              <small>
                {translate(
                  "generated.components.weixinsettings.367.30",
                  "No need to fill in configuration",
                )}
              </small>
            </div>

            <div className="weixin-qr-workspace">
              <div className="weixin-qr-stage">
                {qrDataUrl ? (
                  <>
                    <div
                      className={`weixin-qr-frame ${phase === "scanned" ? "scanned" : ""}`}
                    >
                      <img
                        src={qrDataUrl}
                        alt={translate(
                          "generated.components.weixinsettings.377.31",
                          "WeChat login QR code",
                        )}
                      />
                      {phase === "scanned" && (
                        <div className="weixin-qr-confirmed">
                          <Check size={26} />
                        </div>
                      )}
                    </div>
                    <div className="weixin-qr-status" role="status">
                      {phase === "scanned" ? (
                        <>
                          <CircleCheck size={15} />{" "}
                          {translate(
                            "generated.components.weixinsettings.387.32",
                            "Scanned code, waiting for confirmation on mobile phone",
                          )}
                        </>
                      ) : phase === "connecting" ? (
                        <>
                          <LoaderCircle size={15} className="spin" />{" "}
                          {translate(
                            "generated.components.weixinsettings.392.33",
                            "Verifying and connecting",
                          )}
                        </>
                      ) : (
                        <>
                          <span className="weixin-pulse" />{" "}
                          {translate(
                            "generated.components.weixinsettings.396.34",
                            "Waiting for WeChat scan code",
                          )}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="weixin-qr-placeholder">
                    <div
                      className="weixin-qr-placeholder-mark"
                      aria-hidden="true"
                    >
                      {phase === "loading" ? (
                        <LoaderCircle size={30} className="spin" />
                      ) : (
                        <QrCode size={34} />
                      )}
                    </div>
                    <strong>
                      {phase === "loading"
                        ? translate(
                            "generated.components.weixinsettings.415.35",
                            "Generating QR code",
                          )
                        : translate(
                            "generated.components.weixinsettings.416.36",
                            "The QR code will be displayed here",
                          )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.weixinsettings.418.37",
                        "Click the button below to get started. The QR code can be regenerated after it expires.",
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="weixin-scan-help">
                <div className="weixin-scan-help-icon" aria-hidden="true">
                  <Smartphone size={21} />
                </div>
                <div>
                  <strong>
                    {translate(
                      "generated.components.weixinsettings.428.38",
                      "Please complete it in WeChat on mobile phone",
                    )}
                  </strong>
                  <p>
                    {translate(
                      "generated.components.weixinsettings.429.39",
                      "Open WeChat and scan the QR code on the left, and confirm login on your phone.",
                    )}
                  </p>
                </div>
                <div className="weixin-scan-benefit">
                  <Link2 size={15} aria-hidden="true" />
                  <span>
                    {translate(
                      "generated.components.weixinsettings.433.40",
                      "After the connection is successful, the application will automatically resume when it is restarted.",
                    )}
                  </span>
                </div>
                <div className="weixin-scan-benefit">
                  <ShieldCheck size={15} aria-hidden="true" />
                  <span>
                    {translate(
                      "generated.components.weixinsettings.437.41",
                      "Your access control settings are automatically applied when you connect.",
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="guided-channel-security">
              <span className="guided-channel-security-icon" aria-hidden="true">
                <ShieldCheck size={18} />
              </span>
              <div className="guided-channel-security-copy">
                <strong>
                  {translate(
                    "generated.components.weixinsettings.447.42",
                    "access control",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.weixinsettings.448.43",
                    "Once connected, control who can initiate tasks to NeoWorker.",
                  )}
                </small>
              </div>
              <NeoWorkerSelectMenu
                ariaLabel={translate(
                  "generated.components.weixinsettings.451.44",
                  "Choose WeChat access method",
                )}
                className="guided-channel-security-menu"
                icon={<ShieldCheck size={15} />}
                minMenuWidth={300}
                value={securityMode}
                options={securityOptions}
                onValueChange={(value) =>
                  void updateSecurityMode(value as SecurityMode)
                }
              />
            </div>

            {error && (
              <div className="guided-channel-result error" role="alert">
                <CircleAlert size={16} />
                <span>{localizeErrorText(error)}</span>
              </div>
            )}

            <div className="guided-channel-submit-row">
              <span>
                <Check size={14} aria-hidden="true" />
                {translate(
                  "generated.components.weixinsettings.473.45",
                  "Scan the QR code to confirm once, and there is no need to repeat the configuration in the future.",
                )}
              </span>
              <button
                type="button"
                className="guided-channel-submit"
                onClick={startLogin}
                disabled={phase === "loading" || phase === "connecting"}
              >
                {phase === "loading" || phase === "connecting" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : qrDataUrl ? (
                  <RefreshCw size={16} />
                ) : (
                  <QrCode size={16} />
                )}
                {phase === "loading"
                  ? translate(
                      "generated.components.weixinsettings.489.46",
                      "Generating",
                    )
                  : phase === "connecting"
                    ? translate(
                        "generated.components.weixinsettings.491.47",
                        "Connecting",
                      )
                    : qrDataUrl
                      ? translate(
                          "generated.components.weixinsettings.493.48",
                          "Regenerate",
                        )
                      : translate(
                          "generated.components.weixinsettings.494.49",
                          "Generate QR code",
                        )}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const connected = channel.status === "connected";
  return (
    <div className="weixin-settings guided-channel-setup weixin-guided weixin-settings-connected">
      <section className="guided-channel-shell">
        <aside className="guided-channel-guide">
          <div className="guided-channel-brand">
            <span
              className="guided-channel-brand-icon weixin-guided-brand-icon"
              aria-hidden="true"
            >
              <img src="./channel-icons/weixin.svg" alt="" />
            </span>
            <span>
              {translate(
                "generated.components.weixinsettings.515.50",
                "Personal WeChat",
              )}
            </span>
          </div>

          <div className="guided-channel-intro">
            <h3>
              {translate(
                "generated.components.weixinsettings.519.51",
                "WeChat has connected to NeoWorker",
              )}
            </h3>
            <p>
              {translate(
                "generated.components.weixinsettings.520.52",
                "Connection, access control and contact authorization are all managed on the right side.",
              )}
            </p>
          </div>

          <ol
            className="guided-channel-steps"
            aria-label={translate(
              "generated.components.weixinsettings.523.53",
              "Connectivity",
            )}
          >
            <li>
              <span className="guided-channel-step-index">1</span>
              <div>
                <strong>
                  {translate(
                    "generated.components.weixinsettings.527.54",
                    "Receive messages in real time",
                  )}
                </strong>
                <small>
                  {connected
                    ? translate(
                        "generated.components.weixinsettings.530.55",
                        "The current connection is normal and WeChat messages are being received.",
                      )
                    : translate(
                        "generated.components.weixinsettings.531.56",
                        "Not currently connected, can be re-enabled on the right.",
                      )}
                </small>
              </div>
            </li>
            <li>
              <span className="guided-channel-step-index">2</span>
              <div>
                <strong>
                  {translate(
                    "generated.components.weixinsettings.538.57",
                    "Protect new contacts",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.weixinsettings.539.58",
                    "Control task initiation permissions via pairing or allow list.",
                  )}
                </small>
              </div>
            </li>
            <li>
              <span className="guided-channel-step-index">3</span>
              <div>
                <strong>
                  {translate(
                    "generated.components.weixinsettings.545.59",
                    "Manage authorization list",
                  )}
                </strong>
                <small>
                  {translate(
                    "generated.components.weixinsettings.546.60",
                    "Currently recognized",
                  )}
                  {users.length}{" "}
                  {translate(
                    "generated.components.weixinsettings.546.61",
                    "WeChat contacts.",
                  )}
                </small>
              </div>
            </li>
          </ol>

          <div className={`weixin-guide-status ${connected ? "online" : ""}`}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>
              <strong>
                {connected
                  ? translate(
                      "generated.components.weixinsettings.556.62",
                      "The connection is normal",
                    )
                  : channel.enabled
                    ? translate(
                        "generated.components.weixinsettings.558.63",
                        "Connecting",
                      )
                    : translate(
                        "generated.components.weixinsettings.559.64",
                        "Currently disabled",
                      )}
              </strong>
              {connected
                ? translate(
                    "generated.components.weixinsettings.562.65",
                    "The reply will automatically return to the original WeChat conversation.",
                  )
                : translate(
                    "generated.components.weixinsettings.563.66",
                    "Test the connection to see the specific status.",
                  )}
            </span>
          </div>
        </aside>

        <div className="guided-channel-form weixin-guided-form weixin-guided-connected-form">
          <div className="guided-channel-form-heading">
            <div>
              <span>
                {translate(
                  "generated.components.weixinsettings.571.67",
                  "Connection management",
                )}
              </span>
              <h4>{channel.name}</h4>
              <p>
                {translate(
                  "generated.components.weixinsettings.573.68",
                  "Manage connection status, access methods and WeChat contacts without refilling the configuration.",
                )}
              </p>
            </div>
            <small className={connected ? "weixin-heading-status-online" : ""}>
              {connected
                ? translate(
                    "generated.components.weixinsettings.576.69",
                    "Connected",
                  )
                : channel.enabled
                  ? translate(
                      "generated.components.weixinsettings.576.70",
                      "Connecting",
                    )
                  : translate(
                      "generated.components.weixinsettings.576.71",
                      "Deactivated",
                    )}
            </small>
          </div>

          <div className="weixin-management-surface">
            <div className="weixin-connected-summary">
              <div
                className={`weixin-connection-icon ${connected ? "online" : ""}`}
              >
                {connected ? <Wifi size={22} /> : <WifiOff size={22} />}
              </div>
              <div className="weixin-connection-copy">
                <span className="weixin-section-kicker">
                  {translate(
                    "generated.components.weixinsettings.588.72",
                    "connection status",
                  )}
                </span>
                <div className="weixin-connection-title">
                  <h3>
                    {connected
                      ? translate(
                          "generated.components.weixinsettings.591.73",
                          "WeChat message has been connected",
                        )
                      : translate(
                          "generated.components.weixinsettings.591.74",
                          "WeChat messages are currently not connected",
                        )}
                  </h3>
                  <span className={connected ? "online" : ""}>
                    <i aria-hidden="true" />
                    {connected
                      ? translate(
                          "generated.components.weixinsettings.595.75",
                          "online",
                        )
                      : translate(
                          "generated.components.weixinsettings.595.76",
                          "To be restored",
                        )}
                  </span>
                </div>
                <p>
                  {connected
                    ? translate(
                        "generated.components.weixinsettings.600.77",
                        "NeoWorker is receiving WeChat messages, and task results and files will be returned to the original session.",
                      )
                    : translate(
                        "generated.components.weixinsettings.601.78",
                        "Enable the channel or test the connection and NeoWorker will recheck the login status.",
                      )}
                </p>
              </div>
            </div>

            <div className="weixin-management-grid">
              <section className="guided-channel-security weixin-management-block">
                <div className="weixin-management-heading">
                  <span
                    className="guided-channel-security-icon"
                    aria-hidden="true"
                  >
                    <LockKeyhole size={18} />
                  </span>
                  <div className="guided-channel-security-copy">
                    <strong>
                      {translate(
                        "generated.components.weixinsettings.616.79",
                        "Who can use",
                      )}
                    </strong>
                    <small>
                      {translate(
                        "generated.components.weixinsettings.617.80",
                        "Set task initiation permissions for WeChat contacts.",
                      )}
                    </small>
                  </div>
                </div>
                <NeoWorkerSelectMenu
                  ariaLabel={translate(
                    "generated.components.weixinsettings.621.81",
                    "Choose WeChat access method",
                  )}
                  className="guided-channel-security-menu"
                  icon={<ShieldCheck size={15} />}
                  minMenuWidth={300}
                  value={securityMode}
                  options={securityOptions}
                  onValueChange={(value) =>
                    void updateSecurityMode(value as SecurityMode)
                  }
                />
              </section>

              <section
                className={`weixin-invite-panel weixin-management-block ${securityMode !== "pairing" ? "muted" : ""}`}
              >
                <div className="weixin-invite-heading">
                  <span className="weixin-invite-icon" aria-hidden="true">
                    <Link2 size={17} />
                  </span>
                  <div>
                    <strong>
                      {translate(
                        "generated.components.weixinsettings.641.82",
                        "Invite new contacts",
                      )}
                    </strong>
                    <small>
                      {securityMode === "pairing"
                        ? translate(
                            "generated.components.weixinsettings.644.83",
                            "Generate a pairing code and send it to the other party in WeChat.",
                          )
                        : translate(
                            "generated.components.weixinsettings.645.84",
                            'Switch to "Require pairing" to invite.',
                          )}
                    </small>
                  </div>
                </div>
                {securityMode === "pairing" ? (
                  pairingCode ? (
                    <button
                      className="weixin-pairing-code"
                      onClick={copyPairingCode}
                      title={translate(
                        "generated.components.weixinsettings.654.85",
                        "Click to copy the pairing code",
                      )}
                    >
                      <span>{pairingCode}</span>
                      <span className="weixin-pairing-copy-label">
                        {pairingCopied ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                        {pairingCopied
                          ? translate(
                              "generated.components.weixinsettings.663.86",
                              "Copied",
                            )
                          : translate(
                              "generated.components.weixinsettings.663.87",
                              "Copy",
                            )}
                      </span>
                    </button>
                  ) : (
                    <button
                      className="weixin-generate-code"
                      onClick={generatePairingCode}
                      disabled={busy}
                    >
                      {translate(
                        "generated.components.weixinsettings.672.88",
                        "Generate pairing code",
                      )}
                    </button>
                  )
                ) : (
                  <span className="weixin-control-disabled">
                    {translate(
                      "generated.components.weixinsettings.677.89",
                      "The current access method does not use pairing codes",
                    )}
                  </span>
                )}
              </section>
            </div>

            <section className="weixin-contacts-panel">
              <div className="weixin-contacts-heading">
                <div className="weixin-contacts-title">
                  <span className="weixin-contacts-icon" aria-hidden="true">
                    <UserRound size={18} />
                  </span>
                  <div>
                    <h4>
                      {translate(
                        "generated.components.weixinsettings.690.90",
                        "WeChat Contact",
                      )}
                    </h4>
                    <p>
                      {translate(
                        "generated.components.weixinsettings.691.91",
                        "Contacts to whom messages have been sent and authorization status will be displayed here.",
                      )}
                    </p>
                  </div>
                </div>
                <span>
                  {users.length}{" "}
                  {translate(
                    "generated.components.weixinsettings.694.92",
                    "contacts",
                  )}
                </span>
              </div>
              {users.length === 0 ? (
                <div className="weixin-empty-users">
                  <div className="weixin-empty-icon" aria-hidden="true">
                    <UserRound size={21} />
                  </div>
                  <div>
                    <strong>
                      {translate(
                        "generated.components.weixinsettings.702.93",
                        "No contact identified yet",
                      )}
                    </strong>
                    <span>
                      {translate(
                        "generated.components.weixinsettings.704.94",
                        "Send a message to the assistant from WeChat, and the contact and authorization status will appear here.",
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="weixin-user-list">
                  {users.map((user) => (
                    <div className="weixin-user-row" key={user.id}>
                      <div className="weixin-user-avatar">
                        {(
                          user.displayName ||
                          translate(
                            "generated.components.weixinsettings.713.95",
                            "Micro",
                          )
                        ).slice(0, 1)}
                      </div>
                      <div>
                        <strong>
                          {user.displayName || user.channelUserId}
                        </strong>
                        <span>
                          {user.allowed
                            ? translate(
                                "generated.components.weixinsettings.717.96",
                                "Authorized",
                              )
                            : translate(
                                "generated.components.weixinsettings.717.97",
                                "Waiting for pairing",
                              )}
                        </span>
                      </div>
                      {user.allowed && (
                        <button onClick={() => revokeUser(user.channelUserId)}>
                          {translate(
                            "generated.components.weixinsettings.721.98",
                            "revoke access",
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {error && (
            <div className="guided-channel-result error" role="alert">
              <CircleAlert size={16} />
              <span>{localizeErrorText(error)}</span>
            </div>
          )}

          <div className="guided-channel-submit-row weixin-connected-actions">
            <span>
              <Check size={14} aria-hidden="true" />
              {connected
                ? translate(
                    "generated.components.weixinsettings.741.99",
                    "The current connection is available.",
                  )
                : translate(
                    "generated.components.weixinsettings.741.100",
                    "You can test the connection first to check the status.",
                  )}
            </span>
            <div>
              <button
                type="button"
                className="weixin-action-danger"
                onClick={removeChannel}
                disabled={busy}
              >
                <Trash2 size={14} />{" "}
                {translate(
                  "generated.components.weixinsettings.750.101",
                  "Disconnect",
                )}
              </button>
              <button
                type="button"
                className="weixin-action-secondary"
                onClick={toggleEnabled}
                disabled={busy}
              >
                <Power size={14} />{" "}
                {channel.enabled
                  ? translate(
                      "generated.components.weixinsettings.758.102",
                      "deactivate",
                    )
                  : translate(
                      "generated.components.weixinsettings.758.103",
                      "enable",
                    )}
              </button>
              <button
                type="button"
                className="guided-channel-submit"
                onClick={testConnection}
                disabled={busy}
              >
                <RefreshCw size={14} />{" "}
                {translate(
                  "generated.components.weixinsettings.766.104",
                  "test connection",
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

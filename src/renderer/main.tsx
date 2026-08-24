import React from "react";
import ReactDOM from "react-dom/client";
import { migrateLegacyBrandStorage } from "./utils/legacy-brand-storage-migration";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "./react-refresh-ignored-exports";
import { installBrowserElectronApi } from "./browser-electron-api";
import { App } from "./App";
import "./styles/index.css";
import "./components/right-panel.css";
import "./styles/neoworker-design-system.css";
import "./styles/collapsed-sidebar-rail.css";
import "./styles/conversation-reading.css";
import "./styles/composer-control-refinement.css";

interface RendererErrorBoundaryState {
  error: Error | null;
}

class RendererErrorBoundary extends React.Component<
  React.PropsWithChildren,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[RendererErrorBoundary] Unhandled renderer error", error, info);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 32,
          background: "#f7f8fa",
          color: "#172033",
          fontFamily: '"DM Sans", system-ui, sans-serif',
        }}
      >
        <section
          role="alert"
          style={{
            width: "min(560px, 100%)",
            padding: 28,
            border: "1px solid #e1e5eb",
            borderRadius: 18,
            background: "#fff",
            boxShadow: "0 18px 50px rgba(20, 31, 51, 0.08)",
          }}
        >
          <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>
            页面显示遇到问题
          </h1>
          <p style={{ margin: "0 0 20px", color: "#657086", lineHeight: 1.6 }}>
            NeoWorker 已阻止页面继续白屏。你可以重新加载界面，当前任务和文件不会被删除。
          </p>
          <details style={{ marginBottom: 20, color: "#657086" }}>
            <summary style={{ cursor: "pointer" }}>查看错误详情</summary>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                maxHeight: 180,
                overflow: "auto",
                borderRadius: 10,
                background: "#f3f5f8",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontSize: 12,
              }}
            >
              {error.stack || error.message}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              background: "#2488f5",
              color: "#fff",
              font: "inherit",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            重新加载
          </button>
        </section>
      </main>
    );
  }
}

migrateLegacyBrandStorage();

installBrowserElectronApi();

const rootElement = document.documentElement;
rootElement.classList.remove("visual-terminal", "visual-warm");
if (!rootElement.classList.contains("visual-oblivion")) {
  rootElement.classList.add("visual-oblivion");
}
rootElement.classList.remove("density-full", "density-power");
if (!rootElement.classList.contains("density-focused")) {
  rootElement.classList.add("density-focused");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RendererErrorBoundary>
      <App />
    </RendererErrorBoundary>
  </React.StrictMode>,
);

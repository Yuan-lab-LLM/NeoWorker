import { Package } from "lucide-react";
import { NeoWorkerPageHeader } from "./NeoWorkerPageHeader";
import { CustomizePanel } from "./CustomizePanel";
import "./capability-bundles.css";
import { translate } from "../i18n/index";

interface CapabilityBundlesPanelProps {
  onNavigateToConnectors?: () => void;
  onNavigateToSkills?: () => void;
  onCreateTask?: (title: string, prompt: string) => void;
}

export function CapabilityBundlesPanel({
  onNavigateToConnectors,
  onNavigateToSkills,
  onCreateTask,
}: CapabilityBundlesPanelProps) {
  return (
    <main className="main-content capability-bundles-page">
      <NeoWorkerPageHeader
        className="capability-bundles-product-header"
        title={translate(
          "generated.components.capabilitybundlespanel.21.0",
          "Ability combination",
        )}
        description={translate(
          "generated.components.capabilitybundlespanel.22.1",
          "Combine skills, connectors, agents and shortcut commands into directly enableable scene capabilities.",
        )}
        icon={<Package size={19} strokeWidth={1.8} />}
      />
      <section
        className="capability-bundles-body"
        aria-label={translate(
          "generated.components.capabilitybundlespanel.25.2",
          "Ability combination",
        )}
      >
        <CustomizePanel
          onNavigateToConnectors={onNavigateToConnectors}
          onNavigateToSkills={onNavigateToSkills}
          onCreateTask={onCreateTask}
        />
      </section>
    </main>
  );
}

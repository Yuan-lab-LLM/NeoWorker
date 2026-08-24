import coderPortrait from "../assets/expert-portraits/coder.webp";
import reviewerPortrait from "../assets/expert-portraits/reviewer.webp";
import researcherPortrait from "../assets/expert-portraits/researcher.webp";
import testerPortrait from "../assets/expert-portraits/tester.webp";
import architectPortrait from "../assets/expert-portraits/architect.webp";
import writerPortrait from "../assets/expert-portraits/writer.webp";
import designerPortrait from "../assets/expert-portraits/designer.webp";
import projectManagerPortrait from "../assets/expert-portraits/project_manager.webp";
import productManagerPortrait from "../assets/expert-portraits/product_manager.webp";
import dataAnalystPortrait from "../assets/expert-portraits/data_analyst.webp";
import marketingPortrait from "../assets/expert-portraits/marketing.webp";
import supportPortrait from "../assets/expert-portraits/support.webp";
import devopsPortrait from "../assets/expert-portraits/devops.webp";
import securityAnalystPortrait from "../assets/expert-portraits/security_analyst.webp";
import assistantPortrait from "../assets/expert-portraits/assistant.webp";
import financeLeadPortrait from "../assets/expert-portraits/finance-lead.webp";
import financeDataReaderPortrait from "../assets/expert-portraits/finance-data-reader.webp";
import financeModelBuilderPortrait from "../assets/expert-portraits/finance-model-builder.webp";
import financeDocumentWriterPortrait from "../assets/expert-portraits/finance-document-writer.webp";
import financeReviewerPortrait from "../assets/expert-portraits/finance-reviewer.webp";
import financeControllerPortrait from "../assets/expert-portraits/finance-controller.webp";
import marketResearcherPortrait from "../assets/expert-portraits/managed-market-researcher.webp";
import pitchAgentPortrait from "../assets/expert-portraits/managed-pitch-agent.webp";
import prAgentPortrait from "../assets/expert-portraits/managed-pr-agent.webp";
import alarmAgentPortrait from "../assets/expert-portraits/managed-managed-agent-ebbb4a73.webp";
import teamQaOnePortrait from "../assets/expert-portraits/managed-personal-agent-5f3024bc.webp";
import teamQaTwoPortrait from "../assets/expert-portraits/managed-personal-agent-85d570a1.webp";
import teamQaThreePortrait from "../assets/expert-portraits/managed-managed-agent-a31f82bd.webp";
import morningPlannerPortrait from "../assets/expert-portraits/managed-personal-agent-d855ae13.webp";
import defectTriageOnePortrait from "../assets/expert-portraits/managed-personal-agent.webp";
import defectTriageTwoPortrait from "../assets/expert-portraits/managed-personal-agent-6f01038b.webp";
import softwareEngineerTwinPortrait from "../assets/expert-portraits/twin-software-engineer.webp";
import seniorDesignerPortrait from "../assets/expert-portraits/managed-managed-agent.webp";
import auroraGridBackground from "../assets/agent-backgrounds/aurora-grid.svg";
import orbitLabBackground from "../assets/agent-backgrounds/orbit-lab.svg";
import paperWavesBackground from "../assets/agent-backgrounds/paper-waves.svg";
import crystalFieldBackground from "../assets/agent-backgrounds/crystal-field.svg";
import signalGardenBackground from "../assets/agent-backgrounds/signal-garden.svg";
import cobaltArchitectureBackground from "../assets/agent-backgrounds/cobalt-architecture.svg";

type PortraitRole = {
  id?: string;
  name: string;
  capabilities?: string[];
  roleKind?: "system" | "custom" | "persona_template";
  isSystem?: boolean;
  soul?: string;
};

export type AgentRoleVisual = {
  src: string;
  kind: "portrait" | "background";
};

export const CUSTOM_AGENT_BACKGROUNDS = Object.freeze([
  auroraGridBackground,
  orbitLabBackground,
  paperWavesBackground,
  crystalFieldBackground,
  signalGardenBackground,
  cobaltArchitectureBackground,
]);

const PORTRAIT_BY_ROLE_NAME: Record<string, string> = {
  coder: coderPortrait,
  reviewer: reviewerPortrait,
  researcher: researcherPortrait,
  tester: testerPortrait,
  architect: architectPortrait,
  writer: writerPortrait,
  designer: designerPortrait,
  project_manager: projectManagerPortrait,
  product_manager: productManagerPortrait,
  data_analyst: dataAnalystPortrait,
  marketing: marketingPortrait,
  support: supportPortrait,
  devops: devopsPortrait,
  security_analyst: securityAnalystPortrait,
  assistant: assistantPortrait,
  "finance-lead": financeLeadPortrait,
  "finance-data-reader": financeDataReaderPortrait,
  "finance-model-builder": financeModelBuilderPortrait,
  "finance-document-writer": financeDocumentWriterPortrait,
  "finance-reviewer": financeReviewerPortrait,
  "finance-controller": financeControllerPortrait,
  "managed-market-researcher": marketResearcherPortrait,
  "managed-pitch-agent": pitchAgentPortrait,
  "managed-pr-agent": prAgentPortrait,
  "managed-managed-agent-ebbb4a73": alarmAgentPortrait,
  "managed-personal-agent-5f3024bc": teamQaOnePortrait,
  "managed-personal-agent-85d570a1": teamQaTwoPortrait,
  "managed-managed-agent-a31f82bd": teamQaThreePortrait,
  "managed-personal-agent-d855ae13": morningPlannerPortrait,
  "managed-personal-agent": defectTriageOnePortrait,
  "managed-personal-agent-6f01038b": defectTriageTwoPortrait,
  "twin-software-engineer": softwareEngineerTwinPortrait,
  "managed-managed-agent": seniorDesignerPortrait,
};

const PORTRAIT_BY_CAPABILITY: Record<string, string> = {
  analyze: dataAnalystPortrait,
  build: architectPortrait,
  code: coderPortrait,
  communicate: supportPortrait,
  debug: defectTriageOnePortrait,
  design: designerPortrait,
  document: writerPortrait,
  manage: projectManagerPortrait,
  market: marketingPortrait,
  ops: devopsPortrait,
  plan: productManagerPortrait,
  product: productManagerPortrait,
  research: researcherPortrait,
  review: reviewerPortrait,
  security: securityAnalystPortrait,
  test: testerPortrait,
  write: writerPortrait,
};

export const EXPERT_PORTRAIT_ROLE_NAMES = Object.freeze(Object.keys(PORTRAIT_BY_ROLE_NAME));

function stableVisualIndex(value: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % length;
}

function hasReservedBackgroundMarker(role: PortraitRole): boolean {
  if (role.soul) {
    try {
      const soul = JSON.parse(role.soul) as {
        studio?: { appearance?: { cardVisual?: unknown } };
      };
      if (soul.studio?.appearance?.cardVisual === "background") return true;
    } catch {
      // Legacy roles may contain free-form soul text. They keep the portrait fallback below.
    }
  }

  // Compatibility for agents created before cardVisual was persisted. Known legacy roles are
  // resolved from PORTRAIT_BY_ROLE_NAME before this check, so only unmapped user-created roles
  // enter the reserved background pool.
  return role.roleKind === "custom" && role.isSystem === false;
}

export function getAgentRoleVisual(role: PortraitRole): AgentRoleVisual {
  const exactPortrait = PORTRAIT_BY_ROLE_NAME[role.name];
  if (exactPortrait) return { src: exactPortrait, kind: "portrait" };

  if (hasReservedBackgroundMarker(role)) {
    const seed = role.id || role.name;
    return {
      src: CUSTOM_AGENT_BACKGROUNDS[stableVisualIndex(seed, CUSTOM_AGENT_BACKGROUNDS.length)],
      kind: "background",
    };
  }

  const capabilityPortrait = (role.capabilities || [])
    .map((capability) => PORTRAIT_BY_CAPABILITY[String(capability)])
    .find(Boolean);
  return {
    src: capabilityPortrait || assistantPortrait,
    kind: "portrait",
  };
}

export function getAgentRolePortrait(role: PortraitRole): string {
  return getAgentRoleVisual(role).src;
}

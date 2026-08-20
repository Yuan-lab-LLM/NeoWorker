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

type PortraitRole = {
  name: string;
  capabilities?: string[];
};

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

export const EXPERT_PORTRAIT_ROLE_NAMES = Object.freeze(
  Object.keys(PORTRAIT_BY_ROLE_NAME),
);

export function getAgentRolePortrait(role: PortraitRole): string {
  const exactPortrait = PORTRAIT_BY_ROLE_NAME[role.name];
  if (exactPortrait) return exactPortrait;

  const capabilityPortrait = (role.capabilities || [])
    .map((capability) => PORTRAIT_BY_CAPABILITY[String(capability)])
    .find(Boolean);
  return capabilityPortrait || assistantPortrait;
}

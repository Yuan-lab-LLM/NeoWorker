const PRIMARY_GRAMMARS = new Set([
  "answer-pyramid",
  "evidence-plate",
  "journey-map",
  "editorial-spread",
  "thesis-stage",
  "operating-grid",
  "public-docket",
  "telemetry-canvas",
]);

const STYLE_ROUTES = [
  {
    id: "telemetry-canvas",
    pattern: /(?:incident|postmortem|monitor|observability|status|operations?|运维|监控|故障|复盘|状态)/i,
    rationale: "Operational status and incident material benefits from a telemetry-led canvas.",
  },
  {
    id: "public-docket",
    pattern: /(?:policy|regulation|government|legal|compliance|public sector|政策|监管|政府|法律|合规)/i,
    rationale: "Policy and regulated material needs a source-forward public-docket structure.",
  },
  {
    id: "evidence-plate",
    pattern: /(?:research|science|clinical|medical|laboratory|experiment|academic|研究|科学|临床|医疗|实验|学术)/i,
    rationale: "Research material needs an evidence-first plate with visible claims and sources.",
  },
  {
    id: "operating-grid",
    pattern: /(?:dashboard|metrics?|kpi|quarterly|financial|finance|performance|数据|指标|看板|季度|财务|经营)/i,
    rationale: "Metric-heavy content needs an operating grid rather than generic cards.",
  },
  {
    id: "journey-map",
    pattern: /(?:roadmap|timeline|process|workflow|transformation|history|路线图|时间线|流程|转型|历程)/i,
    rationale: "Chronological or process material needs a journey with explicit state changes.",
  },
  {
    id: "editorial-spread",
    pattern: /(?:editorial|magazine|culture|brand story|biography|documentary|杂志|文化|品牌故事|人物|传记)/i,
    rationale: "Narrative material benefits from editorial pacing and strong visual hierarchy.",
  },
  {
    id: "thesis-stage",
    pattern: /(?:launch|keynote|vision|product|marketing|showcase|发布会|愿景|产品|营销|展示)/i,
    rationale: "Launch and vision material needs a stage-like thesis progression.",
  },
  {
    id: "answer-pyramid",
    pattern: /(?:board|executive|strategy|proposal|investor|consulting|董事会|高管|战略|方案|投资|咨询)/i,
    rationale: "Decision-oriented material should lead with the answer and support it with evidence.",
  },
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function recommendStyleRoute(input = {}) {
  const searchable = [
    input.title,
    input.audience,
    input.purpose,
    input.coreMessage,
    input.visualStyle,
    input.palette,
  ]
    .map(asText)
    .filter(Boolean)
    .join(" ");
  const selected = STYLE_ROUTES.find((route) => route.pattern.test(searchable));
  const primaryGrammar = selected?.id || "answer-pyramid";
  return {
    primaryGrammar,
    rationale:
      selected?.rationale ||
      "Use an answer-first structure until the audience, evidence shape, or narrative requires a more specific grammar.",
    secondaryInfluences: [],
    density: /(?:dense|detail|technical|数据密集|详细|技术)/i.test(searchable)
      ? "dense"
      : "balanced",
  };
}

export function validatePresentationPlan(plan, options = {}) {
  const checks = [];
  const errors = [];
  const warnings = [];
  const slides = asArray(plan?.slides);
  const evidence = asArray(plan?.evidence);
  const evidenceIds = new Set(evidence.map((item) => asText(item?.id)).filter(Boolean));

  const check = (name, ok, detail) => checks.push({ name, ok, detail });
  const title = asText(plan?.title);
  if (!title) errors.push("presentation-plan.json: title is required.");
  check("plan title", Boolean(title), title || "missing");

  if (slides.length < 2) {
    errors.push("presentation-plan.json: at least two slides are required.");
  }
  check("slide plan", slides.length >= 2, `${slides.length} planned slide(s)`);

  if (
    Number.isFinite(options.slideModuleCount) &&
    Number(options.slideModuleCount) !== slides.length
  ) {
    errors.push(
      `presentation-plan.json lists ${slides.length} slides, but ${options.slideModuleCount} slide module(s) were found.`,
    );
  }

  const indexes = new Set();
  const ids = new Set();
  const roles = [];
  for (const [offset, slide] of slides.entries()) {
    const position = offset + 1;
    const index = Number(slide?.index);
    const id = asText(slide?.id) || `slide-${String(position).padStart(2, "0")}`;
    const role = asText(slide?.role) || asText(slide?.type);
    const takeaway = asText(slide?.takeaway);
    const intent = asText(slide?.intent);
    const evidenceRefs = asArray(slide?.evidenceRefs).map(asText).filter(Boolean);

    if (!Number.isInteger(index) || index < 1) {
      errors.push(`Slide ${position}: index must be a positive integer.`);
    } else if (indexes.has(index)) {
      errors.push(`Slide ${position}: duplicate slide index ${index}.`);
    }
    indexes.add(index);

    if (ids.has(id)) errors.push(`Slide ${position}: duplicate slide id '${id}'.`);
    ids.add(id);
    if (!intent) warnings.push(`Slide ${position}: add an intent describing the slide's job.`);
    if (!takeaway) warnings.push(`Slide ${position}: add one audience takeaway.`);
    if (!role) warnings.push(`Slide ${position}: classify the narrative role/page type.`);
    if (role) roles.push(role);

    for (const evidenceRef of evidenceRefs) {
      if (!evidenceIds.has(evidenceRef)) {
        errors.push(`Slide ${position}: evidence reference '${evidenceRef}' is not defined.`);
      }
    }

    if (
      /(?:metric|chart|table|data|evidence|comparison|research|指标|图表|数据|证据|对比)/i.test(
        `${role} ${asText(slide?.type)}`,
      ) &&
      evidenceRefs.length === 0
    ) {
      warnings.push(`Slide ${position}: evidence-bearing content has no evidenceRefs.`);
    }
  }

  const coreMessage = asText(plan?.coreMessage || plan?.takeaway);
  if (!coreMessage) warnings.push("Define one deck-level coreMessage before final layout.");
  check("core message", Boolean(coreMessage), coreMessage || "missing");

  const narrative = plan?.narrative || {};
  if (slides.length >= 5) {
    if (!asText(narrative.tension)) warnings.push("Narrative plan is missing tension/stakes.");
    if (!asText(narrative.resolution)) warnings.push("Narrative plan is missing a resolution.");
  }

  const uniqueRoles = new Set(roles);
  if (slides.length >= 6 && uniqueRoles.size < 3) {
    warnings.push("Use at least three narrative roles/page types in a deck of six or more slides.");
  }
  for (let index = 2; index < roles.length; index += 1) {
    if (roles[index] === roles[index - 1] && roles[index] === roles[index - 2]) {
      warnings.push(`Slides ${index - 1}-${index + 1} repeat the '${roles[index]}' role.`);
    }
  }

  const grammar = asText(plan?.styleRoute?.primaryGrammar);
  if (!grammar) {
    warnings.push("Select a primary style grammar before authoring final slide geometry.");
  } else if (!PRIMARY_GRAMMARS.has(grammar)) {
    errors.push(`Unknown primary style grammar '${grammar}'.`);
  }
  check("style route", Boolean(grammar) && PRIMARY_GRAMMARS.has(grammar), grammar || "missing");

  const claimIds = new Set();
  for (const [offset, item] of evidence.entries()) {
    const id = asText(item?.id);
    if (!id) warnings.push(`Evidence ${offset + 1}: add a stable id.`);
    if (id && claimIds.has(id)) errors.push(`Duplicate evidence id '${id}'.`);
    if (id) claimIds.add(id);
    if (!asText(item?.source) && asText(item?.claim)) {
      warnings.push(`Evidence '${id || offset + 1}': claim has no source.`);
    }
  }
  check("evidence register", true, `${evidence.length} evidence item(s)`);

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    errors,
    warnings,
    checks,
    summary: {
      slideCount: slides.length,
      evidenceCount: evidence.length,
      roleCount: uniqueRoles.size,
      primaryGrammar: grammar || null,
    },
  };
}

export { PRIMARY_GRAMMARS };

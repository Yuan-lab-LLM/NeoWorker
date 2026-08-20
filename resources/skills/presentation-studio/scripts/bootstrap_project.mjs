#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
  parseArgs,
  presentationPalette,
  resolvePlatformFonts,
} from "./runtime-utils.mjs";
import { recommendStyleRoute } from "./planning-contract.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args["project-dir"]) {
  console.error(
    "Usage: node bootstrap_project.mjs --project-dir <dir> [--language auto] [--style soft] [--palette analysis] [--title title]",
  );
  process.exit(2);
}

const projectDir = path.resolve(args["project-dir"]);
const language = String(args.language || "auto").toLowerCase();
const style = String(args.style || "soft").toLowerCase();
const paletteName = String(args.palette || "analysis").toLowerCase();
const title = String(args.title || "Presentation title");
const fonts = resolvePlatformFonts(language);
const colors = presentationPalette(paletteName);
const styleRoute = recommendStyleRoute({
  title,
  visualStyle: style,
  palette: paletteName,
});

const styleRecipes = {
  sharp: { radius: 0.02, margin: 0.42, gap: 0.2 },
  soft: { radius: 0.1, margin: 0.55, gap: 0.28 },
  rounded: { radius: 0.2, margin: 0.65, gap: 0.34 },
  pill: { radius: 0.34, margin: 0.72, gap: 0.4 },
};

const theme = {
  name: "NeoWorker Presentation Studio",
  palette: paletteName,
  style: styleRecipes[style] ? style : "soft",
  colors,
  fonts,
  spacing: styleRecipes[style] || styleRecipes.soft,
};

const plan = {
  schemaVersion: "2.0",
  title,
  language,
  audience: "",
  purpose: "",
  coreMessage: "",
  deliveryFormat: "native-pptx",
  narrative: {
    mode: "auto",
    openingQuestion: "",
    context: "",
    tension: "",
    resolution: "",
    callToAction: "",
  },
  styleRoute,
  evidence: [],
  slides: [
    {
      index: 1,
      id: "slide-01",
      type: "cover",
      role: "opening",
      intent: "Set the promise and visual tone",
      takeaway: "",
      evidenceRefs: [],
      assetIntent: "One memorable hero visual or a strong typographic statement",
    },
    {
      index: 2,
      id: "slide-02",
      type: "content",
      role: "context",
      intent: "Deliver the first substantive idea",
      takeaway: "",
      evidenceRefs: [],
      assetIntent: "Evidence-led composition matched to the slide's argument",
    },
  ],
};

const coverSource = `export const slideConfig = {
  index: 1,
  type: "cover",
  title: ${JSON.stringify(title)},
};

export function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.colors.primary };

  slide.addShape(pres.ShapeType.roundRect, {
    x: 0.78, y: 0.72, w: 1.08, h: 0.34,
    rectRadius: theme.spacing.radius,
    fill: { color: theme.colors.accent },
    line: { color: theme.colors.accent, transparency: 100 },
  });
  slide.addText("PRESENTATION", {
    x: 0.88, y: 0.78, w: 0.88, h: 0.14,
    fontFace: theme.fonts.body, fontSize: 8, bold: true,
    color: theme.colors.primary, charSpacing: 1.2, margin: 0,
  });
  slide.addText(slideConfig.title, {
    x: 0.78, y: 2.0, w: 8.2, h: 1.45,
    fontFace: theme.fonts.heading, fontSize: 38, bold: true,
    color: "FFFFFF", margin: 0, breakLine: false, fit: "shrink",
  });
  slide.addText("Replace this line with a concise promise for the audience.", {
    x: 0.82, y: 3.72, w: 6.8, h: 0.62,
    fontFace: theme.fonts.body, fontSize: 17,
    color: theme.colors.light, margin: 0, fit: "shrink",
  });
  slide.addShape(pres.ShapeType.arc, {
    x: 9.65, y: 1.25, w: 2.65, h: 2.65,
    adjustPoint: 0.28,
    rotate: 22,
    fill: { color: theme.colors.secondary, transparency: 18 },
    line: { color: theme.colors.light, transparency: 82, width: 1.2 },
  });
  slide.addText("01", {
    x: 11.77, y: 6.7, w: 0.55, h: 0.2,
    fontFace: theme.fonts.body, fontSize: 9,
    color: theme.colors.light, align: "right", margin: 0,
  });
  return slide;
}
`;

const contentSource = `export const slideConfig = {
  index: 2,
  type: "content",
  title: "One idea, made concrete",
};

const points = [
  ["01", "Lead with evidence", "Use a number, fact, or observation that changes the audience's view."],
  ["02", "Explain the implication", "Connect the evidence to a decision instead of repeating it."],
  ["03", "Make the next move clear", "End the slide with one action or choice."],
];

export function createSlide(pres, theme) {
  const slide = pres.addSlide();
  slide.background = { color: theme.colors.bg };
  slide.addText(slideConfig.title, {
    x: 0.72, y: 0.62, w: 8.8, h: 0.55,
    fontFace: theme.fonts.heading, fontSize: 28, bold: true,
    color: theme.colors.text, margin: 0, fit: "shrink",
  });
  slide.addText("Turn this example into the first real argument in the deck.", {
    x: 0.72, y: 1.25, w: 8.6, h: 0.34,
    fontFace: theme.fonts.body, fontSize: 13,
    color: theme.colors.secondary, margin: 0,
  });

  points.forEach(([number, label, detail], index) => {
    const x = 0.72 + index * 4.14;
    slide.addShape(pres.ShapeType.roundRect, {
      x, y: 2.0, w: 3.72, h: 3.6,
      rectRadius: theme.spacing.radius,
      fill: { color: index === 0 ? theme.colors.light : "FFFFFF" },
      line: { color: index === 0 ? theme.colors.accent : theme.colors.light, width: 1 },
      shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 1.5, angle: 45, distance: 1 },
    });
    slide.addText(number, {
      x: x + 0.28, y: 2.3, w: 0.46, h: 0.25,
      fontFace: theme.fonts.body, fontSize: 10, bold: true,
      color: theme.colors.accent, margin: 0,
    });
    slide.addText(label, {
      x: x + 0.28, y: 2.9, w: 2.95, h: 0.56,
      fontFace: theme.fonts.heading, fontSize: 19, bold: true,
      color: theme.colors.text, margin: 0, fit: "shrink",
    });
    slide.addText(detail, {
      x: x + 0.28, y: 3.75, w: 2.95, h: 1.1,
      fontFace: theme.fonts.body, fontSize: 12,
      color: theme.colors.secondary, margin: 0.02, breakLine: false, fit: "shrink",
    });
  });
  slide.addText("02", {
    x: 12.05, y: 6.72, w: 0.5, h: 0.2,
    fontFace: theme.fonts.body, fontSize: 9,
    color: theme.colors.secondary, align: "right", margin: 0,
  });
  return slide;
}
`;

const readme = `# Presentation Studio project

1. Complete the deck brief, narrative spine, evidence register, style route, and slide jobs in presentation-plan.json.
2. Validate the plan with the bundled presentation-studio validate_plan.mjs helper before laying out slides.
3. Replace the example modules in slides/ with one module per slide.
4. Keep every createSlide function synchronous.
5. Build and QA with the bundled presentation-studio build_and_qa.mjs helper.
6. Inspect every PNG in preview/ and fix issues before delivery.
`;

await fs.mkdir(path.join(projectDir, "slides", "imgs"), { recursive: true });
await fs.mkdir(path.join(projectDir, "output"), { recursive: true });
await fs.mkdir(path.join(projectDir, "preview"), { recursive: true });
await fs.writeFile(path.join(projectDir, "theme.json"), JSON.stringify(theme, null, 2));
await fs.writeFile(
  path.join(projectDir, "presentation-plan.json"),
  JSON.stringify(plan, null, 2),
);
await fs.writeFile(path.join(projectDir, "slides", "slide-01.mjs"), coverSource);
await fs.writeFile(path.join(projectDir, "slides", "slide-02.mjs"), contentSource);
await fs.writeFile(path.join(projectDir, "README.md"), readme);

console.log(`[presentation-studio] project created: ${projectDir}`);
console.log(`[presentation-studio] platform fonts: ${fonts.heading} / ${fonts.body}`);

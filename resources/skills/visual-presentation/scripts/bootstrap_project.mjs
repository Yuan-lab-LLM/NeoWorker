#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs, resolvePlatformFonts } from "./runtime-utils.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args["project-dir"]) {
  console.error(
    "Usage: node bootstrap_project.mjs --project-dir <dir> [--title title] [--language auto] [--style bold-editorial]",
  );
  process.exit(2);
}

const projectDir = path.resolve(args["project-dir"]);
const title = String(args.title || "Presentation title");
const language = String(args.language || "auto").toLowerCase();
const styleName = String(args.style || "bold-editorial").toLowerCase();
const fonts = resolvePlatformFonts(language);

const deck = {
  title,
  language,
  audience: "",
  purpose: "",
  style: {
    preset: styleName === "auto" ? "bold-editorial" : styleName,
    fontHeading: fonts.heading,
    fontBody: fonts.body,
    accent: "2F6BFF",
    background: "0B1020",
    foreground: "FFFFFF",
  },
  slides: [
    {
      type: "cover",
      image: "01-cover.png",
      title,
      subtitle: "Replace with one concise promise for the audience.",
      kicker: "PRESENTATION",
      textPlacement: "right",
      textTone: "light",
      source: "",
    },
    {
      type: "statement",
      image: "02-statement.png",
      title: "One decisive idea",
      subtitle: "Explain why it matters in a single sentence.",
      body: [],
      textPlacement: "left",
      textTone: "dark",
      source: "",
    },
    {
      type: "metrics",
      image: "03-metrics.png",
      title: "Evidence, made memorable",
      subtitle: "Use only verified numbers.",
      metrics: [
        { "value": "79%", "label": "Primary metric" },
        { "value": "3.2×", "label": "Change" },
        { "value": "12", "label": "Key count" }
      ],
      textPlacement: "bottom",
      textTone: "light",
      source: "Source: replace with the real source",
    },
    {
      type: "closing",
      image: "04-closing.png",
      title: "Make the next move clear",
      subtitle: "One action, one owner, one deadline.",
      textPlacement: "center",
      textTone: "light",
      source: "",
    }
  ]
};

const readme = `# Visual Presentation project

1. Replace the sample content in deck.json with final, sourced copy.
2. Write one complete 16:9, text-free image prompt per slide under prompts/.
3. Generate each image into images/ with NeoWorker's generate_image tool.
4. Keep every word, number, label, and citation in deck.json, not the bitmap.
5. Compile with the bundled merge_to_pptx.mjs helper.
6. Fix the same project after QA; do not create a second PPTX route.
`;

await fs.mkdir(path.join(projectDir, "prompts"), { recursive: true });
await fs.mkdir(path.join(projectDir, "images"), { recursive: true });
await fs.mkdir(path.join(projectDir, "output"), { recursive: true });
await fs.writeFile(path.join(projectDir, "deck.json"), JSON.stringify(deck, null, 2));
await fs.writeFile(path.join(projectDir, "README.md"), readme);

console.log(`[visual-presentation] created ${projectDir}`);
console.log(`[visual-presentation] edit ${path.join(projectDir, "deck.json")}`);

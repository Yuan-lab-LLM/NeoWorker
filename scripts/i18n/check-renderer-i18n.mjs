import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const root = process.cwd();
const rendererRoot = path.join(root, "src/renderer");
const allowlistedFiles = new Set([
  path.join(rendererRoot, "i18n/index.ts"),
  path.join(rendererRoot, "i18n/generated-zh.ts"),
  path.join(rendererRoot, "utils/localized-agent-roles.ts"),
  path.join(rendererRoot, "utils/localized-plugin-prompts.ts"),
  path.join(rendererRoot, "utils/localized-progress-text.ts"),
  path.join(rendererRoot, "utils/localized-sidebar-titles.ts"),
  path.join(rendererRoot, "utils/localized-skills.ts"),
  path.join(rendererRoot, "utils/mission-control-copy.ts"),
  path.join(rendererRoot, "utils/run-output-language.ts"),
  path.join(rendererRoot, "utils/semantic-icon-map.ts"),
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "perf-fixtures")
        return [];
      return walk(target);
    }
    if (
      !/\.(?:ts|tsx)$/.test(entry.name) ||
      /\.(?:test|fixture)\.(?:ts|tsx)$/.test(entry.name)
    )
      return [];
    return [target];
  });
}

function isTranslateCall(node, sourceFile) {
  return (
    ts.isCallExpression(node) &&
    /(?:^|\.)(?:translate|t)$/.test(node.expression.getText(sourceFile))
  );
}

function isInsideTranslateCall(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (isTranslateCall(current, sourceFile)) return true;
    current = current.parent;
  }
  return false;
}

function isChineseTemplate(node) {
  return ts.isTemplateExpression(node) && /[一-龥]/.test(node.getText());
}

function isClearlyInternalTemplate(node, sourceFile) {
  const text = node.getText(sourceFile);
  if (/^[`']\^/.test(text)) return true;
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current)) {
      const name = current.name.getText(sourceFile).replace(/["']/g, "");
      if (
        /^(?:prompt|systemPrompt|taskPrompt|instructions?|command|content|body)$/i.test(
          name,
        )
      ) {
        return true;
      }
    }
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText(sourceFile);
      if (/^(?:RegExp|console\.|JSON\.)/.test(callee)) return true;
    }
    if (ts.isJsxExpression(current) || ts.isReturnStatement(current)) break;
  }
  return false;
}

function lineOf(sourceFile, node) {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

const issues = [];
const translationKeys = new Set();
const keyCalls = new Map();
for (const file of walk(rendererRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const allowRawChinese = allowlistedFiles.has(file);
  const add = (node, reason, text) =>
    issues.push({
      file,
      line: lineOf(sourceFile, node),
      reason,
      text: text.replace(/\s+/g, " ").trim().slice(0, 160),
    });

  const visit = (node) => {
    if (isTranslateCall(node, sourceFile)) {
      const key = node.arguments[0];
      if (
        key &&
        (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))
      ) {
        translationKeys.add(key.text);
        if (!keyCalls.has(key.text)) {
          keyCalls.set(key.text, {
            file,
            line: lineOf(sourceFile, key),
            fallback:
              node.arguments[1] &&
              (ts.isStringLiteral(node.arguments[1]) ||
                ts.isNoSubstitutionTemplateLiteral(node.arguments[1]))
                ? node.arguments[1].text
                : "",
          });
        }
      }
      const fallback = node.arguments[1];
      if (
        fallback &&
        (ts.isStringLiteral(fallback) ||
          ts.isNoSubstitutionTemplateLiteral(fallback)) &&
        /[一-龥]/.test(fallback.text)
      )
        add(fallback, "Chinese fallback in translate()", fallback.text);
    }
    if (!allowRawChinese) {
      if (ts.isJsxText(node) && /[一-龥]/.test(node.getText(sourceFile))) {
        add(node, "bare Chinese JSX", node.getText(sourceFile));
      } else if (
        ts.isJsxAttribute(node) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[一-龥]/.test(node.initializer.text)
      ) {
        add(
          node.initializer,
          "bare Chinese JSX attribute",
          node.initializer.text,
        );
      } else if (
        (ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node)) &&
        !ts.isJsxAttribute(node.parent) &&
        !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) &&
        !ts.isLiteralTypeNode(node.parent) &&
        !isInsideTranslateCall(node, sourceFile) &&
        /[一-龥]/.test(node.text)
      ) {
        add(node, "bare Chinese string literal", node.text);
      } else if (
        isChineseTemplate(node) &&
        !isInsideTranslateCall(node, sourceFile) &&
        !isClearlyInternalTemplate(node, sourceFile)
      ) {
        add(node, "bare Chinese template expression", node.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  for (const match of source.matchAll(
    /(?:toLocale(?:Date|Time|String)|Intl\.[A-Za-z]+Format)\(\s*["']zh-CN["']/g,
  )) {
    const position = match.index ?? 0;
    const line = source.slice(0, position).split("\n").length;
    issues.push({
      file,
      line,
      reason: "hard-coded zh-CN locale",
      text: match[0],
    });
  }
}

const englishDictionarySource = fs.readFileSync(
  path.join(rendererRoot, "i18n/index.ts"),
  "utf8",
);
const englishSectionStart = englishDictionarySource.indexOf("  en: {");
const chineseSectionStart = englishDictionarySource.indexOf('\n  "zh-CN": {');
const englishSection = englishDictionarySource.slice(
  englishSectionStart,
  chineseSectionStart,
);
const chineseSection = englishDictionarySource.slice(chineseSectionStart);
const generatedChineseSource = fs.readFileSync(
  path.join(rendererRoot, "i18n/generated-zh.ts"),
  "utf8",
);
const englishKeys = new Set(
  [...englishSection.matchAll(/^\s{4}"([^"]+)":/gm)].map((match) => match[1]),
);
const generatedChineseKeys = new Set(
  [...generatedChineseSource.matchAll(/^\s{2}"([^"]+)":/gm)].map(
    (match) => match[1],
  ),
);
for (const key of translationKeys) {
  const call = keyCalls.get(key);
  if (
    !englishKeys.has(key) &&
    (!call?.fallback || /[一-龥]/.test(call.fallback))
  ) {
    issues.push({
      file: path.join(rendererRoot, "i18n/index.ts"),
      line: 1,
      reason: "missing English translation key",
      text: key,
    });
  }
  if (
    !generatedChineseKeys.has(key) &&
    !new RegExp(
      `^\\s{4}"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`,
      "m",
    ).test(chineseSection)
  ) {
    issues.push({
      file: path.join(rendererRoot, "i18n/index.ts"),
      line: 1,
      reason: "missing Chinese translation key",
      text: key,
    });
  }
}

if (issues.length) {
  console.error(
    `[i18n] Found ${issues.length} English-mode localization leak(s):`,
  );
  for (const issue of issues) {
    console.error(
      `${path.relative(root, issue.file)}:${issue.line} ${issue.reason}: ${issue.text}`,
    );
  }
  process.exit(1);
}

console.log(
  `[i18n] Renderer audit passed (${walk(rendererRoot).length} source files checked).`,
);

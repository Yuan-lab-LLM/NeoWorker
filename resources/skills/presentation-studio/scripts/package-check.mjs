// Only for freshly generated PptxGenJS packages, never for source-deck edits.
// PptxGenJS 4.0.1 emits one slide-master content-type override per slide even
// though it writes a single master. Remove only those unused declarations.
// Missing parts that are referenced, or of any other type, remain hard errors.
export async function normalizeGeneratedPackage(zip) {
  const manifest = zip.file("[Content_Types].xml");
  if (!manifest) throw new Error("Generated PPTX has no content-type manifest.");
  const relationships = (await Promise.all(Object.keys(zip.files)
    .filter(name => name.endsWith(".rels"))
    .map(name => zip.file(name).async("string")))).join("\n");
  const removed = [];
  const xml = (await manifest.async("string")).replace(/<Override\b[^>]*\/>/g, declaration => {
    const part = declaration.match(/PartName="\/([^"]+)"/)?.[1];
    if (!part || zip.file(part)) return declaration;
    const basename = part.split("/").at(-1);
    if (!/^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(part) || relationships.includes(basename)) {
      throw new Error(`Generated PPTX declares a missing part: ${part}`);
    }
    removed.push(part);
    return "";
  });
  if (removed.length) zip.file("[Content_Types].xml", xml);
  // The catalog has flat category labels. PptxGenJS encodes even a single level
  // as multiLvlStrRef, which some importers do not support. Express that same
  // single level as strRef/strCache; retain the formula, every point and workbook.
  // Real multi-level axes in custom module projects remain untouched.
  for (const name of Object.keys(zip.files).filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name))) {
    const original = await zip.file(name).async("string");
    let flattened = 0;
    const normalized = original.replace(/<c:multiLvlStrRef>[\s\S]*?<\/c:multiLvlStrRef>/g, reference => {
      if ((reference.match(/<c:lvl>/g) || []).length !== 1) return reference;
      flattened += 1;
      return reference.replaceAll("c:multiLvlStrRef", "c:strRef")
        .replaceAll("c:multiLvlStrCache", "c:strCache")
        .replace(/<\/?c:lvl>/g, "");
    });
    if (flattened) {
      zip.file(name, normalized);
      removed.push(`${name}: normalized ${flattened} single-level category cache(s)`);
    }
  }
  return removed;
}

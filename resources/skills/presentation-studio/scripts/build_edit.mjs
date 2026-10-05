// Applies a reviewed native design plan and renders that exact candidate.
// Output is a private draft until its pages have been visually reviewed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyNativeEditPlan } from './native-edit.mjs';
import { inspectEditedDeck } from './inspect_edit.mjs';
import { parseArgs } from './runtime-utils.mjs';
import { renderDeck } from './render_deck.mjs';
export async function buildNativeEdit({ source, plan, workdir }) {
    // A new directory per revision prevents stale PDF/PNG evidence from being
    // paired with a newer candidate and keeps every previous revision intact.
    await fs.mkdir(workdir, { recursive: false });
    const candidate = path.join(workdir, 'candidate.pptx');
    const report = { status: 'blocked', visualInspection: 'pending', errors: [] };
    try {
        await fs.writeFile(path.join(workdir, 'edit-plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
        report.write = await applyNativeEditPlan({ source, plan, candidate });
        const preview = path.join(workdir, 'preview');
        report.renderer = await renderDeck({ source: candidate, outdir: preview });
        const pdf = report.renderer.pdf;
        report.inspection = await inspectEditedDeck({ source, candidate, pdf, intent: 'visual' });
        report.errors.push(...report.inspection.errors);
        report.renderedSlideCount = (await fs.readdir(preview)).filter(n => /^slide-\d+\.png$/.test(n)).length;
        if (report.renderedSlideCount !== report.write.slideCount)
            report.errors.push('Rendered slide count differs from the source.');
        report.status = report.errors.length ? 'blocked' : 'requires-visual-review';
    }
    catch (error) {
        report.errors.push(error.message);
    }
    finally {
        await fs.writeFile(path.join(workdir, 'edit-qa.json'), JSON.stringify(report, null, 2));
    }
    return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const args = parseArgs(process.argv.slice(2));
    if (!args.source || !args.plan || !args.workdir)
        throw new Error('Usage: build_edit.mjs --source original.pptx --plan edit-plan.json --workdir NEW_REVISION_DIRECTORY');
    const report = await buildNativeEdit({ source: path.resolve(args.source), plan: JSON.parse(await fs.readFile(args.plan, 'utf8')), workdir: path.resolve(args.workdir) });
    console.log(JSON.stringify({ status: report.status, errors: report.errors, renderedSlideCount: report.renderedSlideCount,
        changedAppearanceSlides: report.inspection?.changedAppearanceSlides,
        unchangedAppearanceSlides: report.inspection?.unchangedAppearanceSlides,
        warnings: report.inspection?.warnings, visualInspection: report.visualInspection }));
    if (report.errors.length)
        process.exitCode = 1;
}

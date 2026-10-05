// Read-only checks for existing-deck edits. A clean report still requires a
// person/model to inspect the rendered slides; this is not an aesthetic score.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAppRequire, parseArgs } from './runtime-utils.mjs';
import { inspectRenderedLayout } from './rendered-layout-check.mjs';
const require = createAppRequire(import.meta.url);
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const ns = { a:'http://schemas.openxmlformats.org/drawingml/2006/main', p:'http://schemas.openxmlformats.org/presentationml/2006/main', r:'http://schemas.openxmlformats.org/officeDocument/2006/relationships', rel:'http://schemas.openxmlformats.org/package/2006/relationships' };
const descendants = (node, prefix, name) => Array.from(node.getElementsByTagNameNS(ns[prefix], name));
const child = (node, prefix, name) => Array.from(node?.childNodes || []).find(n => n.namespaceURI === ns[prefix] && n.localName === name);
const text = node => descendants(node, 'a', 't').map(n => n.textContent).join('');
const parse = value => {
  const errors=[];
  const doc=new DOMParser({errorHandler:{warning:()=>{},error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(value,'application/xml');
  if(errors.length) throw new Error(`Invalid XML: ${errors.join('; ')}`);
  return doc;
};
const rgb = node => {
  const fill = child(node,'a','solidFill'), color = child(fill,'a','srgbClr');
  // Do not infer inherited/theme/gradient colors or ignore alpha transforms.
  return color && !Array.from(color.childNodes).some(n=>n.nodeType===1) && /^[\da-f]{6}$/i.test(color.getAttribute('val')) ? color.getAttribute('val') : null;
};
export function contrastRatio(a,b) {
  const luminance = hex => {
    const c=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return .2126*c[0]+.7152*c[1]+.0722*c[2];
  };
  const x=luminance(a), y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
function frame(transform) {
  const off=child(transform,'a','off'),ext=child(transform,'a','ext');
  if(!off || !ext || transform.getAttribute('rot')) return null;
  const values=[off.getAttribute('x'),off.getAttribute('y'),ext.getAttribute('cx'),ext.getAttribute('cy')].map(v=>v===''?NaN:Number(v)/914400);
  return values.every(Number.isFinite)?Object.fromEntries(['x','y','w','h'].map((k,i)=>[k,values[i]])):null;
}
function backdrop(bounds,layers,background){
  for(const layer of [...layers].reverse()){
    const b=layer.bounds;
    if(bounds.x>=b.x+b.w || bounds.x+bounds.w<=b.x || bounds.y>=b.y+b.h || bounds.y+bounds.h<=b.y)continue;
    // Only a fully covering opaque rectangle establishes a single background.
    // Rounded corners, pictures, partial overlaps and inherited fills need
    // visual review; comparing them to the slide color causes false failures.
    if(layer.rectangle && layer.color && b.x<=bounds.x && b.y<=bounds.y && b.x+b.w>=bounds.x+bounds.w && b.y+b.h>=bounds.y+bounds.h)return layer.color;
    return null;
  }
  return background;
}
async function readDeck(file) {
  const zip=await JSZip.loadAsync(await fs.readFile(file));
  const xml=async name=>{const part=zip.file(name);if(!part)throw new Error(`Missing part: ${name}`);return parse(await part.async('string'));};
  const root=await xml('ppt/presentation.xml'),size=descendants(root,'p','sldSz')[0];
  const dimensions={w:Number(size.getAttribute('cx'))/914400,h:Number(size.getAttribute('cy'))/914400};
  const rels=await xml('ppt/_rels/presentation.xml.rels');
  const targets=new Map(descendants(rels,'rel','Relationship').filter(n=>n.getAttribute('TargetMode')!=='External').map(n=>{
    const target=n.getAttribute('Target');
    return [n.getAttribute('Id'),path.posix.normalize(target.startsWith('/')?target.slice(1):path.posix.join('ppt',target))];
  }));
  const slides=[];
  for(const id of descendants(root,'p','sldId')){
    const target=targets.get(id.getAttributeNS(ns.r,'id'));
    if(!target?.startsWith('ppt/slides/'))throw new Error('Invalid slide relationship.');
    const doc=await xml(target), index=slides.length+1, boxes=[],errors=[],warnings=[];
    const tree=descendants(doc,'p','spTree')[0], background=rgb(descendants(doc,'p','bgPr')[0]);
    const tables=[],layers=[];
    for(const object of Array.from(tree.childNodes).filter(n=>n.nodeType===1)){
      const name=object.localName;
      if(name==='grpSp'){warnings.push(`Slide ${index}: grouped objects require visual inspection.`);continue;}
      if(!['sp','graphicFrame','pic'].includes(name))continue;
      const id=descendants(object,'p','cNvPr')[0]?.getAttribute('id') || name;
      const bounds=frame(name==='graphicFrame'?child(object,'p','xfrm'):child(child(object,'p','spPr'),'a','xfrm'));
      const table=descendants(object,'a','tbl')[0];
      if(!bounds){if(text(object))warnings.push(`Slide ${index}, object ${id}: inherited/rotated geometry requires visual inspection.`);continue;}
      const label=`Slide ${index}, object ${id}`;
      if((text(object)||name==='pic') && (bounds.x<-.03 || bounds.y<-.03 || bounds.x+bounds.w>dimensions.w+.03 || bounds.y+bounds.h>dimensions.h+.03))errors.push(`${label}: object extends beyond slide bounds.`);
      if(table){
        const rows=descendants(table,'a','tr'),widths=descendants(table,'a','gridCol').map(n=>Number(n.getAttribute('w'))/914400);
        tables.push({rows:rows.length,columns:widths.length});
        let y=bounds.y;
        for(let r=0;r<rows.length;r++){
          const height=Number(rows[r].getAttribute('h'))/914400;let x=bounds.x;
          const cells=Array.from(rows[r].childNodes).filter(n=>n.localName==='tc');
          for(let c=0;c<cells.length;c++){
            const cell=cells[c],field=`${label}, row ${r+1}, column ${c+1}`,value=text(cell);
            if(cell.getAttribute('gridSpan') || cell.getAttribute('rowSpan') || cell.getAttribute('hMerge') || cell.getAttribute('vMerge')){
              warnings.push(`${field}: merged-cell geometry requires visual inspection.`);
            } else if(value) boxes.push({field,text:value,x,y,w:widths[c],h:height});
            checkContrast(cell,rgb(child(cell,'a','tcPr')),field,errors,warnings);
            x+=widths[c] || 0;
          }
          y+=height;
        }
        if(y>dimensions.h+.03 || bounds.x+widths.reduce((a,b)=>a+b,0)>dimensions.w+.03)errors.push(`${label}: native table rows/columns extend beyond slide bounds.`);
      }else if(name==='sp' && text(object)){
        boxes.push({field:label,text:text(object),...bounds});
        const properties=child(object,'p','spPr');
        // Background is only known for explicitly unfilled shapes. A missing
        // fill can inherit a theme style; it is not evidence of transparency.
        const bg=rgb(properties)||(child(properties,'a','noFill')?backdrop(bounds,layers,background):null);
        checkContrast(child(object,'p','txBody'),bg,label,errors,warnings);
      }
      const properties=child(object,'p','spPr');
      if(name!=='sp' || !child(properties,'a','noFill'))layers.push({bounds,color:rgb(properties),rectangle:name==='sp' && child(properties,'a','prstGeom')?.getAttribute('prst')==='rect'});
    }
    const visual=doc.cloneNode(true);
    for(const n of descendants(visual,'a','t'))n.textContent='';
    slides.push({index,textBoxes:boxes,tables,errors,warnings,visual:new XMLSerializer().serializeToString(visual)});
  }
  return {zip,dimensions,slides};
}
function checkContrast(node,bg,label,errors,warnings){
  if(!node || !text(node))return;
  let unknown=!bg,low=false;
  for(const run of descendants(node,'a','r')){
    if(!text(run))continue;
    const fg=rgb(child(run,'a','rPr'));
    if(!fg)unknown=true;
    if(bg && fg && contrastRatio(bg,fg)<3)low=true;
  }
  if(low)errors.push(`${label}: explicit text/background contrast is below 3:1.`);
  if(unknown)warnings.push(`${label}: inherited/theme text or background color requires visual contrast review.`);
}
export async function inspectEditedDeck({source,candidate,pdf,intent='visual'}){
  const [before,after]=await Promise.all([readDeck(source),readDeck(candidate)]);
  const errors=after.slides.flatMap(s=>s.errors),warnings=after.slides.flatMap(s=>s.warnings);
  if(before.slides.length!==after.slides.length)errors.push('Slide count changed; this preservation check requires a separate explicit restructuring contract.');
  if(JSON.stringify(before.dimensions)!==JSON.stringify(after.dimensions))errors.push('Slide dimensions changed.');
  for(let i=0;i<Math.min(before.slides.length,after.slides.length);i++){
    if(JSON.stringify(before.slides[i].tables)!==JSON.stringify(after.slides[i].tables))errors.push(`Slide ${i+1}: table row/column inventory changed.`);
  }
  for(const name of Object.keys(before.zip.files).filter(n=>n.startsWith('ppt/media/')&&!before.zip.files[n].dir)){
    if(!after.zip.file(name) || !(await before.zip.file(name).async('nodebuffer')).equals(await after.zip.file(name).async('nodebuffer')))errors.push(`Source media changed or missing: ${name}`);
  }
  const changedAppearanceSlides=after.slides.filter((s,i)=>s.visual!==before.slides[i]?.visual).map(s=>s.index);
  const unchangedAppearanceSlides=after.slides.filter((s,i)=>s.visual===before.slides[i]?.visual).map(s=>s.index);
  if(intent==='visual' && !changedAppearanceSlides.length)errors.push('No native appearance changes: wording changes alone do not satisfy visual optimization.');
  if(intent==='visual' && unchangedAppearanceSlides.length)warnings.push(`Native appearance is unchanged on slides ${unchangedAppearanceSlides.join(', ')}. Review these pages explicitly; do not describe them as redesigned. Retain them only with a per-page visual rationale.`);
  let rendered=null;
  if(pdf){
    rendered=await inspectRenderedLayout(pdf,after.slides);
    errors.push(...rendered.errors);warnings.push(...rendered.warnings);
  }else if(intent==='visual')errors.push('Rendered PDF is missing; visual optimization remains an unverified draft.');
  return {status:errors.length?'blocked':'requires-visual-review',source:path.resolve(source),candidate:path.resolve(candidate),slideCount:after.slides.length,changedAppearanceSlides,unchangedAppearanceSlides,errors,warnings,rendered,visualInspection:'pending',limitations:['Geometry and explicit-color checks do not certify aesthetics. Inspect every rendered slide against the source.','Inherited colors, grouped/rotated objects and merged cells require visual inspection.']};
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=parseArgs(process.argv.slice(2));
  if(!args.source||!args.candidate)throw new Error('Usage: inspect_edit.mjs --source original.pptx --candidate edited.pptx --pdf rendered.pdf --report report.json [--intent visual|content]');
  if(args.intent && !['visual','content'].includes(args.intent))throw new Error('Unknown edit intent.');
  if(args.report){
    const reportPath=await fs.realpath(args.report).catch(()=>path.resolve(args.report));
    for(const input of [args.source,args.candidate,args.pdf].filter(Boolean))if(reportPath===await fs.realpath(input))throw new Error('Report must not overwrite an input file.');
  }
  const report=await inspectEditedDeck(args);
  if(args.report)await fs.writeFile(args.report,JSON.stringify(report,null,2));
  console.log(JSON.stringify({status:report.status,slideCount:report.slideCount,errors:report.errors,warnings:report.warnings.length}));
  if(report.errors.length)process.exitCode=1;
}

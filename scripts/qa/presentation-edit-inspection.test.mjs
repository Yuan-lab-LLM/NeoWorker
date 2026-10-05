import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTemplateFixture} from './presentation-template-fixture.mjs';
import {loadPresentationRuntime,createAppRequire} from '../../resources/skills/presentation-studio/scripts/runtime-utils.mjs';
import {inspectEditedDeck,contrastRatio} from '../../resources/skills/presentation-studio/scripts/inspect_edit.mjs';
const {JSZip}=loadPresentationRuntime(import.meta.url);
const {DOMParser,XMLSerializer}=createAppRequire(import.meta.url)('@xmldom/xmldom');
const a='http://schemas.openxmlformats.org/drawingml/2006/main',p='http://schemas.openxmlformats.org/presentationml/2006/main';
async function fixture(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'neoworker-edit-inspection-'));
 try{
  const source=path.join(root,'source.pptx'),candidate=path.join(root,'candidate.pptx');
  await createTemplateFixture(source);await fs.copyFile(source,candidate);
  await fn({source,candidate,mutate:async(name,update)=>{
   const zip=await JSZip.loadAsync(await fs.readFile(candidate));
   const doc=new DOMParser().parseFromString(await zip.file(name).async('string'),'application/xml');
   update(doc);zip.file(name,new XMLSerializer().serializeToString(doc));
   await fs.writeFile(candidate,await zip.generateAsync({type:'nodebuffer'}));
  }});
 }finally{await fs.rm(root,{force:true,recursive:true});}
}
test('text-only rewrites cannot certify a visual optimization; source remains immutable',()=>fixture(async({source,candidate,mutate})=>{
 const before=await fs.readFile(source);
 await mutate('ppt/slides/slide2.xml',doc=>{doc.getElementsByTagNameNS(a,'t')[0].textContent='仅换一个标题';});
 const report=await inspectEditedDeck({source,candidate});
 assert.equal(report.status,'blocked');assert.deepEqual(report.changedAppearanceSlides,[]);
 assert.deepEqual(report.unchangedAppearanceSlides,[1,2,3,4]);
 assert.ok(report.errors.some(s=>s.includes('wording changes alone')));
 assert.ok(report.errors.some(s=>s.includes('Rendered PDF is missing')));
 assert.deepEqual(await fs.readFile(source),before);
 const content=await inspectEditedDeck({source,candidate,intent:'content'});
 assert.ok(!content.errors.some(s=>s.includes('wording changes alone')));
 assert.equal(content.visualInspection,'pending');
}));
test('real geometry/style changes still need rendered evidence and explicit low contrast is detected',()=>fixture(async({source,candidate,mutate})=>{
 await mutate('ppt/slides/slide2.xml',doc=>{
  const sp=Array.from(doc.getElementsByTagNameNS(p,'sp')).find(n=>n.getElementsByTagNameNS(a,'t').length);
  const pr=sp.getElementsByTagNameNS(p,'spPr')[0];
  for(const n of Array.from(pr.childNodes))if(['solidFill','noFill','gradFill'].includes(n.localName))pr.removeChild(n);
  const color=()=>{const f=doc.createElementNS(a,'a:solidFill'),c=doc.createElementNS(a,'a:srgbClr');c.setAttribute('val','FFFFFF');f.appendChild(c);return f;};
  pr.appendChild(color());
  for(const r of Array.from(sp.getElementsByTagNameNS(a,'rPr'))){
   for(const n of Array.from(r.childNodes))if(n.localName==='solidFill')r.removeChild(n);
   r.appendChild(color());
  }
 });
 const report=await inspectEditedDeck({source,candidate});
 assert.deepEqual(report.changedAppearanceSlides,[2]);
 assert.deepEqual(report.unchangedAppearanceSlides,[1,3,4]);
 assert.ok(report.warnings.some(s=>s.includes('unchanged on slides 1, 3, 4')));
 assert.ok(report.errors.some(s=>s.includes('contrast is below')));
 assert.equal(report.status,'blocked');
 assert.equal(contrastRatio('FFFFFF','FFFFFF'),1);
 assert.ok(contrastRatio('000000','FFFFFF')>20);
}));
test('table row geometry and inventory are checked instead of trusting package validity',()=>fixture(async({source,candidate,mutate})=>{
 await mutate('ppt/slides/slide3.xml',doc=>{doc.getElementsByTagNameNS(a,'tr')[0].setAttribute('h','9144000');});
 let report=await inspectEditedDeck({source,candidate,intent:'content'});
 assert.ok(report.errors.some(s=>s.includes('native table rows/columns extend')));
 await mutate('ppt/slides/slide3.xml',doc=>{const rows=doc.getElementsByTagNameNS(a,'tr');rows[rows.length-1].parentNode.removeChild(rows[rows.length-1]);});
 report=await inspectEditedDeck({source,candidate,intent:'content'});
 assert.ok(report.errors.some(s=>s.includes('table row/column inventory changed')));
}));
test('layered text is checked against an opaque card, not the slide background',()=>fixture(async({source,candidate,mutate})=>{
 await mutate('ppt/slides/slide2.xml',doc=>{
  const sp=Array.from(doc.getElementsByTagNameNS(p,'sp')).find(n=>n.getElementsByTagNameNS(a,'t').length);
  const bg=sp.cloneNode(true);bg.getElementsByTagNameNS(p,'cNvPr')[0].setAttribute('id','90001');
  for(const t of Array.from(bg.getElementsByTagNameNS(a,'t')))t.textContent='';
  for(const [shape,color] of [[bg,'172033'],[sp,null]]){
   const pr=shape.getElementsByTagNameNS(p,'spPr')[0];
   for(const n of Array.from(pr.childNodes))if(['solidFill','noFill','gradFill'].includes(n.localName))pr.removeChild(n);
   const f=doc.createElementNS(a,color?'a:solidFill':'a:noFill');
   if(color){const c=doc.createElementNS(a,'a:srgbClr');c.setAttribute('val',color);f.appendChild(c);}
   pr.appendChild(f);
  }
  bg.getElementsByTagNameNS(a,'prstGeom')[0].setAttribute('prst','rect');
  for(const r of Array.from(sp.getElementsByTagNameNS(a,'rPr'))){
   for(const n of Array.from(r.childNodes))if(n.localName==='solidFill')r.removeChild(n);
   const f=doc.createElementNS(a,'a:solidFill'),c=doc.createElementNS(a,'a:srgbClr');c.setAttribute('val','FFFFFF');f.appendChild(c);r.appendChild(f);
  }
  sp.parentNode.insertBefore(bg,sp);
 });
 let report=await inspectEditedDeck({source,candidate});
 assert.ok(!report.errors.some(s=>s.startsWith('Slide 2,')&&s.includes('contrast')));
 await mutate('ppt/slides/slide2.xml',doc=>{
  const bg=Array.from(doc.getElementsByTagNameNS(p,'sp')).find(s=>s.getElementsByTagNameNS(p,'cNvPr')[0].getAttribute('id')==='90001');
  bg.getElementsByTagNameNS(a,'solidFill')[0].firstChild.setAttribute('val','FFFFFF');
 });
 report=await inspectEditedDeck({source,candidate});
 assert.ok(report.errors.some(s=>s.startsWith('Slide 2,')&&s.includes('contrast is below')));
 await mutate('ppt/slides/slide2.xml',doc=>{
  const bg=Array.from(doc.getElementsByTagNameNS(p,'sp')).find(s=>s.getElementsByTagNameNS(p,'cNvPr')[0].getAttribute('id')==='90001');
  bg.getElementsByTagNameNS(a,'prstGeom')[0].setAttribute('prst','roundRect');
 });
 report=await inspectEditedDeck({source,candidate});
 assert.ok(!report.errors.some(s=>s.startsWith('Slide 2,')&&s.includes('contrast')));
 assert.ok(report.warnings.some(s=>s.startsWith('Slide 2,')&&s.includes('visual contrast review')));
}));

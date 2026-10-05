// Run with Electron after build:electron. Pixel checks catch stale/partial
// frames; distinct hashes and page counts alone missed the RAG preview bug.
const { app, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { renderOfficeHtmlVisualEvidence } = require('../../dist/electron/electron/utils/office-html-visual-renderer.js');
app.on('window-all-closed', () => {});
(async () => {
  await app.whenReady();
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'neoworker-office-pagination-'));
  const colors = [[210,30,40], [25,160,75], [30,65,220], [200,140,25]];
  function check(bytes, expected, width, height) {
    const image = nativeImage.createFromBuffer(bytes);
    const size = image.getSize();
    assert.equal(size.width / size.height, width / height, `Incorrect page ratio: ${JSON.stringify(size)}`);
    const bitmap = image.toBitmap();
    for (const [x, y] of [[.03,.03],[.97,.03],[.03,.97],[.97,.97],[.8,.5]]) {
      const offset = (Math.floor(size.height*y)*size.width + Math.floor(size.width*x))*4;
      const rgb = [bitmap[offset+2],bitmap[offset+1],bitmap[offset]];
      assert(rgb.every((v,i)=>Math.abs(v-expected[i])<=2), `Stale/cropped page: wanted ${expected}, got ${rgb}`);
    }
  }
  for (const [kind,width,height] of [['nested',1280,720],['oversize',2100,1500],['document',794,1123],['dynamic',960,540]]) {
    const selector = kind === 'document' ? 'page' : 'slide';
    const html = path.join(output, `${kind}.html`);
    const pages = colors.map((c,i)=>`<div class="${selector}" style="background:rgb(${c})">Page ${i+1}</div>`).join('');
    await fs.writeFile(html, `<!doctype html><style>*{box-sizing:border-box}body{margin:0;display:flex;height:100vh;overflow:hidden}.sidebar{width:180px;flex-shrink:0;background:black}.main{overflow:auto;flex:1;padding:20px;scroll-behavior:smooth}.slide,.page{position:relative;width:${width}px;height:${height}px;margin:24px;flex-shrink:0;transform-origin:top left;color:white;font:24px sans-serif}</style><aside class="sidebar">Navigation</aside><main class="main">${kind === 'dynamic' ? colors.map((c,i)=>`<button class="thumb" onclick="document.querySelector('.slide').style.background='rgb(${c})';document.querySelector('.slide').textContent='Page ${i+1}'">${i+1}</button>`).join('')+pages.slice(0,pages.indexOf('</div>')+6) : pages}</main><script>addEventListener('resize',()=>{document.querySelectorAll('.slide').forEach(s=>{s.style.transform='scale(.75)';s.parentElement.style.width='75%';s.parentElement.style.height='75%';})})</script>`);
    const result = await renderOfficeHtmlVisualEvidence({htmlPath:html,outputPath:path.join(output,`${kind}.png`)});
    assert.equal(result.pageCount,colors.length);
    for (const [i,file] of result.imagePaths.entries()) check(await fs.readFile(file),colors[i],width,height);
  }
  console.log(JSON.stringify({passed:true, pages:16, cases:['nested scroll container','oversized page','portrait document','dynamic slides'], output}));
})().then(()=>app.exit(0),error=>{console.error(error);app.exit(1)});

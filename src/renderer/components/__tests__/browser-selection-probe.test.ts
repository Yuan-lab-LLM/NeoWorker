import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserSelectionProbe } from '../browser-selection-probe';
const rect = (left: number, top: number, right: number, bottom: number) => ({left, top, right, bottom, width:right-left, height:bottom-top});
function page(rects: ReturnType<typeof rect>[], text='Selected article paragraphs') {
  vi.stubGlobal('document', {activeElement:{closest:()=>null}});
  vi.stubGlobal('window', {innerWidth:1000, innerHeight:700, getSelection:()=>({toString:()=>text, rangeCount:1,getRangeAt:()=>({getClientRects:()=>rects, getBoundingClientRect:()=>rect(0,-400,1400,3000)})})});
}
afterEach(()=>vi.unstubAllGlobals());
describe('guest selection anchor',()=>{
  it('keeps a multi-paragraph selection actionable when its range extends beyond the viewport',()=>{
    page([rect(40,-100,600,-80),rect(40,90,600,110),rect(40,200,700,240),rect(0,2800,1400,3000)]);
    expect(browserSelectionProbe()).toEqual({text:'Selected article paragraphs',x:200,y:240});
  });
  it('anchors to the visible end of a partially visible last line',()=>{
    page([rect(20,680,600,720)]);
    expect(browserSelectionProbe()?.y).toBe(700);
  });
  it('does not offer actions on hidden selections, editable content, or oversized text',()=>{
    page([rect(0,800,900,900)]);expect(browserSelectionProbe()).toBeNull();
    page([rect(0,10,900,30)],'x'.repeat(12001));expect(browserSelectionProbe()).toBeNull();
    page([rect(0,10,900,30)]);vi.stubGlobal('document',{activeElement:{closest:()=>({})}});expect(browserSelectionProbe()).toBeNull();
  });
});

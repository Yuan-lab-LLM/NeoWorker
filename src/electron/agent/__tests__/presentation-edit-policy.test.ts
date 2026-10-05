import { describe, expect, it } from 'vitest';
import { preservePresentationStructure, resolvePresentationEditIntent, presentationEditGuidance } from '../presentation-edit-policy';
describe('presentation content edit scope', () => {
  it.each(['基于PPT形式，优化内容，同样使用这个PPT模板', '优化这个 PPT', 'polish the attached deck', '精简内容，不增加页面', '保持一页，优化表达', "polish content, don't add slides", '不需要增加很多页', '不要拆页'])('preserves structure for %s', request => {
    expect(preservePresentationStructure(request)).toBe(true);
  });
  it.each(['拆成七页', '优化内容，增加两页', 'expand the deck into 7 slides', 'remove 2 slides'])('allows explicit restructuring: %s', request => {
    expect(preservePresentationStructure(request, true)).toBe(false);
  });
  it('does not impose the source page count on a new template-based deck', () => {
    expect(preservePresentationStructure('基于 PDF 内容使用模板生成 PPT')).toBe(false);
  });
  it('retains scope for a continuation', () => expect(preservePresentationStructure('继续', true)).toBe(true));
  it.each(['优化PPT', '美化这个 PPT', '改进这份幻灯片', 'polish the attached deck', 'improve this presentation', '保持内容不变，重新排版'])('allows visual improvement while preserving the page roster: %s', request => {
    expect(preservePresentationStructure(request)).toBe(true);
    expect(resolvePresentationEditIntent(request)).toBe('visual');
  });
  it.each(['优化这个 PPT 的内容', '只优化文字，不改变版式', '保持原版式，优化PPT', '只改措辞', 'polish the wording', 'improve text only, preserve layout'])('honors explicit content-only scope: %s', request => {
    expect(resolvePresentationEditIntent(request, 'visual')).toBe('content');
  });
  it('inherits a continuation but can expand the visual scope explicitly', () => {
    expect(resolvePresentationEditIntent('继续', 'visual')).toBe('visual');
    expect(resolvePresentationEditIntent('排版也优化一下', 'content')).toBe('visual');
  });
  it('does not recommend a forbidden legacy generator or certify fit from word count', () => {
    for(const intent of ['content','visual'] as const){
      const guidance=presentationEditGuidance(intent);
      expect(guidance).not.toContain('使用 create_presentation');
      expect(guidance).toContain('原页数');
    }
    expect(presentationEditGuidance('visual')).toContain('inspect_edit.mjs');
    expect(presentationEditGuidance('content')).toContain('文字变短都不能证明没有溢出');
  });
});

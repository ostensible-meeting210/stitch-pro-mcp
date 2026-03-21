import { describe, it, expect } from 'vitest';
import { AccessibilityFixProcessor } from '../../../src/pipeline/processors/accessibility-fix.js';
import { createContext } from '../../../src/pipeline/context.js';

const processor = new AccessibilityFixProcessor();

const BAD_HTML = `<!DOCTYPE html><html><head></head><body>
<div>
  <img src="/photo.jpg">
  <button></button>
  <a href="/page"></a>
  <div>No main element here</div>
</div>
</body></html>`;

const GOOD_HTML = `<!DOCTYPE html><html lang="en"><head></head><body>
<main>
  <img src="/photo.jpg" alt="A photo">
  <button aria-label="Submit">Submit</button>
  <a href="/page">Go to page</a>
</main>
</body></html>`;

describe('AccessibilityFixProcessor', () => {
  it('should skip when accessibility is disabled', () => {
    const ctx = { ...createContext({ prompt: 'test', enableAccessibility: false }), processedHtml: BAD_HTML };
    expect(processor.shouldRun(ctx)).toBe(false);
  });

  it('should run when accessibility is enabled and HTML exists', () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    expect(processor.shouldRun(ctx)).toBe(true);
  });

  it('should add lang attribute to html element', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('lang="en"');
  });

  it('should add alt="" to images missing alt', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('alt=""');
  });

  it('should wrap content in main element if missing', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('<main>');
  });

  it('should add min touch target sizes to interactive elements', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('min-h-[44px]');
    expect(result.processedHtml).toContain('min-w-[44px]');
  });

  it('should return an accessibility report', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: BAD_HTML };
    const result = await processor.process(ctx);

    expect(result.accessibilityReport).toBeDefined();
    expect(result.accessibilityReport!.fixesApplied).toBeGreaterThan(0);
    expect(typeof result.accessibilityReport!.passes).toBe('number');
  });

  it('should not break already-accessible HTML', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: GOOD_HTML };
    const result = await processor.process(ctx);

    // Should still contain all original content
    expect(result.processedHtml).toContain('lang="en"');
    expect(result.processedHtml).toContain('alt="A photo"');
    expect(result.processedHtml).toContain('<main>');
  });
});

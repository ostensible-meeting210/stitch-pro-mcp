import { describe, it, expect } from 'vitest';
import { ResponsiveInjectProcessor } from '../../../src/pipeline/processors/responsive-inject.js';
import { DesignSystemEnrichProcessor, DesignSystemEnforceProcessor } from '../../../src/pipeline/processors/design-system-enforce.js';
import { ComponentExtractProcessor } from '../../../src/pipeline/processors/component-extract.js';
import { createContext } from '../../../src/pipeline/context.js';
import type { DesignSystem } from '../../../src/types/design-system.js';

const SAMPLE_HTML = `<!DOCTYPE html><html><head></head><body>
<div class="w-[1200px] grid-cols-3 px-20 text-5xl">
  <h1>Hello</h1>
  <button class="bg-primary px-4 py-2 rounded">Click</button>
  <input type="text" name="search" />
</div>
</body></html>`;

const SAMPLE_DS: DesignSystem = {
  id: 'test-ds',
  name: 'Test',
  version: '1.0.0',
  brand: { name: 'Test', personality: ['modern'] },
  tokens: {
    colors: {
      primary: { '500': '#3B82F6' },
      secondary: { '500': '#8B5CF6' },
      neutral: { '500': '#6B7280' },
      success: { '500': '#22C55E' },
      warning: { '500': '#F59E0B' },
      error: { '500': '#EF4444' },
    },
    typography: {
      fontFamilies: { heading: 'Inter', body: 'Inter' },
      sizes: { body: { size: '16px', lineHeight: '1.5', weight: '400' } },
    },
    spacing: { '4': '16px' },
    radii: { md: '8px' },
    shadows: { sm: '0 1px 2px rgba(0,0,0,0.05)' },
  },
  rules: [],
};

describe('ResponsiveInjectProcessor', () => {
  const processor = new ResponsiveInjectProcessor();

  it('should have correct name and phase', () => {
    expect(processor.name).toBe('responsive-inject');
    expect(processor.phase).toBe('post-generate');
  });

  it('should skip when enableResponsive is false', () => {
    const ctx = createContext({ prompt: 'test', enableResponsive: false });
    expect(processor.shouldRun({ ...ctx, processedHtml: '<div></div>' })).toBe(false);
  });

  it('should replace fixed widths with responsive classes', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: SAMPLE_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('w-full max-w-7xl');
    expect(result.processedHtml).not.toContain('w-[1200px]');
  });

  it('should replace grid-cols-3 with responsive grid', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: SAMPLE_HTML };
    const result = await processor.process(ctx);

    // grid-cols-3 gets responsive treatment
    expect(result.processedHtml).toContain('lg:grid-cols-3');
    expect(result.processedHtml).not.toContain('"grid-cols-3"');
  });

  it('should replace large text sizes with responsive variants', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: SAMPLE_HTML };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('sm:text-3xl');
    expect(result.processedHtml).toContain('lg:text-5xl');
  });

  it('should add viewport meta if missing', async () => {
    const ctx = { ...createContext({ prompt: 'test' }), processedHtml: '<head></head><body>hi</body>' };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain('viewport');
    expect(result.processedHtml).toContain('width=device-width');
  });
});

describe('DesignSystemEnrichProcessor', () => {
  const processor = new DesignSystemEnrichProcessor();

  it('should skip when no design system', () => {
    const ctx = createContext({ prompt: 'test' });
    expect(processor.shouldRun(ctx)).toBe(false);
  });

  it('should enrich prompt with design tokens', async () => {
    const ctx = { ...createContext({ prompt: 'build a page' }), designSystem: SAMPLE_DS };
    const result = await processor.process(ctx);

    expect(result.enrichedPrompt).toContain('build a page');
    expect(result.enrichedPrompt).toContain('DESIGN SYSTEM');
    expect(result.enrichedPrompt).toContain('Inter');
    expect(result.enrichedPrompt).toContain('#3B82F6');
  });
});

describe('DesignSystemEnforceProcessor', () => {
  const processor = new DesignSystemEnforceProcessor();

  it('should inject CSS custom properties into HTML', async () => {
    const ctx = {
      ...createContext({ prompt: 'test' }),
      designSystem: SAMPLE_DS,
      processedHtml: '<html><head></head><body>content</body></html>',
    };
    const result = await processor.process(ctx);

    expect(result.processedHtml).toContain(':root');
    expect(result.processedHtml).toContain('--color-primary-500: #3B82F6');
    expect(result.processedHtml).toContain("--font-heading: 'Inter'");
    expect(result.processedHtml).toContain('--radius-md: 8px');
  });
});

describe('ComponentExtractProcessor', () => {
  const processor = new ComponentExtractProcessor();

  it('should skip when framework is html', () => {
    const ctx = createContext({ prompt: 'test', framework: 'html' });
    expect(processor.shouldRun(ctx)).toBe(false);
  });

  it('should run when framework is react', () => {
    const ctx = { ...createContext({ prompt: 'test', framework: 'react' }), processedHtml: '<div></div>' };
    expect(processor.shouldRun(ctx)).toBe(true);
  });

  it('should extract component tree from HTML', async () => {
    const ctx = {
      ...createContext({ prompt: 'test', framework: 'react' }),
      processedHtml: `<html><head></head><body><nav><a href="/">Home</a></nav><main><h1>Hello</h1></main></body></html>`,
    };
    const result = await processor.process(ctx);

    expect(result.componentTree).toBeDefined();
    expect(result.componentTree!.root.tag).toBe('body');
    expect(result.componentTree!.extractedComponents.length).toBeGreaterThan(0);
  });
});

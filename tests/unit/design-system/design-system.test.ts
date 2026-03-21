import { describe, it, expect } from 'vitest';
import { createContext } from '../../../src/pipeline/context.js';
import { PipelineEngine } from '../../../src/pipeline/engine.js';
import { DesignSystemEnrichProcessor, DesignSystemEnforceProcessor } from '../../../src/pipeline/processors/design-system-enforce.js';
import type { DesignSystem } from '../../../src/types/design-system.js';

const DS: DesignSystem = {
  id: 'ds-1',
  name: 'Acme Corp',
  version: '1.0.0',
  brand: { name: 'Acme', industry: 'SaaS', personality: ['professional', 'modern'], primaryColor: '#6366F1' },
  tokens: {
    colors: {
      primary: { '50': '#EEF2FF', '500': '#6366F1', '900': '#312E81' },
      secondary: { '500': '#8B5CF6' },
      neutral: { '50': '#F9FAFB', '500': '#6B7280', '900': '#111827' },
      success: { '500': '#22C55E' },
      warning: { '500': '#F59E0B' },
      error: { '500': '#EF4444' },
    },
    typography: {
      fontFamilies: { heading: 'Poppins', body: 'Inter', mono: 'Fira Code' },
      sizes: {
        'heading-1': { size: '36px', lineHeight: '1.2', weight: '700' },
        'body': { size: '16px', lineHeight: '1.5', weight: '400' },
      },
    },
    spacing: { '1': '4px', '4': '16px', '8': '32px' },
    radii: { sm: '4px', md: '8px', lg: '16px' },
    shadows: { md: '0 4px 6px rgba(0,0,0,0.07)' },
  },
  rules: [
    { id: 'max-fonts', description: 'Max 2 font families', severity: 'error', validator: 'maxFonts' },
  ],
};

describe('Design System Full Pipeline', () => {
  it('should enrich prompt then enforce tokens in generated HTML', async () => {
    const engine = new PipelineEngine();
    engine.register(new DesignSystemEnrichProcessor());
    engine.register(new DesignSystemEnforceProcessor());

    const ctx = {
      ...createContext({ prompt: 'pricing page', designSystem: DS }),
      processedHtml: '<html><head></head><body><div style="color: blue">Hello</div></body></html>',
    };

    // Run pre-generate (enrich) then simulate stitch, then post-generate (enforce)
    const result = await engine.execute(ctx);

    // Enrichment happened
    expect(result.context.enrichedPrompt).toContain('Poppins');
    expect(result.context.enrichedPrompt).toContain('#6366F1');

    // Enforcement happened
    expect(result.context.processedHtml).toContain('--color-primary-500: #6366F1');
    expect(result.context.processedHtml).toContain("--font-heading: 'Poppins'");
    expect(result.context.processedHtml).toContain("--font-body: 'Inter'");
    expect(result.context.processedHtml).toContain("--font-mono: 'Fira Code'");
    expect(result.context.processedHtml).toContain('--radius-lg: 16px');
  });

  it('should handle HTML without head tag', async () => {
    const engine = new PipelineEngine();
    engine.register(new DesignSystemEnforceProcessor());

    const ctx = {
      ...createContext({ prompt: 'test', designSystem: DS }),
      processedHtml: '<div>no head tag here</div>',
    };

    const result = await engine.execute(ctx);

    // Should still inject CSS vars at the top
    expect(result.context.processedHtml).toContain(':root');
    expect(result.context.processedHtml).toContain('--color-primary-500');
  });
});

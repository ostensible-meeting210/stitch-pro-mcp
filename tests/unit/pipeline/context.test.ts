import { describe, it, expect } from 'vitest';
import { createContext } from '../../../src/pipeline/context.js';

describe('createContext', () => {
  it('should create context with defaults', () => {
    const ctx = createContext({ prompt: 'build a landing page' });

    expect(ctx.originalPrompt).toBe('build a landing page');
    expect(ctx.deviceType).toBe('DESKTOP');
    expect(ctx.framework).toBe('html');
    expect(ctx.componentLibrary).toBe('none');
    expect(ctx.enableAccessibility).toBe(true);
    expect(ctx.enableResponsive).toBe(true);
    expect(ctx.errors).toEqual([]);
    expect(ctx.id).toBeDefined();
    expect(ctx.id.length).toBeGreaterThan(0);
  });

  it('should override defaults with provided options', () => {
    const ctx = createContext({
      prompt: 'mobile app',
      deviceType: 'MOBILE',
      framework: 'react',
      componentLibrary: 'shadcn',
      enableAccessibility: false,
      enableResponsive: false,
    });

    expect(ctx.deviceType).toBe('MOBILE');
    expect(ctx.framework).toBe('react');
    expect(ctx.componentLibrary).toBe('shadcn');
    expect(ctx.enableAccessibility).toBe(false);
    expect(ctx.enableResponsive).toBe(false);
  });

  it('should generate unique IDs', () => {
    const ctx1 = createContext({ prompt: 'a' });
    const ctx2 = createContext({ prompt: 'b' });

    expect(ctx1.id).not.toBe(ctx2.id);
  });
});

import { describe, it, expect } from 'vitest';
import { PipelineEngine } from '../../../src/pipeline/engine.js';
import type { Processor, PipelineContext } from '../../../src/types/pipeline.js';
import { createContext } from '../../../src/pipeline/context.js';

function makeProcessor(
  name: string,
  phase: Processor['phase'],
  transform: (ctx: PipelineContext) => Partial<PipelineContext> = () => ({}),
  shouldRunFn: (ctx: PipelineContext) => boolean = () => true,
): Processor {
  return {
    name,
    phase,
    shouldRun: shouldRunFn,
    process: async (ctx) => ({ ...ctx, ...transform(ctx) }),
  };
}

describe('PipelineEngine', () => {
  it('should execute processors in phase order', async () => {
    const order: string[] = [];
    const engine = new PipelineEngine();

    engine.register(makeProcessor('convert-step', 'convert', (ctx) => {
      order.push('convert');
      return {};
    }));
    engine.register(makeProcessor('pre-step', 'pre-generate', (ctx) => {
      order.push('pre-generate');
      return {};
    }));
    engine.register(makeProcessor('post-step', 'post-generate', (ctx) => {
      order.push('post-generate');
      return {};
    }));

    const ctx = createContext({ prompt: 'test' });
    await engine.execute(ctx);

    expect(order).toEqual(['pre-generate', 'post-generate', 'convert']);
  });

  it('should skip processors where shouldRun returns false', async () => {
    const engine = new PipelineEngine();
    let ran = false;

    engine.register(makeProcessor('skip-me', 'post-generate', () => {
      ran = true;
      return {};
    }, () => false));

    const ctx = createContext({ prompt: 'test' });
    await engine.execute(ctx);

    expect(ran).toBe(false);
  });

  it('should inject stitch API call between pre-generate and post-generate', async () => {
    const order: string[] = [];
    const engine = new PipelineEngine();

    engine.register(makeProcessor('pre', 'pre-generate', () => {
      order.push('pre');
      return {};
    }));
    engine.register(makeProcessor('post', 'post-generate', () => {
      order.push('post');
      return {};
    }));

    const ctx = createContext({ prompt: 'test' });
    const stitchCall = async (c: PipelineContext) => {
      order.push('stitch-api');
      return { ...c, rawHtml: '<div>generated</div>', processedHtml: '<div>generated</div>' };
    };

    await engine.execute(ctx, stitchCall);

    expect(order).toEqual(['pre', 'stitch-api', 'post']);
  });

  it('should accumulate non-fatal processor errors and continue', async () => {
    const engine = new PipelineEngine();

    engine.register({
      name: 'failing-processor',
      phase: 'post-generate',
      shouldRun: () => true,
      process: async () => { throw new Error('something broke'); },
    });

    engine.register(makeProcessor('after-fail', 'post-generate', () => ({
      metadata: { afterFailRan: true },
    })));

    const ctx = createContext({ prompt: 'test' });
    const result = await engine.execute(ctx);

    expect(result.success).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('something broke');
    expect(result.context.metadata.afterFailRan).toBe(true);
  });

  it('should record timing for each processor', async () => {
    const engine = new PipelineEngine();

    engine.register(makeProcessor('timed-proc', 'post-generate', () => ({})));

    const ctx = createContext({ prompt: 'test' });
    const result = await engine.execute(ctx);

    expect(result.timings['timed-proc']).toBeDefined();
    expect(typeof result.timings['timed-proc']).toBe('number');
  });

  it('should only run specified phases when phases param provided', async () => {
    const order: string[] = [];
    const engine = new PipelineEngine();

    engine.register(makeProcessor('pre', 'pre-generate', () => { order.push('pre'); return {}; }));
    engine.register(makeProcessor('post', 'post-generate', () => { order.push('post'); return {}; }));
    engine.register(makeProcessor('conv', 'convert', () => { order.push('conv'); return {}; }));

    const ctx = createContext({ prompt: 'test' });
    await engine.execute(ctx, undefined, ['post-generate']);

    expect(order).toEqual(['post']);
  });

  it('should return success true when no errors', async () => {
    const engine = new PipelineEngine();
    engine.register(makeProcessor('ok', 'post-generate', () => ({})));

    const ctx = createContext({ prompt: 'test' });
    const result = await engine.execute(ctx);

    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

import { describe, it, expect } from 'vitest';
import { emitSvelte } from '../../../src/conversion/svelte-emitter.js';
import type { ComponentTree } from '../../../src/types/components.js';

function makeTree(children: any[] = [], stateVars: any[] = []): ComponentTree {
  return {
    root: {
      tag: 'div',
      props: {},
      children,
      classes: [],
      events: [],
      isComponent: false,
    },
    extractedComponents: [],
    imports: [],
    stateVariables: stateVars,
  };
}

describe('emitSvelte', () => {
  it('should generate SvelteKit component', () => {
    const tree = makeTree([{ tag: 'p', props: {}, children: ['Hi'], classes: [], events: [], isComponent: false }]);
    const output = emitSvelte(tree);

    expect(output.framework).toBe('svelte');
    const mainFile = output.files.find(f => f.path.includes('+page.svelte'));
    expect(mainFile).toBeDefined();
    expect(mainFile!.language).toBe('svelte');
  });

  it('should use $state runes for Svelte 5', () => {
    const tree = makeTree([], [
      { name: 'count', type: 'number', defaultValue: '0', source: 'input' },
    ]);
    const output = emitSvelte(tree);
    const content = output.files[0].content;

    expect(content).toContain('$state<number>(0)');
    expect(content).toContain('<script lang="ts">');
  });

  it('should use on:event syntax', () => {
    const tree = makeTree([
      { tag: 'button', props: {}, children: ['Click'], classes: [], events: [{ event: 'click', handler: 'handleClick' }], isComponent: false },
    ]);
    const output = emitSvelte(tree);
    const content = output.files[0].content;

    expect(content).toContain('on:click={handleClick}');
  });

  it('should include svelte and sveltekit in dependencies', () => {
    const tree = makeTree();
    const output = emitSvelte(tree);

    expect(output.packageDependencies.svelte).toBeDefined();
    expect(output.packageDependencies['@sveltejs/kit']).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import { emitVue } from '../../../src/conversion/vue-emitter.js';
import type { ComponentTree } from '../../../src/types/components.js';

function makeTree(children: any[] = [], stateVars: any[] = []): ComponentTree {
  return {
    root: {
      tag: 'div',
      props: {},
      children,
      classes: ['flex', 'gap-4'],
      events: [],
      isComponent: false,
    },
    extractedComponents: [],
    imports: [],
    stateVariables: stateVars,
  };
}

describe('emitVue', () => {
  it('should generate Vue 3 SFC structure', () => {
    const tree = makeTree([{ tag: 'h1', props: {}, children: ['Hello'], classes: [], events: [], isComponent: false }]);
    const output = emitVue(tree);

    expect(output.framework).toBe('vue');
    const mainFile = output.files.find(f => f.path.includes('index.vue'));
    expect(mainFile).toBeDefined();
    expect(mainFile!.content).toContain('<template>');
    expect(mainFile!.content).toContain('</template>');
    expect(mainFile!.content).toContain('<script setup lang="ts">');
    expect(mainFile!.language).toBe('vue');
  });

  it('should use ref() for state variables', () => {
    const tree = makeTree([], [
      { name: 'query', type: 'string', defaultValue: "''", source: 'input' },
    ]);
    const output = emitVue(tree);
    const content = output.files[0].content;

    expect(content).toContain("import { ref } from 'vue'");
    expect(content).toContain("const query = ref<string>('')");
  });

  it('should use @event syntax for events', () => {
    const tree = makeTree([
      { tag: 'button', props: {}, children: ['Go'], classes: [], events: [{ event: 'click', handler: 'doSomething' }], isComponent: false },
    ]);
    const output = emitVue(tree);
    const content = output.files[0].content;

    expect(content).toContain('@click="doSomething"');
  });

  it('should include vue in dependencies', () => {
    const tree = makeTree();
    const output = emitVue(tree);

    expect(output.packageDependencies.vue).toBeDefined();
  });
});

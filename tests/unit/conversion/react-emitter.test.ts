import { describe, it, expect } from 'vitest';
import { emitReact } from '../../../src/conversion/react-emitter.js';
import type { ComponentTree, ComponentNode } from '../../../src/types/components.js';

function makeTree(root: Partial<ComponentNode> = {}, stateVars = []): ComponentTree {
  return {
    root: {
      tag: 'div',
      props: {},
      children: [],
      classes: [],
      events: [],
      isComponent: false,
      ...root,
    },
    extractedComponents: [],
    imports: [],
    stateVariables: stateVars,
  };
}

describe('emitReact', () => {
  it('should generate a valid React component file', () => {
    const tree = makeTree({
      children: [
        { tag: 'h1', props: {}, children: ['Hello'], classes: ['text-3xl'], events: [], isComponent: false },
      ],
    });

    const output = emitReact(tree);

    expect(output.framework).toBe('react');
    expect(output.files.length).toBeGreaterThan(0);

    const mainFile = output.files.find(f => f.path.includes('page.tsx'));
    expect(mainFile).toBeDefined();
    expect(mainFile!.content).toContain("'use client'");
    expect(mainFile!.content).toContain('export default function Page');
    expect(mainFile!.content).toContain('Hello');
    expect(mainFile!.language).toBe('tsx');
  });

  it('should include useState for state variables', () => {
    const tree = makeTree({}, [
      { name: 'email', type: 'string', defaultValue: "''", source: 'input' as const },
      { name: 'agreed', type: 'boolean', defaultValue: 'false', source: 'toggle' as const },
    ]);

    const output = emitReact(tree);
    const content = output.files[0].content;

    expect(content).toContain('useState');
    expect(content).toContain("useState<string>('')");
    expect(content).toContain('useState<boolean>(false)');
  });

  it('should convert className from classes', () => {
    const tree = makeTree({
      classes: ['flex', 'gap-4', 'bg-white'],
      children: ['content'],
    });

    const output = emitReact(tree);
    const content = output.files[0].content;

    expect(content).toContain('className="flex gap-4 bg-white"');
  });

  it('should convert events to React onClick handlers', () => {
    const tree = makeTree({
      children: [
        {
          tag: 'button',
          props: {},
          children: ['Click'],
          classes: [],
          events: [{ event: 'click', handler: 'handleSubmit' }],
          isComponent: false,
        },
      ],
    });

    const output = emitReact(tree);
    const content = output.files[0].content;

    expect(content).toContain('onClick={handleSubmit}');
  });

  it('should include react and next in dependencies', () => {
    const tree = makeTree();
    const output = emitReact(tree, true);

    expect(output.packageDependencies.react).toBeDefined();
    expect(output.packageDependencies.next).toBeDefined();
  });

  it('should use pages dir when appRouter is false', () => {
    const tree = makeTree();
    const output = emitReact(tree, false);

    const mainFile = output.files.find(f => f.path.includes('pages/'));
    expect(mainFile).toBeDefined();
  });

  it('should handle self-closing tags', () => {
    const tree = makeTree({
      children: [
        { tag: 'input', props: { type: 'text' }, children: [], classes: [], events: [], isComponent: false },
        { tag: 'img', props: { src: '/logo.png' }, children: [], classes: [], events: [], isComponent: false },
      ],
    });

    const output = emitReact(tree);
    const content = output.files[0].content;

    expect(content).toContain('<input');
    expect(content).toContain('/>');
    expect(content).toContain('<img');
  });
});

import { describe, it, expect } from 'vitest';
import { mapComponent, mapAllComponents } from '../../../src/conversion/component-mapper.js';
import type { ComponentNode } from '../../../src/types/components.js';

function makeNode(overrides: Partial<ComponentNode> = {}): ComponentNode {
  return {
    tag: 'div',
    props: {},
    children: [],
    classes: [],
    events: [],
    isComponent: false,
    ...overrides,
  };
}

describe('mapComponent', () => {
  it('should return undefined for library "none"', () => {
    const node = makeNode({ tag: 'button', classes: ['bg-primary', 'px-4', 'py-2', 'rounded'] });
    const result = mapComponent(node, 'none');
    expect(result).toBeUndefined();
  });

  it('should map a button with Tailwind classes to shadcn Button', () => {
    const node = makeNode({
      tag: 'button',
      classes: ['inline-flex', 'items-center', 'rounded-md', 'bg-primary', 'px-4', 'py-2', 'text-white'],
    });
    const result = mapComponent(node, 'shadcn', 0.5);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Button');
    expect(result!.library).toBe('shadcn');
    expect(result!.importPath).toContain('button');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should map a card-like div to shadcn Card', () => {
    const node = makeNode({
      tag: 'div',
      classes: ['rounded-lg', 'border', 'bg-card', 'p-6', 'shadow-sm'],
      children: [makeNode(), makeNode()],
    });
    const result = mapComponent(node, 'shadcn', 0.5);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Card');
  });

  it('should map input to shadcn Input', () => {
    const node = makeNode({
      tag: 'input',
      props: { type: 'email' },
      classes: ['border', 'rounded', 'px-3', 'py-2'],
    });
    const result = mapComponent(node, 'shadcn', 0.5);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Input');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should map hr to Separator with high confidence', () => {
    const node = makeNode({ tag: 'hr' });
    const result = mapComponent(node, 'shadcn', 0.5);

    expect(result).toBeDefined();
    expect(result!.name).toBe('Separator');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('should NOT map below confidence threshold', () => {
    const node = makeNode({ tag: 'div', classes: ['mt-4'] }); // generic div
    const result = mapComponent(node, 'shadcn', 0.6);

    expect(result).toBeUndefined();
  });

  it('should map to MUI when library is mui', () => {
    const node = makeNode({
      tag: 'button',
      classes: ['inline-flex', 'items-center', 'rounded', 'bg-primary', 'px-4', 'py-2'],
    });
    const result = mapComponent(node, 'mui', 0.5);

    expect(result).toBeDefined();
    expect(result!.library).toBe('mui');
    expect(result!.importPath).toContain('@mui/material');
  });
});

describe('mapAllComponents', () => {
  it('should recursively map all nodes in a tree', () => {
    const tree = makeNode({
      tag: 'div',
      children: [
        makeNode({
          tag: 'button',
          classes: ['inline-flex', 'items-center', 'rounded', 'bg-primary', 'px-4', 'py-2'],
          children: ['Submit'],
        }),
        makeNode({
          tag: 'input',
          props: { type: 'text' },
        }),
      ],
    });

    const mapped = mapAllComponents(tree, 'shadcn', 0.3);

    // Button child should be mapped
    const btn = mapped.children[0];
    expect(typeof btn).not.toBe('string');
    if (typeof btn !== 'string') {
      expect(btn.mappedComponent).toBeDefined();
      expect(btn.mappedComponent!.name).toBe('Button');
    }
  });

  it('should preserve text children', () => {
    const tree = makeNode({
      children: ['Hello world'],
    });

    const mapped = mapAllComponents(tree, 'shadcn');
    expect(mapped.children[0]).toBe('Hello world');
  });
});

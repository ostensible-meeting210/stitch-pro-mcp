import { describe, it, expect } from 'vitest';
import { htmlToComponentTree, extractStateVariables } from '../../../src/conversion/html-parser.js';

describe('htmlToComponentTree', () => {
  it('should parse basic HTML into a ComponentNode tree', () => {
    const html = `<!DOCTYPE html><html><head></head><body><div class="flex gap-4"><h1>Hello</h1><p>World</p></div></body></html>`;
    const tree = htmlToComponentTree(html);

    expect(tree.tag).toBe('body');
    expect(tree.children.length).toBeGreaterThan(0);
  });

  it('should extract Tailwind classes', () => {
    const html = `<html><head></head><body><div class="flex items-center gap-4 bg-blue-500 rounded-lg p-6">Content</div></body></html>`;
    const tree = htmlToComponentTree(html);

    // The body's first child div
    const div = tree.children[0];
    expect(typeof div).not.toBe('string');
    if (typeof div !== 'string') {
      expect(div.classes).toContain('flex');
      expect(div.classes).toContain('bg-blue-500');
      expect(div.classes).toContain('rounded-lg');
    }
  });

  it('should extract props from attributes', () => {
    const html = `<html><head></head><body><a href="/about" id="nav-link">About</a></body></html>`;
    const tree = htmlToComponentTree(html);

    const link = tree.children[0];
    if (typeof link !== 'string') {
      expect(link.tag).toBe('a');
      expect(link.props.href).toBe('/about');
      expect(link.props.id).toBe('nav-link');
    }
  });

  it('should mark semantic elements as components', () => {
    const html = `<html><head></head><body><nav class="flex"><a href="/">Home</a></nav><main><section id="hero"><h1>Welcome</h1></section></main></body></html>`;
    const tree = htmlToComponentTree(html);

    const nav = tree.children.find(c => typeof c !== 'string' && c.tag === 'nav');
    expect(nav).toBeDefined();
    if (typeof nav !== 'string' && nav) {
      expect(nav.isComponent).toBe(true);
      expect(nav.componentName).toBe('Nav');
    }
  });

  it('should infer click handlers for buttons', () => {
    const html = `<html><head></head><body><button class="bg-primary px-4 py-2">Click me</button></body></html>`;
    const tree = htmlToComponentTree(html);

    const btn = tree.children[0];
    if (typeof btn !== 'string') {
      expect(btn.events.length).toBeGreaterThan(0);
      expect(btn.events[0].event).toBe('click');
    }
  });

  it('should handle empty body gracefully', () => {
    const html = `<html><head></head><body></body></html>`;
    const tree = htmlToComponentTree(html);

    expect(tree.tag).toBe('body');
    expect(tree.children).toEqual([]);
  });
});

describe('extractStateVariables', () => {
  it('should extract state from text inputs', () => {
    const html = `<html><head></head><body><form><input type="text" name="username" /><input type="email" name="user_email" /></form></body></html>`;
    const tree = htmlToComponentTree(html);
    const vars = extractStateVariables(tree);

    expect(vars.length).toBe(2);
    expect(vars[0].name).toBe('username');
    expect(vars[0].type).toBe('string');
    expect(vars[1].name).toBe('userEmail'); // camelCased
  });

  it('should extract boolean state from checkboxes', () => {
    const html = `<html><head></head><body><input type="checkbox" name="agree_terms" /></body></html>`;
    const tree = htmlToComponentTree(html);
    const vars = extractStateVariables(tree);

    expect(vars.length).toBe(1);
    expect(vars[0].name).toBe('agreeTerms');
    expect(vars[0].type).toBe('boolean');
    expect(vars[0].defaultValue).toBe('false');
  });

  it('should extract state from select elements', () => {
    const html = `<html><head></head><body><select name="country"><option>US</option></select></body></html>`;
    const tree = htmlToComponentTree(html);
    const vars = extractStateVariables(tree);

    expect(vars.length).toBe(1);
    expect(vars[0].source).toBe('select');
  });

  it('should deduplicate variables with same name', () => {
    const html = `<html><head></head><body><input name="q" /><input name="q" /></body></html>`;
    const tree = htmlToComponentTree(html);
    const vars = extractStateVariables(tree);

    expect(vars.length).toBe(1);
  });
});

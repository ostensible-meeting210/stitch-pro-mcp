import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StitchClient } from '../stitch/client.js';
import type { PipelineEngine } from '../pipeline/engine.js';
import type { DesignSystem } from '../types/design-system.js';
import type { PipelineContext, Framework, ComponentLibrary } from '../types/pipeline.js';
import type { DeviceType } from '../types/stitch.js';
import { createContext } from '../pipeline/context.js';
import { z } from 'zod';

// ─── sp_auto: The orchestrator ───
// Analyzes the user's intent and chains the right tools automatically.
// "Build me a dark-themed SaaS dashboard in React with shadcn" →
//   1. Creates design system (dark theme, SaaS)
//   2. Generates the page via Stitch
//   3. Runs a11y audit + fix
//   4. Injects responsive breakpoints
//   5. Converts to React with shadcn mapping
//   All in one call.

const AutoInput = z.object({
  prompt: z.string().min(3).describe('What you want — natural language. Example: "Build a pricing page in React with shadcn, dark theme"'),
  projectId: z.string().describe('Stitch project ID'),
  outputDir: z.string().optional().describe('Directory to organize output files under'),
});

const AnalyzeInput = z.object({
  html: z.string().describe('HTML to analyze'),
});

const SmartConvertInput = z.object({
  html: z.string().describe('HTML to convert — auto-detects needed pre-processing'),
  framework: z.enum(['react', 'vue', 'svelte']).describe('Target framework'),
  componentLibrary: z.enum(['none', 'shadcn', 'radix', 'mui']).default('none'),
  appRouter: z.boolean().default(true).describe('Next.js App Router (React only)'),
});

interface ParsedIntent {
  framework: Framework;
  componentLibrary: ComponentLibrary;
  deviceType: DeviceType;
  needsDesignSystem: boolean;
  brandTraits: string[];
  primaryColor?: string;
  industry?: string;
  darkMode: boolean;
  screenDescriptions: string[];
  isMultiScreen: boolean;
}

export function registerAutoTools(
  server: McpServer,
  client: StitchClient,
  pipeline: PipelineEngine,
  designSystems: Map<string, DesignSystem>,
) {
  server.registerTool(
    'sp_auto',
    {
      title: 'Auto — Smart Orchestrator',
      description: 'Describe what you want in plain English. Automatically chains design system creation, page generation, accessibility fixes, responsive adaptation, and framework conversion based on your intent.',
      inputSchema: AutoInput.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ prompt, projectId, outputDir }) => {
      const intent = parseIntent(prompt);
      const steps: string[] = [];
      const results: Record<string, unknown> = {};

      // Step 1: Design system (if brand/theme cues detected)
      let ds: DesignSystem | undefined;
      if (intent.needsDesignSystem) {
        const { v4: uuid } = await import('uuid');
        const Color = (await import('color')).default;
        const id = uuid();
        const primaryColor = intent.primaryColor || (intent.darkMode ? '#6366F1' : '#3B82F6');

        // Import the generator from design-system tools
        ds = {
          id,
          name: 'Auto-Generated',
          version: '1.0.0',
          brand: {
            name: 'Auto',
            industry: intent.industry,
            personality: intent.brandTraits,
            primaryColor,
          },
          tokens: generateTokens(primaryColor, intent.darkMode, Color),
          rules: [
            { id: 'max-fonts', description: 'Maximum 2 font families', severity: 'error' as const, validator: 'maxFonts' },
            { id: 'focus-visible', description: 'Interactive elements need focus ring', severity: 'error' as const, validator: 'focusVisible' },
          ],
        };
        designSystems.set(id, ds);
        steps.push(`Created design system (${intent.darkMode ? 'dark' : 'light'} theme, primary: ${primaryColor})`);
        results.designSystemId = id;
      }

      // Step 2: Generate screen(s)
      const allScreenResults: Record<string, unknown>[] = [];

      const screens = intent.isMultiScreen ? intent.screenDescriptions : [prompt];

      for (const screenPrompt of screens) {
        const ctx = createContext({
          prompt: screenPrompt,
          deviceType: intent.deviceType,
          framework: intent.framework,
          componentLibrary: intent.componentLibrary,
          enableAccessibility: true,
          enableResponsive: true,
          designSystem: ds,
        });

        const stitchCall = async (c: PipelineContext): Promise<PipelineContext> => {
          const p = c.enrichedPrompt ?? c.originalPrompt;
          const screen = await client.generate(projectId, p, c.deviceType);
          return { ...c, rawHtml: screen.html, processedHtml: screen.html };
        };

        const result = await pipeline.execute(ctx, stitchCall);

        const screenResult: Record<string, unknown> = {
          prompt: screenPrompt,
          html: result.context.processedHtml,
        };

        if (result.context.frameworkOutput) {
          screenResult.files = result.context.frameworkOutput.files.map(f => ({
            ...f,
            path: outputDir ? `${outputDir}/${f.path}` : f.path,
          }));
          screenResult.dependencies = result.context.frameworkOutput.packageDependencies;
        }

        if (result.context.accessibilityReport) {
          screenResult.a11y = {
            violations: result.context.accessibilityReport.violations.length,
            fixed: result.context.accessibilityReport.fixesApplied,
            passes: result.context.accessibilityReport.passes,
          };
        }

        screenResult.warnings = result.warnings;
        allScreenResults.push(screenResult);
      }

      steps.push(`Generated ${screens.length} screen(s) via Stitch`);
      steps.push('Ran WCAG 2.1 AA accessibility audit + auto-fix');
      steps.push('Injected responsive breakpoints');

      if (intent.framework !== 'html') {
        steps.push(`Converted to ${intent.framework}${intent.componentLibrary !== 'none' ? ` with ${intent.componentLibrary}` : ''}`);
      }

      results.screens = allScreenResults;
      results.steps = steps;
      results.intent = {
        framework: intent.framework,
        componentLibrary: intent.componentLibrary,
        deviceType: intent.deviceType,
        darkMode: intent.darkMode,
        multiScreen: intent.isMultiScreen,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  // ─── sp_analyze: Analyze HTML and recommend tools ───
  server.registerTool(
    'sp_analyze',
    {
      title: 'Analyze HTML',
      description: 'Analyze HTML and recommend which stitch-pro tools to run. Detects accessibility issues, missing responsiveness, framework conversion opportunities, and component library mapping potential.',
      inputSchema: AnalyzeInput.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ html }) => {
      const recommendations: { tool: string; reason: string; priority: 'high' | 'medium' | 'low' }[] = [];

      // Check accessibility
      const hasLang = /lang=/.test(html);
      const hasAlt = !/<img(?![^>]*alt=)/i.test(html);
      const hasMain = /<main/.test(html);
      const hasAria = /aria-/.test(html);

      if (!hasLang || !hasAlt || !hasMain || !hasAria) {
        recommendations.push({
          tool: 'sp_a11y',
          reason: `Missing: ${[!hasLang && 'lang attr', !hasAlt && 'img alt', !hasMain && '<main>', !hasAria && 'ARIA labels'].filter(Boolean).join(', ')}`,
          priority: 'high',
        });
      }

      // Check responsive
      const hasViewport = /viewport/.test(html);
      const hasBreakpoints = /sm:|md:|lg:|xl:/.test(html);
      const hasFixedWidths = /w-\[\d{4,}px\]/.test(html);

      if (!hasViewport || !hasBreakpoints || hasFixedWidths) {
        recommendations.push({
          tool: 'sp_responsive',
          reason: `${[!hasViewport && 'no viewport meta', !hasBreakpoints && 'no breakpoints', hasFixedWidths && 'fixed widths detected'].filter(Boolean).join(', ')}`,
          priority: hasFixedWidths ? 'high' : 'medium',
        });
      }

      // Check for component mapping potential
      const hasButtons = /<button/.test(html);
      const hasCards = /rounded.*border|shadow.*p-\d/.test(html);
      const hasInputs = /<input/.test(html);
      const hasTailwind = /class="[^"]*(?:flex|grid|bg-|text-|p-|m-)/.test(html);

      if (hasTailwind && (hasButtons || hasCards || hasInputs)) {
        recommendations.push({
          tool: 'sp_extract',
          reason: `Tailwind UI detected with ${[hasButtons && 'buttons', hasCards && 'card-like elements', hasInputs && 'form inputs'].filter(Boolean).join(', ')} — mappable to shadcn/radix/MUI`,
          priority: 'medium',
        });
      }

      // Framework conversion
      if (hasTailwind) {
        recommendations.push({
          tool: 'sp_to_react | sp_to_vue | sp_to_svelte',
          reason: 'Clean Tailwind HTML detected — good candidate for framework conversion',
          priority: 'low',
        });
      }

      // Design system
      const colorCount = new Set(html.match(/#[0-9a-fA-F]{6}/g) || []).size;
      if (colorCount > 5) {
        recommendations.push({
          tool: 'sp_design_create + sp_design_apply',
          reason: `${colorCount} unique colors detected — consolidate into a design system for consistency`,
          priority: 'medium',
        });
      }

      // Build suggested chain
      const chain = recommendations
        .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority]))
        .map(r => r.tool);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            recommendations,
            suggestedChain: chain,
            stats: {
              hasViewport,
              hasBreakpoints,
              hasAccessibility: hasLang && hasAlt && hasMain,
              hasTailwind,
              uniqueColors: colorCount,
              htmlSize: `${(html.length / 1024).toFixed(1)}KB`,
            },
          }, null, 2),
        }],
      };
    },
  );

  // ─── sp_smart_convert: Auto-detects needed preprocessing before conversion ───
  server.registerTool(
    'sp_smart_convert',
    {
      title: 'Smart Convert',
      description: 'Converts HTML to a framework, but auto-detects if it needs accessibility fixes and responsive adaptation first. Runs the full quality pipeline before conversion — no manual chaining needed.',
      inputSchema: SmartConvertInput.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ html, framework, componentLibrary, appRouter }) => {
      // Always run full post-generate + convert pipeline
      const ctx = createContext({
        prompt: '',
        framework,
        componentLibrary,
        enableAccessibility: true,
        enableResponsive: true,
      });

      const ctxWithHtml = {
        ...ctx,
        rawHtml: html,
        processedHtml: html,
        metadata: { ...ctx.metadata, appRouter },
      };

      // Run post-generate (a11y + responsive) then convert
      const result = await pipeline.execute(ctxWithHtml, undefined, ['post-generate', 'convert']);

      const stepsRun: string[] = [];
      for (const [name, ms] of result.context.timings) {
        stepsRun.push(`${name} (${ms}ms)`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            files: result.context.frameworkOutput?.files ?? [],
            dependencies: result.context.frameworkOutput?.packageDependencies ?? {},
            html: result.context.processedHtml,
            a11y: result.context.accessibilityReport,
            stepsRun,
            warnings: result.warnings,
          }, null, 2),
        }],
      };
    },
  );
}

// ─── Intent Parser ───
// Extracts structured intent from natural language prompt

function parseIntent(prompt: string): ParsedIntent {
  const lower = prompt.toLowerCase();

  // Framework detection
  let framework: Framework = 'html';
  if (/\breact\b|\bnext\.?js\b|\btsx\b/.test(lower)) framework = 'react';
  else if (/\bvue\b|\bnuxt\b/.test(lower)) framework = 'vue';
  else if (/\bsvelte\b|\bsveltekit\b/.test(lower)) framework = 'svelte';

  // Component library
  let componentLibrary: ComponentLibrary = 'none';
  if (/\bshadcn\b/.test(lower)) componentLibrary = 'shadcn';
  else if (/\bradix\b/.test(lower)) componentLibrary = 'radix';
  else if (/\bmui\b|\bmaterial\s*ui\b/.test(lower)) componentLibrary = 'mui';

  // Device type
  let deviceType: DeviceType = 'DESKTOP';
  if (/\bmobile\b|\bphone\b|\bios\b|\bandroid\b/.test(lower)) deviceType = 'MOBILE';
  else if (/\btablet\b|\bipad\b/.test(lower)) deviceType = 'TABLET';

  // Dark mode
  const darkMode = /\bdark\b|\bnight\b|\bmoody\b/.test(lower);

  // Brand/theme detection
  const needsDesignSystem = /\btheme\b|\bbrand\b|\bdark\b|\blight\b|\bcolor\b|\bminimal\b|\bbold\b|\bclean\b|\bprofessional\b|\bplayful\b|\bcorporate\b/.test(lower);

  // Brand personality traits
  const traitPatterns: [RegExp, string][] = [
    [/\bminimal\b/, 'minimal'], [/\bclean\b/, 'clean'], [/\bbold\b/, 'bold'],
    [/\bmodern\b/, 'modern'], [/\bprofessional\b/, 'professional'],
    [/\bplayful\b/, 'playful'], [/\bcorporate\b/, 'corporate'],
    [/\belgant\b/, 'elegant'], [/\bfun\b/, 'fun'], [/\btrusty?\b/, 'trustworthy'],
  ];
  const brandTraits = traitPatterns.filter(([re]) => re.test(lower)).map(([, t]) => t);
  if (brandTraits.length === 0) brandTraits.push('modern', 'professional');

  // Color detection
  const colorMatch = lower.match(/#[0-9a-f]{6}/i) || lower.match(/\b(blue|red|green|purple|orange|pink|indigo|teal|cyan)\b/);
  const colorMap: Record<string, string> = {
    blue: '#3B82F6', red: '#EF4444', green: '#22C55E', purple: '#8B5CF6',
    orange: '#F97316', pink: '#EC4899', indigo: '#6366F1', teal: '#14B8A6', cyan: '#06B6D4',
  };
  const primaryColor = colorMatch ? (colorMatch[0].startsWith('#') ? colorMatch[0] : colorMap[colorMatch[0]]) : undefined;

  // Industry detection
  const industryPatterns: [RegExp, string][] = [
    [/\bsaas\b/, 'SaaS'], [/\bfintech\b|\bfinance\b|\bbanking\b/, 'fintech'],
    [/\bhealth\b|\bmedical\b/, 'healthcare'], [/\becommerce\b|\bshop\b|\bstore\b/, 'e-commerce'],
    [/\beducation\b|\blearning\b/, 'education'], [/\bsocial\b/, 'social media'],
    [/\bblog\b/, 'media'], [/\bfood\b|\brestaurant\b/, 'food & beverage'],
  ];
  const industry = industryPatterns.find(([re]) => re.test(lower))?.[1];

  // Multi-screen detection
  const multiScreenPatterns = /\bflow\b|\bscreens?\b|\bpages?\b|\blogin\s*(?:and|&|,|\+)\s*\w+|\bdashboard\s*(?:and|&|,|\+)\s*\w+/;
  const isMultiScreen = multiScreenPatterns.test(lower);

  // Extract individual screen descriptions
  let screenDescriptions: string[] = [prompt];
  if (isMultiScreen) {
    // Try to split on "and", "&", commas for screen names
    const screenPart = lower.match(/(?:screens?|pages?)\s*(?:for|:)?\s*(.+)/)?.[1] || lower;
    const parts = screenPart.split(/\s*(?:,\s*and\s*|,\s*|\s+and\s+|\s*&\s*)\s*/).filter(s => s.trim().length > 3);
    if (parts.length > 1) {
      screenDescriptions = parts.map(p => `${prompt.split(/\b(?:screens?|pages?)\b/i)[0].trim()} — ${p.trim()} page`);
    }
  }

  return {
    framework,
    componentLibrary,
    deviceType,
    needsDesignSystem,
    brandTraits,
    primaryColor,
    industry,
    darkMode,
    screenDescriptions,
    isMultiScreen,
  };
}

function generateTokens(primaryColor: string, darkMode: boolean, Color: any) {
  const primary = Color(primaryColor);
  const makeScale = (base: typeof primary): Record<string, string> => ({
    '50': base.lightness(darkMode ? 10 : 97).hex(),
    '100': base.lightness(darkMode ? 15 : 93).hex(),
    '200': base.lightness(darkMode ? 25 : 85).hex(),
    '300': base.lightness(darkMode ? 35 : 72).hex(),
    '400': base.lightness(darkMode ? 45 : 58).hex(),
    '500': base.hex(),
    '600': base.darken(0.15).hex(),
    '700': base.darken(0.3).hex(),
    '800': base.darken(0.45).hex(),
    '900': base.darken(0.6).hex(),
  });

  const neutralBase = darkMode ? Color('#9CA3AF') : Color('#6B7280');

  return {
    colors: {
      primary: makeScale(primary),
      secondary: makeScale(primary.rotate(30)),
      neutral: makeScale(neutralBase),
      success: makeScale(Color('#22C55E')),
      warning: makeScale(Color('#F59E0B')),
      error: makeScale(Color('#EF4444')),
    },
    typography: {
      fontFamilies: { heading: 'Inter', body: 'Inter', mono: 'JetBrains Mono' },
      sizes: {
        'heading-1': { size: '36px', lineHeight: '1.2', weight: '700' },
        'heading-2': { size: '28px', lineHeight: '1.3', weight: '600' },
        'heading-3': { size: '22px', lineHeight: '1.4', weight: '600' },
        'body': { size: '16px', lineHeight: '1.5', weight: '400' },
        'body-sm': { size: '14px', lineHeight: '1.5', weight: '400' },
        'caption': { size: '12px', lineHeight: '1.4', weight: '400' },
      },
    },
    spacing: {
      '0': '0px', '1': '4px', '2': '8px', '3': '12px', '4': '16px',
      '5': '20px', '6': '24px', '8': '32px', '10': '40px', '12': '48px',
    },
    radii: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
    shadows: {
      sm: '0 1px 2px rgba(0,0,0,0.05)',
      md: '0 4px 6px rgba(0,0,0,0.07)',
      lg: '0 10px 15px rgba(0,0,0,0.1)',
    },
  };
}

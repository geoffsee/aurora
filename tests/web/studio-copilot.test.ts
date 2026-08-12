import { beforeEach, describe, expect, test, vi } from 'vitest';
import { PACK_V1_AUTHORING_TEMPLATE, PACK_V1_SHOW_TEMPLATE } from '../../shared/aurora-package.ts';
import {
  buildCopilotRequest,
  buildCopilotSystem,
  PACK_V1_BUS_BRIEF,
} from '../../web/studio/lib/copilot-prompt.ts';
import {
  COPILOT_DEFAULT_MODEL,
  COPILOT_SETTINGS_KEY,
  type CopilotProviderFactory,
  defaultCopilotSettings,
  isCopilotConfigured,
  loadCopilotSettings,
  saveCopilotSettings,
} from '../../web/studio/lib/copilot-provider.ts';
import {
  extractCodeBlock,
  parseCopilotReply,
  validateCopilotWgsl,
} from '../../web/studio/lib/copilot-response.ts';
import { defaultKnobs } from '../../web/studio/lib/sketch-store.ts';

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

// ──────────────────────────────────────────────────────────────────────────
// Prompt assembly
// ──────────────────────────────────────────────────────────────────────────

describe('buildCopilotSystem', () => {
  test('carries the bus contract derived from the real template', () => {
    // Derived, not transcribed: if a binding ever changes, the prompt changes
    // with it instead of confidently teaching a stale bus.
    expect(PACK_V1_BUS_BRIEF).toContain(PACK_V1_AUTHORING_TEMPLATE);
    expect(buildCopilotSystem('create')).toContain('pack_drive');
  });

  test('states the rules that make a pack usable on a projector', () => {
    const system = buildCopilotSystem('create');
    expect(system).toContain('-1');
    expect(system).toMatch(/@group\(0\)/);
    expect(system).toContain('knob');
  });

  test('explain suppresses the code-block contract', () => {
    // Otherwise an explanation wrapped in a wgsl fence gets parsed as a
    // proposal and offered as a replacement for the shader being explained.
    const system = buildCopilotSystem('explain');
    expect(system).toContain('do NOT emit a wgsl code block');
    expect(system).not.toContain('ONE fenced');
  });
});

describe('buildCopilotRequest', () => {
  const base = { brief: 'slow glass horizon', wgsl: 'EXISTING_SHADER', knobs: defaultKnobs() };

  test('create does not send the buffer — it is being replaced', () => {
    const request = buildCopilotRequest({ ...base, action: 'create', wgsl: '' });
    expect(request.messages).toHaveLength(1);
    expect(request.messages[0]?.content).toContain('slow glass horizon');
    expect(request.messages[0]?.content).not.toContain('Current sketch');
  });

  test('edit sends the current buffer', () => {
    const content = buildCopilotRequest({ ...base, action: 'edit' }).messages[0]?.content ?? '';
    expect(content).toContain('EXISTING_SHADER');
  });

  test('a selection is a pointer, not a scope — the whole file is still asked for', () => {
    // A model that returns only the selected region would have the rest of the
    // buffer deleted when the proposal is applied.
    const content =
      buildCopilotRequest({ ...base, action: 'edit', selection: 'fn helper() {}' }).messages[0]
        ?.content ?? '';
    expect(content).toContain('fn helper() {}');
    expect(content).toContain('COMPLETE file');
  });

  test('an empty selection is not mentioned at all', () => {
    const content =
      buildCopilotRequest({ ...base, action: 'edit', selection: '   ' }).messages[0]?.content ?? '';
    expect(content).not.toContain('selected region');
  });

  test('fix feeds the compiler output back', () => {
    const content =
      buildCopilotRequest({
        ...base,
        action: 'fix',
        brief: '',
        diagnostics: [
          { lineNumber: 12, startColumn: 3, message: 'unknown identifier', severity: 'error' as const },
        ],
      }).messages[0]?.content ?? '';
    expect(content).toContain('line 12: unknown identifier');
  });

  test('fix says so plainly when there is no compiler output', () => {
    const content =
      buildCopilotRequest({ ...base, action: 'fix', brief: '', diagnostics: [] }).messages[0]
        ?.content ?? '';
    expect(content).toContain('No compiler output');
  });

  test('knob values ride along — the model cannot see the preview', () => {
    const content = buildCopilotRequest({ ...base, action: 'create' }).messages[0]?.content ?? '';
    expect(content).toContain('intensity');
    expect(content).toContain('depth');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Response handling
// ──────────────────────────────────────────────────────────────────────────

describe('extractCodeBlock', () => {
  test('splits prose from the fenced block', () => {
    const { code, prose } = extractCodeBlock('Here you go:\n```wgsl\nSHADER\n```\nEnjoy.');
    expect(code).toBe('SHADER');
    expect(prose).toBe('Here you go:\nEnjoy.');
  });

  test('accepts an unlabelled fence', () => {
    // Models label inconsistently; validation is what actually decides.
    expect(extractCodeBlock('```\nSHADER\n```').code).toBe('SHADER');
  });

  test('a reply with no fence is all prose', () => {
    const { code, prose } = extractCodeBlock('This shader draws a horizon.');
    expect(code).toBeNull();
    expect(prose).toBe('This shader draws a horizon.');
  });
});

describe('validateCopilotWgsl', () => {
  test('accepts the stock authoring template', () => {
    expect(validateCopilotWgsl(PACK_V1_AUTHORING_TEMPLATE)).toEqual([]);
  });

  test('rejects a fragment with no entry point', () => {
    // The failure this prevents: a helper function replacing a whole sketch.
    const errors = validateCopilotWgsl('fn hash(p: vec2<f32>) -> f32 { return 0.0; }');
    expect(errors.some((e) => e.message.includes('@fragment'))).toBe(true);
  });

  test('rejects a reply missing a required uniform', () => {
    const stripped = PACK_V1_AUTHORING_TEMPLATE.replace(/@group\(0\) @binding\(4\).*\n/, '');
    const errors = validateCopilotWgsl(stripped);
    expect(errors.some((e) => e.message.includes('pack_drive'))).toBe(true);
  });

  test('rejects an elided reply rather than deleting the elided code', () => {
    const elided = `${PACK_V1_AUTHORING_TEMPLATE}\n// ... rest unchanged\n`;
    const errors = validateCopilotWgsl(elided);
    expect(errors.some((e) => e.message.includes('elides'))).toBe(true);
  });

  test('rejects show form instead of silently remapping it', () => {
    // Remapping would hide that the model ignored the authoring-form rule.
    const errors = validateCopilotWgsl(PACK_V1_SHOW_TEMPLATE);
    expect(errors.some((e) => e.message.includes('show form'))).toBe(true);
  });
});

describe('parseCopilotReply', () => {
  test('a valid reply becomes an applyable proposal', () => {
    const proposal = parseCopilotReply(`Done.\n\`\`\`wgsl\n${PACK_V1_AUTHORING_TEMPLATE}\n\`\`\``);
    expect(proposal.wgsl).toBe(PACK_V1_AUTHORING_TEMPLATE.trim());
    expect(proposal.errors).toEqual([]);
    expect(proposal.prose).toBe('Done.');
  });

  test('an invalid reply yields errors and NO applyable wgsl', () => {
    // The whole point: there is no Apply button for something that would not
    // survive Export or Publish.
    const proposal = parseCopilotReply('```wgsl\nfn nope() {}\n```');
    expect(proposal.wgsl).toBeNull();
    expect(proposal.errors.length).toBeGreaterThan(0);
  });

  test('a prose-only reply is not an error, just nothing to apply', () => {
    const proposal = parseCopilotReply('It draws a rolling particle horizon.');
    expect(proposal.wgsl).toBeNull();
    expect(proposal.errors).toEqual([]);
    expect(proposal.prose).toContain('horizon');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────────────────────

describe('provider settings', () => {
  test('unconfigured by default — no key ships in the bundle', () => {
    const settings = defaultCopilotSettings();
    expect(settings.apiKey).toBe('');
    expect(settings.model).toBe(COPILOT_DEFAULT_MODEL);
    expect(isCopilotConfigured(settings)).toBe(false);
  });

  test('an endpoint alone configures it — proxies need no key in the browser', () => {
    expect(isCopilotConfigured({ apiKey: '', model: 'm', baseUrl: 'http://localhost:8080' })).toBe(
      true,
    );
    expect(isCopilotConfigured({ apiKey: '   ', model: 'm', baseUrl: '  ' })).toBe(false);
  });

  test('round-trips through storage', () => {
    saveCopilotSettings({ apiKey: 'sk-test', model: 'custom', baseUrl: '' });
    expect(loadCopilotSettings()).toEqual({ apiKey: 'sk-test', model: 'custom', baseUrl: '' });
  });

  test('corrupt stored settings fall back rather than breaking Studio', () => {
    localStorage.setItem(COPILOT_SETTINGS_KEY, 'not json');
    expect(loadCopilotSettings()).toEqual(defaultCopilotSettings());
  });

  test('a stored blank model falls back to the default', () => {
    localStorage.setItem(COPILOT_SETTINGS_KEY, JSON.stringify({ apiKey: 'k', model: '' }));
    expect(loadCopilotSettings().model).toBe(COPILOT_DEFAULT_MODEL);
  });
});

describe('end to end with a mock provider', () => {
  /** Stands in for a live model — no network, no key, deterministic in CI. */
  const mockProvider =
    (reply: string): CopilotProviderFactory =>
    async () => ({ complete: async () => reply });

  test('prompt → reply → validated, applyable WGSL', async () => {
    const provider = await mockProvider(
      `Here is a calm horizon.\n\`\`\`wgsl\n${PACK_V1_AUTHORING_TEMPLATE}\n\`\`\``,
    )(defaultCopilotSettings());

    const request = buildCopilotRequest({
      action: 'create',
      brief: 'calm horizon',
      wgsl: '',
      knobs: defaultKnobs(),
    });
    const proposal = parseCopilotReply(await provider.complete(request));

    expect(proposal.errors).toEqual([]);
    expect(proposal.wgsl).toContain('@fragment');
    expect(proposal.prose).toContain('calm horizon');
  });

  test('a plausible-but-invalid generation is caught before it reaches the editor', async () => {
    const provider = await mockProvider(
      '```wgsl\n@group(2) @binding(0) var<uniform> params: vec4<f32>;\n@fragment\nfn fragment() {}\n```',
    )(defaultCopilotSettings());

    const proposal = parseCopilotReply(
      await provider.complete(
        buildCopilotRequest({ action: 'create', brief: 'x', wgsl: '', knobs: defaultKnobs() }),
      ),
    );
    expect(proposal.wgsl).toBeNull();
    expect(proposal.errors.length).toBeGreaterThan(0);
  });
});

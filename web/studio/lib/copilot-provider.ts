/**
 * Copilot inference providers (#289).
 *
 * ## Where inference runs
 *
 * Studio ships as static files — there is no server to hold a secret, and
 * anything baked into the bundle is public. So the key is the operator's own,
 * stored in their browser, entered by them. Nothing is bundled and Pages builds
 * carry no credential.
 *
 * That means the request goes browser → Anthropic directly, which requires the
 * SDK's `dangerouslyAllowBrowser` flag. The flag's warning is real and worth
 * stating plainly: a key in `localStorage` is readable by any script that gets
 * into the page. For a local authoring tool with a key the operator can scope
 * and revoke that is an acceptable trade — but it is a trade, so `baseUrl` is
 * a first-class option for pointing at a proxy or a local endpoint instead,
 * which is the better answer for anyone who does not want the key in a tab.
 *
 * ## Why the SDK loads dynamically
 *
 * Studio is a WebGPU authoring tool that most sessions never ask a model
 * anything. `import()` inside the factory keeps the SDK out of the main chunk,
 * so an operator who never configures a provider downloads none of it.
 */

import type { CopilotRequest } from './copilot-prompt.ts';

export const COPILOT_SETTINGS_KEY = 'aurora-studio-copilot';

/** Default model. Opus 5 — the copilot writes shaders, which is not easy work. */
export const COPILOT_DEFAULT_MODEL = 'claude-opus-5';

/** Generous: a full pack is long, and truncation mid-shader wastes the call. */
export const COPILOT_MAX_TOKENS = 16_000;

export type CopilotSettings = {
  /** Operator's own key. Never bundled, never sent anywhere but the endpoint. */
  apiKey: string;
  model: string;
  /** Override for a proxy or local endpoint; blank uses the Anthropic API. */
  baseUrl: string;
};

export function defaultCopilotSettings(): CopilotSettings {
  return { apiKey: '', model: COPILOT_DEFAULT_MODEL, baseUrl: '' };
}

/** True when a provider can actually be built. Drives the disabled state. */
export function isCopilotConfigured(settings: CopilotSettings): boolean {
  return settings.apiKey.trim() !== '' || settings.baseUrl.trim() !== '';
}

export type CopilotProvider = {
  /** Run one turn. Returns the reply text. */
  complete(request: CopilotRequest, signal?: AbortSignal): Promise<string>;
};

export type CopilotProviderFactory = (settings: CopilotSettings) => Promise<CopilotProvider>;

/**
 * The Anthropic provider.
 *
 * Streaming rather than a plain create: a shader at 16k `max_tokens` is exactly
 * the shape that trips request timeouts, and the SDK's `finalMessage()` gives
 * back the whole thing without the panel needing to handle chunks.
 */
export const anthropicProvider: CopilotProviderFactory = async (settings) => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({
    apiKey: settings.apiKey.trim() || 'unused-via-proxy',
    ...(settings.baseUrl.trim() ? { baseURL: settings.baseUrl.trim() } : {}),
    // See the module comment: unavoidable for a static tool with no backend,
    // and the reason `baseUrl` exists as the safer alternative.
    dangerouslyAllowBrowser: true,
  });

  return {
    async complete(request, signal) {
      const stream = client.messages.stream(
        {
          model: settings.model || COPILOT_DEFAULT_MODEL,
          max_tokens: COPILOT_MAX_TOKENS,
          thinking: { type: 'adaptive' },
          system: request.system,
          messages: request.messages,
        },
        { signal },
      );
      const message = await stream.finalMessage();
      return message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('\n')
        .trim();
    },
  };
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadCopilotSettings(storage: StorageLike | null = safeStorage()): CopilotSettings {
  const fallback = defaultCopilotSettings();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(COPILOT_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const record = parsed as Partial<CopilotSettings>;
    return {
      apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
      model: typeof record.model === 'string' && record.model ? record.model : fallback.model,
      baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
    };
  } catch {
    return fallback;
  }
}

export function saveCopilotSettings(
  settings: CopilotSettings,
  storage: StorageLike | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(COPILOT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode / quota — the in-memory settings still drive this session */
  }
}

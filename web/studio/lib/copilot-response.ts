/**
 * Turning a copilot reply into something safe to put in the editor (#289).
 *
 * The model returns prose plus (usually) a fenced block. This module is the
 * gate between "the model said something" and "the buffer changed": it extracts
 * the WGSL, runs it through the *existing* package validation rather than a
 * copilot-specific check, and reports what it found.
 *
 * Reusing `validateBundle` matters. A copilot with its own laxer notion of
 * valid would happily hand over shaders that Export and Publish then reject —
 * the operator would discover it at the worst moment. If it does not pass the
 * package validator it does not reach the editor.
 */

import {
  type AuroraPackageValidationError,
  buildManifest,
  validateBundle,
} from '../../../shared/aurora-package.ts';
import { detectWgslForm } from './export-package.ts';

/** Uniform names the pack-v1 bus requires; a reply missing any is unusable. */
const REQUIRED_UNIFORMS = [
  'params',
  'palette_extra',
  'audio_uniforms',
  'palette_rgb',
  'pack_drive',
] as const;

export type CopilotProposal = {
  /** WGSL ready to apply, or null when the reply carried none. */
  wgsl: string | null;
  /** Prose outside the code block — shown as the copilot's message. */
  prose: string;
  /** Why the proposal cannot be applied. Empty when `wgsl` is applyable. */
  errors: AuroraPackageValidationError[];
};

/**
 * Pull the first fenced code block out of a reply.
 *
 * Accepts an unlabelled fence as well as ```wgsl: models label inconsistently,
 * and refusing an otherwise-perfect shader over a missing language tag is a
 * bad trade. The validation below is what actually decides.
 */
export function extractCodeBlock(reply: string): { code: string | null; prose: string } {
  const fence = /```(?:wgsl|glsl)?\s*\n([\s\S]*?)```/i.exec(reply);
  if (!fence?.[1]) return { code: null, prose: reply.trim() };
  // Collapse the seam the removed block leaves behind, so prose that wrapped a
  // shader does not render with a gap where the code used to be.
  const prose = `${reply.slice(0, fence.index)}${reply.slice(fence.index + fence[0].length)}`
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\s*\n/g, '\n')
    .trim();
  return { code: fence[1].trim(), prose };
}

/**
 * Shape checks the package validator cannot make.
 *
 * `validateBundle` checks the authoring/show form and the uniform block, but a
 * reply can also be a *fragment* — a helper function, a diff hunk, a snippet
 * with "// ... rest unchanged". Those parse as plausible WGSL and would replace
 * a working sketch with something that never had an entry point.
 */
function checkCopilotShape(wgsl: string): AuroraPackageValidationError[] {
  const errors: AuroraPackageValidationError[] = [];

  if (!/@fragment/.test(wgsl)) {
    errors.push({
      path: 'copilot',
      message: 'reply has no @fragment entry point — it looks like a fragment, not a whole file',
    });
  }
  for (const name of REQUIRED_UNIFORMS) {
    if (!new RegExp(`var<uniform>\\s+${name}\\s*:`).test(wgsl)) {
      errors.push({ path: 'copilot', message: `missing \`${name}\` uniform declaration` });
    }
  }
  // The elision markers a model reaches for when it means "and the rest".
  if (/^\s*(\/\/|\/\*)?\s*(\.\.\.|…)\s*(rest|remaining|unchanged|same)/im.test(wgsl)) {
    errors.push({
      path: 'copilot',
      message: 'reply elides part of the file — applying it would delete the elided code',
    });
  }

  return errors;
}

/**
 * Validate a candidate against the real package rules.
 *
 * Show-form replies are rejected rather than remapped: the copilot was told to
 * emit authoring form, and silently converting a reply that ignored the
 * instruction hides the fact that it did.
 */
export function validateCopilotWgsl(wgsl: string): AuroraPackageValidationError[] {
  const shape = checkCopilotShape(wgsl);
  if (shape.length) return shape;

  const form = detectWgslForm(wgsl);
  if (form !== 'authoring') {
    return [
      {
        path: 'copilot',
        message: 'reply is in Bevy show form; Studio edits authoring form (@group(0))',
      },
    ];
  }

  const result = validateBundle({
    manifest: buildManifest({
      slug: 'copilot-draft',
      label: 'Copilot draft',
      wgslForm: 'authoring',
    }),
    wgsl,
  });
  return result.ok ? [] : result.errors;
}

/** Full pipeline: reply text → applyable proposal, or the reason it is not. */
export function parseCopilotReply(reply: string): CopilotProposal {
  const { code, prose } = extractCodeBlock(reply);
  if (code === null) return { wgsl: null, prose, errors: [] };

  const errors = validateCopilotWgsl(code);
  // A rejected candidate is deliberately not returned as `wgsl`: there is no
  // Apply button for something that will not export.
  return { wgsl: errors.length ? null : code, prose, errors };
}

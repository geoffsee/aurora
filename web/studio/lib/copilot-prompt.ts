/**
 * Prompt assembly for the Preset Studio copilot (#289).
 *
 * Pure functions, no provider, no network — so what the model is told is
 * inspectable and testable rather than being an artefact of whatever the UI
 * happened to be holding.
 *
 * The system prompt is built from the *same* constants the authoring path uses
 * (`PACK_V1_AUTHORING_TEMPLATE`, the mapping schema's own source of truth), not
 * from a hand-written copy of the bus. A copy would drift the first time a
 * binding changes, and a copilot confidently emitting a stale bus is worse than
 * one that refuses — the operator would not know until the pack renders black.
 */

import { PACK_V1_AUTHORING_TEMPLATE } from '../../../shared/aurora-package.ts';
import type { StudioKnobs } from './sketch-store.ts';
import type { WgslDiagnostic } from './wgsl-diagnostics.ts';

/** What the operator asked the copilot to do. */
export type CopilotAction = 'create' | 'edit' | 'explain' | 'fix';

export type CopilotRequestInput = {
  action: CopilotAction;
  /** Operator's natural-language description or instruction. */
  brief: string;
  /** Current editor buffer. Empty for `create`. */
  wgsl: string;
  /** Selected text, when the operator wants a scoped edit. */
  selection?: string;
  knobs: StudioKnobs;
  /** Compile/validate errors, fed back for the `fix` action. */
  diagnostics?: readonly WgslDiagnostic[];
};

export type CopilotMessage = { role: 'user'; content: string };

export type CopilotRequest = {
  system: string;
  messages: CopilotMessage[];
};

/**
 * The bus contract, derived rather than transcribed.
 *
 * `PACK_V1_AUTHORING_TEMPLATE` is the same template Studio seeds a new sketch
 * with, so its uniform declarations are the ground truth for the binding
 * layout. Embedding the template also gives the model a complete, known-good
 * example in the exact form it must produce — worth far more than a prose
 * description of the same thing.
 */
export const PACK_V1_BUS_BRIEF = `pack-v1 authoring bus, @group(0):

  binding 0  params        x=hue  y=time  z=unused  w=aspect
  binding 1  palette_extra x=sat  y=bright z=pulse  w=alpha
  binding 2  audio_uniforms x=energy (-1 = IDLE) y=bass z=mid w=high
  binding 3  palette_rgb   xyz duotone base
  binding 4  pack_drive    x=intensity y=depth z=feedback w=speed

Reference sketch in exactly the form you must produce:

\`\`\`wgsl
${PACK_V1_AUTHORING_TEMPLATE}
\`\`\``;

const RULES = `Hard rules:

- Authoring form only: \`@group(0)\` uniforms and
  \`fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>)\`.
  Never emit the Bevy \`#import\` or \`@group(2)\` — import remaps those.
- Declare all five uniforms with the exact names above, even if unused.
- \`audio_uniforms.x == -1\` means NO AUDIO. Handle it explicitly: an idle
  projector must show a deliberate calm state, not whatever energy 0 produces.
- Every \`pack_drive\` knob must visibly change the look. A knob that does
  nothing is a bug — the operator reaches for it mid-set and nothing happens.
- Clamp knob reads (\`clamp(pack_drive.x, 0.0, 1.0)\`) — hosts do not promise range.
- WGSL only. No GLSL builtins, no \`#define\`, no textures, no storage buffers.

Prefer routing reactivity through \`pack_drive\` and \`palette_extra\` rather than
reading \`audio_uniforms\` directly wherever a knob can express it — those are
the values an operator and a declared mapping can reach. Reach for binding 2
only for per-pixel effects a knob cannot express.`;

const OUTPUT_CONTRACT = `Reply with the complete WGSL in ONE fenced \`\`\`wgsl block, nothing before or
after it except at most two sentences of explanation. Never emit a diff, a
patch, an ellipsis, or "…rest unchanged" — the editor replaces the whole buffer
with what you return, so a partial answer destroys the sketch.`;

/** System prompt for a given action. */
export function buildCopilotSystem(action: CopilotAction): string {
  const role =
    'You are a visualization engineer writing WGSL fragment shaders for Aurora, a live VJ tool. ' +
    'These run on a projector in front of an audience: favour looks that read at a distance, ' +
    'avoid seizure-adjacent full-frame strobing, and never emit code that could fail to compile.';

  if (action === 'explain') {
    // No output contract: an explanation that arrives wrapped in a wgsl fence
    // would be applied to the buffer by the parser, silently replacing the
    // shader the operator asked about.
    return `${role}\n\n${PACK_V1_BUS_BRIEF}\n\nExplain the shader the operator shows you: what it draws, how each knob and audio band affects it, and anything that looks wrong. Prose only — do NOT emit a wgsl code block.`;
  }

  return `${role}\n\n${PACK_V1_BUS_BRIEF}\n\n${RULES}\n\n${OUTPUT_CONTRACT}`;
}

function describeKnobs(knobs: StudioKnobs): string {
  return [
    `intensity ${knobs.intensity.toFixed(2)}`,
    `depth ${knobs.depth.toFixed(2)}`,
    `feedback ${knobs.feedback.toFixed(2)}`,
    `speed ${knobs.speed.toFixed(2)}`,
    `hue ${knobs.hue.toFixed(2)}`,
    `sat ${knobs.sat.toFixed(2)}`,
    `bright ${knobs.bright.toFixed(2)}`,
  ].join(', ');
}

function describeDiagnostics(diagnostics: readonly WgslDiagnostic[]): string {
  return diagnostics
    .slice(0, 20)
    .map((d) => `line ${d.lineNumber}: ${d.message}`)
    .join('\n');
}

/**
 * Assemble the request for one copilot turn.
 *
 * Knob values ride along on every action because they are part of the look: a
 * shader tuned against `intensity 0.1` reads differently at `0.9`, and the
 * model cannot see the preview.
 */
export function buildCopilotRequest(input: CopilotRequestInput): CopilotRequest {
  const system = buildCopilotSystem(input.action);
  const brief = input.brief.trim();
  const parts: string[] = [];

  switch (input.action) {
    case 'create':
      parts.push(`Write a new pack-v1 sketch: ${brief}`);
      parts.push(`Operator knob values to tune against: ${describeKnobs(input.knobs)}`);
      break;

    case 'edit':
      parts.push(`Revise this sketch: ${brief}`);
      if (input.selection?.trim()) {
        // The selection is a pointer, not a scope — the contract is still a
        // whole-file reply, because a partial answer would clobber the rest.
        parts.push(
          `Focus on this selected region, but still return the COMPLETE file:\n\`\`\`wgsl\n${input.selection}\n\`\`\``,
        );
      }
      parts.push(`Current knob values: ${describeKnobs(input.knobs)}`);
      parts.push(`Current sketch:\n\`\`\`wgsl\n${input.wgsl}\n\`\`\``);
      break;

    case 'explain':
      parts.push(brief || 'Explain what this shader does.');
      parts.push(`Current sketch:\n\`\`\`wgsl\n${input.wgsl}\n\`\`\``);
      break;

    case 'fix':
      parts.push(
        brief || 'This sketch does not compile. Fix every error and return the corrected file.',
      );
      parts.push(
        input.diagnostics?.length
          ? `Compiler errors:\n${describeDiagnostics(input.diagnostics)}`
          : 'No compiler output was captured; find the problem by inspection.',
      );
      parts.push(`Current sketch:\n\`\`\`wgsl\n${input.wgsl}\n\`\`\``);
      break;
  }

  return { system, messages: [{ role: 'user', content: parts.join('\n\n') }] };
}

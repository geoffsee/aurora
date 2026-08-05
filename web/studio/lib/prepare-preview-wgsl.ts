/**
 * Adapt sketch WGSL for WebGPU preview (authoring entry + @group(0)).
 * Show-form Bevy sources are remapped best-effort; export still uses shared remap the other way.
 */

export type PreparePreviewResult = { ok: true; wgsl: string } | { ok: false; error: string };

const FULLSCREEN_VERTEX = `// Studio fullscreen triangle (fixed; do not edit in sketch pane)
struct StudioVSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> StudioVSOut {
  var pos = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0),
  );
  let p = pos[vi];
  var out: StudioVSOut;
  out.position = vec4<f32>(p, 0.0, 1.0);
  // Map clip to 0..1 UV (y up in clip → flip for typical UV).
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}
`;

/**
 * Convert show-form / mixed sketch source into a fragment-friendly authoring module,
 * then prepend the studio vertex entry.
 */
export function preparePreviewWgsl(source: string): PreparePreviewResult {
  let s = source.replace(/\r\n/g, '\n').trim();
  if (!s) {
    return { ok: false, error: 'WGSL is empty' };
  }

  // Strip Bevy import (invalid in browser WebGPU).
  s = s.replace(/^\s*#import\s+[^\n]+\n/gm, '');

  // Show bus → authoring bus.
  s = s.replace(/@group\(\s*2\s*\)/g, '@group(0)');

  // Bevy fragment(frag: VertexOutput) → authoring entry with uv.
  if (/\bfrag\s*:\s*VertexOutput\b/.test(s)) {
    s = s.replace(
      /@fragment\s+fn\s+fragment\s*\(\s*frag\s*:\s*VertexOutput\s*\)\s*->\s*@location\(\s*0\s*\)\s*vec4\s*<\s*f32\s*>\s*\{/,
      `@fragment\nfn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {`,
    );
    s = s.replace(/\bfrag\.uv\b/g, 'uv');
  }

  if (!/@fragment/.test(s) || !/\bfn\s+fragment\b/.test(s)) {
    return { ok: false, error: 'WGSL must define @fragment fn fragment' };
  }

  // Avoid duplicate vertex if user pasted one.
  if (/\bfn\s+vs_main\b/.test(s)) {
    return { ok: true, wgsl: s.endsWith('\n') ? s : `${s}\n` };
  }

  const combined = `${FULLSCREEN_VERTEX}\n${s}\n`;
  return { ok: true, wgsl: combined };
}

export { FULLSCREEN_VERTEX };

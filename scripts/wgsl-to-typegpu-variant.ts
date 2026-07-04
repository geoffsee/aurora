/**
 * Converts a palette variant WGSL body into a TypeGPU `defineVariant` module.
 * Reads shaders/variants/*.wgsl and writes shaders/variants/*.ts (real tgpu.fn code).
 */
import * as fs from 'fs/promises';
import * as path from 'path';

const BUILTIN_TO_STD = [
  'smoothstep',
  'clamp',
  'fract',
  'floor',
  'mix',
  'pow',
  'exp',
  'log',
  'sin',
  'cos',
  'atan2',
  'length',
  'distance',
  'dot',
  'normalize',
  'reflect',
  'max',
  'min',
  'abs',
  'select',
  'step',
  'mod',
  'round',
  'sqrt',
  'tan',
  'sign',
] as const;

function stripTrailingHelpers(source: string): string {
  const markers = ['\nfn bear_rot_y(', '\nfn wolf_ellipse_2d(', '\nfn ghost_capsule_2d('];
  let cut = source.length;
  for (const marker of markers) {
    const idx = source.indexOf(marker);
    if (idx !== -1) cut = Math.min(cut, idx);
  }
  return source.slice(0, cut).trimEnd();
}

function extractVariantBody(source: string): { name: string; body: string } {
  const fnMatch = source.match(/fn (\w+_variant)\([\s\S]*?\) -> vec4<f32> \{([\s\S]*)\}$/);
  if (!fnMatch) {
    throw new Error('Could not parse variant function');
  }
  return { name: fnMatch[1]!, body: fnMatch[2]!.trim() };
}

function convertBody(body: string): string {
  let s = body;

  // Drop WGSL-only comments that reference backtick identifiers (harmless but noisy).
  s = s.replace(/\/\/[^\n]*/g, (line) => line);

  // vec constructors
  s = s.replace(/vec2<f32>\(/g, 'vec2f(');
  s = s.replace(/vec3<f32>\(/g, 'vec3f(');
  s = s.replace(/vec4<f32>\(/g, 'vec4f(');

  // swizzles on uniforms
  s = s.replace(/palette_rgb\.xyz/g, 'vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z)');

  // TAU constant
  s = s.replace(/\bTAU\b/g, 'TAU');

  // let/var → TypeGPU let (reassignment supported)
  s = s.replace(/\bvar\b/g, 'let');

  // builtins → std.*
  for (const name of BUILTIN_TO_STD) {
    s = s.replace(new RegExp(`(?<!\\.)\\b${name}\\(`, 'g'), `std.${name}(`);
  }

  // restore helper calls that got std.-prefixed
  s = s.replace(/std\.(hash21|noise|fbm|kaleidoscope|crispRing|vjDuotone|duotoneAccent|audioCurve)\(/g, '$1(');
  s = s.replace(/std\.(bear_\w+|wolf_\w+)\(/g, '$1(');

  // vec * scalar and vec4f(color * scalar, ...) patterns
  s = s.replace(/return vec4f\((\w+) \* (\w+), (\w+)\)/g, 'return vec4f($1.mul($2), $3)');
  s = s.replace(
    /(std\.mix\([^)]+\)) \* (std\.clamp\([^)]+\))/g,
    '$1.mul($2)',
  );

  // vec3 ray march / boolean patterns
  s = s.replace(/let t = 0\.0;/g, 'let t = f32(0.0);');
  s = s.replace(/let hit = 0\.0;/g, 'let hit = f32(0.0);');
  s = s.replace(/hit = 1\.0;/g, 'hit = f32(1.0);');
  s = s.replace(/p = (\w+) \+ (\w+) \* (\w+)/g, 'p = $1.add($2.mul($3))');
  s = s.replace(/let hit = false/g, 'let hit = f32(0.0)');
  s = s.replace(/hit = true/g, 'hit = f32(1.0)');
  s = s.replace(/if \(!hit\)/g, 'if (hit < 0.5)');
  s = s.replace(/ghost_capsule_2d/g, 'wolf_capsule_2d');

  // i32 casts → round for float compare downstream
  s = s.replace(/i32\(round\(([^)]+)\)\)/g, 'std.round($1)');

  // TypeGPU requires strict equality in shader bodies
  s = s.replace(/([^=!<>])==([^=])/g, '$1===$2');

  // indent body
  return s
    .split('\n')
    .map((line) => (line.length ? `  ${line}` : line))
    .join('\n');
}

function variantIndexFromFilename(filename: string): number {
  const m = filename.match(/^(\d+)_/);
  if (!m) throw new Error(`Expected NN_name prefix: ${filename}`);
  return Number.parseInt(m[1]!, 10);
}

function exportNameFromStem(stem: string): string {
  const base = stem.replace(/^\d+_/, '').replace(/-/g, '_');
  return `${base}Variant`;
}

async function convertVariantFile(wgslPath: string, outPath: string) {
  const filename = path.basename(wgslPath);
  if (filename === 'geometry_field.wgsl') return;

  const raw = await fs.readFile(wgslPath, 'utf-8');
  const cleaned = stripTrailingHelpers(raw);
  const { name, body } = extractVariantBody(cleaned);
  const converted = convertBody(body);
  const stem = filename.replace(/\.wgsl$/, '');
  const exportName = exportNameFromStem(stem);
  const index = variantIndexFromFilename(filename);

  const extraImports: string[] = [];
  if (converted.includes('crispRing(')) extraImports.push('crispRing');
  if (converted.includes('fbm(') || converted.includes('noise(') || converted.includes('hash21(')) {
    if (converted.includes('hash21(')) extraImports.push('hash21');
    if (converted.includes('noise(')) extraImports.push('noise');
    if (converted.includes('fbm(')) extraImports.push('fbm');
  }
  if (converted.includes('kaleidoscope(')) extraImports.push('kaleidoscope');
  if (converted.includes('vjDuotone(')) extraImports.push('vjDuotone');
  if (converted.includes('duotoneAccent(')) extraImports.push('duotoneAccent');
  if (converted.includes('bear_')) {
    extraImports.push(
      'bear_rot_y',
      'bear_model_sdf',
      'bear_normal',
      'bear_tri_wire_2d',
      'bear_surface_mesh',
      'bear_smin',
      'bear_ellipsoid',
    );
  }
  if (converted.includes('wolf_')) {
    extraImports.push(
      'wolf_ellipse_2d',
      'wolf_capsule_2d',
      'wolf_triangle_2d',
      'wolf_leg_2d_sdf',
    );
  }

  const importLines = [
    `import { std } from 'typegpu';`,
    `import { vjPaletteLayout } from '../shared/layout.ts';`,
    `import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';`,
    `import { paletteVariantShell } from '../shared/variant_fn.ts';`,
  ];
  if (extraImports.length) {
    const fromMath = extraImports.filter((n) =>
      ['hash21', 'noise', 'fbm', 'kaleidoscope', 'crispRing'].includes(n),
    );
    const fromDuotone = extraImports.filter((n) =>
      ['vjDuotone', 'duotoneAccent'].includes(n),
    );
    const fromBear = extraImports.filter((n) => n.startsWith('bear'));
    const fromWolf = extraImports.filter((n) => n.startsWith('wolf'));
    if (fromMath.length) {
      importLines.push(`import { ${fromMath.join(', ')} } from '../shared/math.ts';`);
    }
    if (fromDuotone.length) {
      importLines.push(`import { ${fromDuotone.join(', ')} } from '../shared/duotone.ts';`);
    }
    if (fromBear.length) {
      importLines.push(`import { ${fromBear.join(', ')} } from '../shared/bear_sdf.ts';`);
    }
    if (fromWolf.length) {
      importLines.push(`import { ${fromWolf.join(', ')} } from '../shared/wolf_sdf.ts';`);
    }
  }

  const content = `// @ts-nocheck
${importLines.join('\n')}

export const meta = { index: ${index}, fn: '${name}' } as const;

export const ${exportName} = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

${converted}
});
`;

  await fs.writeFile(outPath, content, 'utf-8');
  console.log(`Converted ${filename} → ${path.basename(outPath)} (${exportName})`);
}

async function main() {
  const root = path.resolve(import.meta.dir, '..');
  const variantsDir = path.resolve(root, 'shaders/variants');
  const files = (await fs.readdir(variantsDir)).filter((f) => f.endsWith('.wgsl')).sort();

  for (const file of files) {
    await convertVariantFile(
      path.resolve(variantsDir, file),
      path.resolve(variantsDir, file.replace(/\.wgsl$/, '.ts')),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

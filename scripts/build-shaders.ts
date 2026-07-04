import { build } from 'bun';
import typegpuPlugin from 'unplugin-typegpu/esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const BEVY_IMPORT = '#import bevy_sprite::mesh2d_vertex_output::VertexOutput\n\n';

function bevyFragmentWrapper(fnName: string): string {
  return `
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  var input: BevyVertexOutput;
  input.position = frag.position;
  input.uv = frag.uv;
  return ${fnName}(input);
}
`;
}

function remapBevyBindGroup(wgsl: string): string {
  return wgsl.replaceAll('@group(0)', '@group(2)');
}

async function main() {
  const rootDir = path.resolve(import.meta.dir, '..');
  const tempDir = path.resolve(rootDir, 'temp_scratch/build');

  await fs.mkdir(tempDir, { recursive: true });

  console.log('Bundling TypeGPU shaders...');
  const bundleResult = await build({
    entrypoints: [
      path.resolve(rootDir, 'shaders/vj_grid.ts'),
      path.resolve(rootDir, 'shaders/vj_palette.ts'),
    ],
    outdir: tempDir,
    plugins: [typegpuPlugin() as any],
    external: ['typegpu', 'typegpu/data'],
  });

  if (!bundleResult.success) {
    console.error('Bundling failed:');
    for (const msg of bundleResult.logs) {
      console.error(msg);
    }
    process.exit(1);
  }

  console.log('Bundling complete. Running resolver...');

  const tgpu = (await import('typegpu')).default;
  const gridModule = await import(path.resolve(tempDir, 'vj_grid.js'));
  const paletteModule = await import(path.resolve(tempDir, 'vj_palette.js'));

  console.log('Resolving vj_grid WGSL...');
  let finalGridWgsl = BEVY_IMPORT + remapBevyBindGroup(
    tgpu.resolve([gridModule.vjGridLayout, gridModule.mainShader]),
  );
  finalGridWgsl += bevyFragmentWrapper('mainShader');

  const gridOutPath = path.resolve(rootDir, 'assets/shaders/vj_grid.wgsl');
  await fs.writeFile(gridOutPath, finalGridWgsl, 'utf-8');
  console.log(`Saved compiled grid shader to ${gridOutPath}`);

  console.log('Resolving vj_palette WGSL...');
  let finalPaletteWgsl = BEVY_IMPORT + remapBevyBindGroup(
    tgpu.resolve(paletteModule.paletteResolveAll),
  );
  finalPaletteWgsl += bevyFragmentWrapper('paletteFragment');

  const paletteOutPath = path.resolve(rootDir, 'assets/shaders/vj_palette.wgsl');
  await fs.writeFile(paletteOutPath, finalPaletteWgsl, 'utf-8');
  console.log(`Saved compiled palette shader to ${paletteOutPath}`);

  await fs.rm(tempDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

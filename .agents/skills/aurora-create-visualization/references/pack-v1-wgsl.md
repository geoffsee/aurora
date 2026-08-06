# pack-v1 WGSL reference (Aurora packages)

## Uniform bus

| Binding | Name | Components |
| ---: | --- | --- |
| 0 | `params` | x=**hue**, y=**time**, z=unused, w=**aspect** |
| 1 | `palette_extra` | x=**sat**, y=**bright**, z=**pulse**, w=**alpha** |
| 2 | `audio_uniforms` | x=**energy (−1 idle)**, y=**bass**, z=**mid**, w=**high** |
| 3 | `palette_rgb` | xyz=**duotone base RGB**, w=unused |
| 4 | `pack_drive` | x=**intensity**, y=**depth**, z=**feedback**, w=**speed** |

Launchpad performance knobs map to `pack_drive`. Global Color / sat / bright feed hue + palette fields.

## Authoring form (Studio + agent default)

```wgsl
// Preset Studio authoring — pack-v1 @group(0). Import remaps to Bevy show form.

@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(0) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(0) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(0) @binding(4) var<uniform> pack_drive: vec4<f32>;

@fragment
fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let t = params.y;
  let aspect = max(params.w, 0.01);
  let intensity = clamp(pack_drive.x, 0.0, 1.0);
  let depth = clamp(pack_drive.y, 0.0, 1.0);
  let feedback = clamp(pack_drive.z, 0.0, 1.0);
  let speed = clamp(pack_drive.w, 0.0, 1.0);

  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let energy = select(0.25, clamp(energy_raw, 0.0, 1.0), energy_raw >= 0.0);
  let bass = select(0.15, clamp(audio_uniforms.y, 0.0, 1.0), energy_raw >= 0.0);
  let mid = select(0.12, clamp(audio_uniforms.z, 0.0, 1.0), energy_raw >= 0.0);
  let high = select(0.1, clamp(audio_uniforms.w, 0.0, 1.0), energy_raw >= 0.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.5);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let alpha = clamp(palette_extra.w, 0.0, 1.0);

  let p = (uv - vec2(0.5)) * vec2(aspect, 1.0);
  let r = length(p);
  // … your SDF / pattern …
  let body = exp(-r * r * (2.0 + intensity * 4.0)) * (0.4 + intensity * 0.6 + pulse * 0.2);
  let base = max(palette_rgb.xyz, vec3(0.05));
  let gray = vec3(dot(base, vec3(0.299, 0.587, 0.114)));
  let col = mix(gray, base, sat) * bri * body;
  let a = body * alpha * mix(0.85, 1.0, 0.5 + 0.5 * live);
  // Touch remaining axes so bindings stay intentional.
  let keep = depth + feedback + speed + energy + bass + mid + high + t * 0.0;
  return vec4(col + vec3(keep * 0.0), a);
}
```

Canonical source of the minimal template: `PACK_V1_AUTHORING_TEMPLATE` in `shared/aurora-package.ts`.

## Show form (after import remap)

Import rewrites authoring → show:

- `#import bevy_sprite::mesh2d_vertex_output::VertexOutput`
- `@group(0)` → `@group(2)`
- Fragment entry → `fn fragment(frag: VertexOutput)` with `let uv = frag.uv`

You may also author show form directly and set `wgslForm: "show"` in the manifest.

## Validation rules (importer)

- kebab-case `slug`  
- `kind: "aurora-package"`, `schemaVersion: 1`, `target: "pack-fullscreen"`, `uniformBus: "pack-v1"`  
- `disposition: "fullscreen-primary"`, `suppressLegacyField: true`  
- WGSL contains `@fragment` / `fn fragment` and the five uniform **names**  
- Size caps: WGSL ≤ 256 KiB, archive ≤ 1 MiB  

## What not to do

- Hand-edit only one deck under `data/decks/`  
- Add texture bindings (not on pack-v1 bus)  
- Rely on Studio WebGPU preview alone for Bevy-only features (`#import`, VertexOutput) without export/import  
- Confuse Shadertoy import (`/api/shadertoy/import`) with `.aurora-package` import  

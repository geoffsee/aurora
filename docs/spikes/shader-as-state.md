# Spike: Shader-as-State Design

**Issue:** #56  
**Status:** spike only — no implementation commitment  
**Personas:** Rezz, Max Cooper

---

## Problem Statement

The active WGSL shader (`vj_palette.wgsl`) is currently hard-coded as a static method on `VjPaletteMaterial`. Adding more shaders later — required for audio-reactive visual variety — would demand retrofitting runtime shader selection through an already-deeper architecture. This spike enumerates the data model changes needed to make the active shader a first-class `ControlState` field, hot-swappable via OSC.

---

## Current State

### Where the shader is pinned

**`src/main.rs:110-118`** — `Material2d::fragment_shader()` is a static method:

```rust
impl Material2d for VjPaletteMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/vj_palette.wgsl".into()   // same shader for all instances, forever
    }
}
```

**`index.ts:33-67`** — `ControlState` has no shader field. Every visual parameter is represented here (`palette`, `intensity`, `depth`, …) except the shader program itself.

**`osc-validation.ts:43-64`** — `VST_CONTROL_NAMES` has no shader entry; the VST plugin mirrors `ControlState` exactly.

### What hot-reload already gives us

The hot-reload watcher in `index.ts:895-918` monitors `assets/shaders/` and broadcasts `/bevyosc/dev/reload` when any `.wgsl` changes. This reloads the whole page — it does not hot-swap a running shader without a full reload. It is developer infrastructure, not runtime shader selection.

---

## Required Data Model Changes

There are three plausible implementation strategies with different change surfaces. They share the same bridge/JS changes; they differ only in how Rust applies the selection.

### Shared changes (all strategies)

#### 1. `ControlState` in `index.ts`

Add one field:

```typescript
type ControlState = {
    // … existing fields …
    shaderMode: number;   // integer enum; 0 = vj_palette (current default)
};
```

An integer enum is preferred over a string path. String paths require allow-listing on the bridge to prevent path traversal; an integer maps to a fixed Rust enum and is range-clamped trivially.

#### 2. `coerceControlState` in `index.ts`

```typescript
shaderMode: clampInt(source.shaderMode, 0, MAX_SHADER_MODE, defaults.shaderMode),
```

`MAX_SHADER_MODE` grows as new shaders are shipped; it is a named constant, not a magic number.

#### 3. `defaultControlState()` in `index.ts`

```typescript
shaderMode: 0,
```

#### 4. `CONTROL_STATE_SCHEMA_VERSION` in `osc-validation.ts`

Bump from `1` → `2`. Add a migration branch in the WebSocket handler in `index.ts` that projects a v1 payload to v2 defaults (`shaderMode: 0`). Update `defaultState()` in `controls.html` to emit `schemaVersion: 2`.

#### 5. `index.html` (projector page)

Add a new getter to the `window.__bevyosc*` shim surface:

```js
window.__bevyoscControlShaderMode = () => bevyoscState.control?.shaderMode ?? 0;
```

#### 6. `src/main.rs` — `VjState`

Add:

```rust
struct VjState {
    // … existing fields …
    active_shader: u32,
}
```

Add a `wasm_bindgen` extern in the `#[cfg(target_arch = "wasm32")]` block:

```rust
#[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlShaderMode)]
fn browser_control_shader_mode() -> u32;
```

In `read_osc_inputs`, read and assign:

```rust
state.active_shader = browser_control_shader_mode();
```

#### 7. VST plugin (`plugins/bevyosc-vst/src/lib.rs`)

Add to `BevyoscParams`:

```rust
#[id = "shader_mode"]
shader_mode: IntParam,
```

Add to `ParameterCache`, `ParameterCache::default()`, and the change-detection block that emits OSC. The bridge gains `"shader_mode"` in `VST_CONTROL_NAMES` and a matching `case` in `applyVstControlMessage`. The `_switchCaseNames` consistency check will enforce this.

---

## Strategy Options for Rust-Side Application

### Strategy A — Uniform dispatch (lowest risk)

Add a `shader_mode` uniform to `VjPaletteMaterial` and branch inside a single WGSL file:

```rust
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjPaletteMaterial {
    #[uniform(0)] params: Vec4,
    #[uniform(1)] palette_extra: Vec4,
    #[uniform(2)] audio_uniforms: Vec4,
    #[uniform(3)] shader_ctrl: Vec4,   // x = shader_mode (u32 cast to f32)
}
```

`vj_palette.wgsl` reads `shader_ctrl.x` and routes to different visual routines via `select()` or `if`. No ECS entity changes; no material type changes; no asset system involvement.

**Trade-off:** All shader code lives in one file. WGSL `if` branches on uniforms are GPU-divergent only within a wave; on modern hardware this is acceptable for a single full-screen quad. The file grows as shaders are added.

### Strategy B — Multiple material types, swap on change (moderate cost)

Define one Rust struct per shader: `VjPaletteMaterial`, `VjTunnelMaterial`, etc. Each implements `Material2d` with its own `.wgsl` file. The `active_shader` field in `VjState` drives an ECS mutation: despawn the GPU quad entity and respawn it with the correct `MeshMaterial2d<T>`.

Bevy handles GPU bind group creation per material type. Each type can have a different uniform layout, which is the primary advantage over Strategy A for complex shaders with different parameter sets.

**Trade-off:** Requires ECS entity lifecycle management on shader switch. All shared uniform fields (`palette`, `audio_uniforms`, etc.) must be duplicated across every material struct, or extracted into a shared sub-binding that each type imports. Adding a new audio uniform (as in #53) requires updating every material type.

### Strategy C — Runtime asset handle swap (highest fidelity)

Load WGSL shaders as `Handle<Shader>` assets via `AssetServer`. Use `ShaderRef::Handle(handle)` instead of the string literal in `fragment_shader()`. On switch, load the new shader asset and replace the handle stored in the material. Bevy's pipeline cache detects the new shader and recompiles asynchronously.

This is how live WGSL patching would work for user-defined shaders. It is architecturally cleanest for open-ended shader extensibility (Brian Eno / generative scenario).

**Trade-off:** The pipeline recompile introduces a 1-3 frame visual stutter on switch. The shader handle must be pre-loaded or the switch is deferred until the asset is ready. Also requires that all active shaders share the same bind group layout (same `@group(2)` binding slots) or the pipeline cache creates separate entries per layout — manageable if standardised upfront.

---

## Sequencing Relative to #53 (Audio-Reactive Shader Uniforms)

Issue #53 adds audio uniforms to `VjPaletteMaterial` — specifically the `audio_uniforms: Vec4` binding at `@group(2) @binding(2)` (already declared in the struct at `src/main.rs:101-108`; #53 fully activates it in the renderer). The question is whether shader-as-state should be implemented before or after this.

### If using Strategy A (uniform dispatch)

**No sequencing constraint.** Adding `shader_ctrl` at `@group(2) @binding(3)` is fully independent of the audio uniforms at binding 2. Either issue can land first.

### If using Strategy B or C (multiple types or asset swap)

**Soft preference: implement before #53**, for these reasons:

1. **Bind group layout lock-in.** If #53 adds a new audio uniform binding to `VjPaletteMaterial`, any subsequent second material type (Strategy B) must duplicate that binding exactly. If shader-as-state is added first, the final set of uniform slots is established before they multiply across types.

2. **VST parameter ID stability.** VST parameter IDs (`#[id = "..."]`) are persisted in DAW project state. Adding shader-mode before audio uniforms means the shader-mode parameter ID is registered before audio-specific parameters, preserving a stable ordering in any persisted presets.

3. **Schema migration cost.** Each bump of `CONTROL_STATE_SCHEMA_VERSION` requires a migration path in the WebSocket handler. Landing both fields in one version bump is cheaper than two sequential bumps.

**If Strategy A is chosen, both issues can be parallelised freely.** Strategy A is the recommended starting point precisely because it removes the sequencing constraint.

---

## Recommendation

Implement as **Strategy A** to eliminate the sequencing constraint:

1. Add `shaderMode: number` to `ControlState` (bridge/JS side, schema v2).
2. Add `shader_ctrl: Vec4` at `@group(2) @binding(3)` to `VjPaletteMaterial`.
3. Dispatch visually different routines inside `vj_palette.wgsl` based on `shader_ctrl.x`.
4. Expose via `window.__bevyoscControlShaderMode` getter in `index.html`.
5. Add `shader_mode` to VST params and `VST_CONTROL_NAMES`.

When a second WGSL file is genuinely needed (distinct bind group layout, user-supplied code), migrate from Strategy A to Strategy C at that point. The `ControlState.shaderMode` field and all downstream wiring remain identical; only the Rust material impl changes.

---

## Files Touched by Full Implementation

| File | Change |
|------|--------|
| `osc-validation.ts` | Bump `CONTROL_STATE_SCHEMA_VERSION` to 2; add `"shader_mode"` to `VST_CONTROL_NAMES` |
| `index.ts` | Add `shaderMode` to `ControlState` type, `defaultControlState`, `coerceControlState`; add migration branch; add `case "shader_mode"` in `applyVstControlMessage` |
| `index.html` | Add `window.__bevyoscControlShaderMode` getter |
| `controls.html` | Update `defaultState()` to emit `schemaVersion: 2`; add shader mode UI |
| `src/main.rs` | Add `active_shader: u32` to `VjState`; add `browser_control_shader_mode` extern; read in `read_osc_inputs`; add `shader_ctrl` uniform to `VjPaletteMaterial`; pass it in `update_palette_material` |
| `assets/shaders/vj_palette.wgsl` | Add `@group(2) @binding(3)` for `shader_ctrl`; add dispatch logic |
| `plugins/bevyosc-vst/src/lib.rs` | Add `shader_mode: IntParam` to `BevyoscParams`, `ParameterCache`, change detection, OSC emission |

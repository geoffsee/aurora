# Preset Studio

Authoring surface for **new fullscreen pack looks**. Product path:

1. **React Studio** (browser) — sketch list in local state, side-by-side WGSL editor, knobs, live WebGPU preview  
2. **Export** → [`.aurora-look`](./aurora-look.md) archive  
3. **Aurora import** → `POST /api/looks/import` (requires `AURORA_DATA_DIR`) → catalog → launchpad  

Format + library: `shared/aurora-look.ts`, [aurora-look.md](./aurora-look.md).

> **Status:** React Studio (`web/studio/`), archive format, and bridge import are in-repo.  
> An experimental **Bevy host** still exists at `lab/preset-studio` for pack-bus parity on real `Material2d` (`bun run preset-studio:bevy`). Prefer the React path for day-to-day authoring.

## Run

```bash
bun run studio          # http://127.0.0.1:3010  (STUDIO_PORT / STUDIO_HOST override)
bun run build:studio    # static build → dist/studio
bun run preset-studio   # alias of studio (React)
bun run preset-studio:bevy   # experimental Bevy host
```

### Workflow

1. Open Studio; edit WGSL (authoring `@group(0)` template by default).  
2. Tweak **Intensity / Depth / Feedback / Speed** + palette / demo audio.  
3. **Export .aurora-look** — downloads a zip archive.  
4. **Import to Aurora** — POSTs the archive to the bridge (default `http://127.0.0.1:3000`). Bridge must be running with `AURORA_DATA_DIR` set.  
5. Select the new slug on the controls launchpad.

Sketches persist in `localStorage` (`aurora-studio-sketches-v1`). They are **not** the show catalog.

### Preview honesty

| Surface | Renderer |
| --- | --- |
| Studio preview | Browser **WebGPU** + pack-v1 uniform bus (`@group(0)`) |
| Show | Bevy **Material2d** (`@group(2)` + `VertexOutput`) |

Export/import remaps authoring → show when needed (`remapAuthoringWgslToShow`). Preview is the same math bus, not a second fake shader model — but it is still not the Bevy host. For pixel-exact Bevy parity use `bun run preset-studio:bevy`.

## pack-v1 bus

| Binding | Name | Meaning |
| ---: | --- | --- |
| 0 | `params` | x=hue, y=time, z=unused, w=aspect |
| 1 | `palette_extra` | x=sat, y=bright, z=pulse, w=alpha |
| 2 | `audio_uniforms` | x=energy (**−1 idle**), y=bass, z=mid, w=high |
| 3 | `palette_rgb` | xyz duotone base |
| 4 | `pack_drive` | x=intensity, y=depth, z=feedback, w=speed |

## Layout

```text
web/studio/
  index.html
  App.tsx                 # shell
  lib/
    sketch-store.ts       # local sketches + knobs
    prepare-preview-wgsl.ts
    pack-preview.ts       # WebGPU
    export-look.ts        # archive + bridge POST
  components/
```

## Bevy host (experimental parity tool)

```bash
bun run preset-studio:bevy
bun run check:preset-studio
```

Uses `CARGO_TARGET_DIR=target-studio`. Sketches under `lab/preset-studio/sketches/`.

## Agent skill

Project skill: **`.agents/skills/aurora-create-visualization/`** (`/aurora-create-visualization`).

Agents create looks via pack-v1 WGSL → `.aurora-look` → import — not hand dual-deck rituals. Helper:

```bash
bun run .agents/skills/aurora-create-visualization/scripts/build-look.ts \
  --slug my-look --label "My Look" --wgsl ./look.wgsl --out /tmp/my-look.aurora-look
```

See [aurora-look.md](./aurora-look.md) and the skill `SKILL.md` / `references/pack-v1-wgsl.md`.

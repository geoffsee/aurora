# Preset Studio

Authoring surface for **new fullscreen packages**. Product path:

1. **React Studio** (browser) — sketch list in local state, side-by-side WGSL editor, knobs, live WebGPU preview  
2. **Publish to Console** — same-origin `localStorage` + **BroadcastChannel** (works on GitHub Pages without the bridge)  
3. **Export** → [`.aurora-package`](./aurora-package.md) archive (download)  
4. **Import to Aurora** → `POST /api/packages/import` (live bridge + `AURORA_DATA_DIR`) → dual-deck overlay  

Format + library: `shared/aurora-package.ts`, [aurora-package.md](./aurora-package.md).  
Channel: `shared/package-channel.ts` (`aurora-packages-v1` / `aurora-authored-packages-v1`).

### GitHub Pages

Deploy builds Studio into `dist/studio/` (route **`/studio/`**). Console has a **Studio** button; on the geoffsee Pages site the bottom nav also links Studio. Publish from Studio, then pick the slug on the launchpad — projector/controls resolve authored packages before static `api/modes/compiled/…` files.

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
3. **Export .aurora-package** — downloads a zip archive.  
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
    export-package.ts        # archive + bridge POST
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

Agents create packages via pack-v1 WGSL → `.aurora-package` → import — not hand dual-deck rituals. Helper:

```bash
bun run .agents/skills/aurora-create-visualization/scripts/build-package.ts \
  --slug my-look --label "My Look" --wgsl ./package.wgsl --out /tmp/my-look.aurora-package
```

See [aurora-package.md](./aurora-package.md) and the skill `SKILL.md` / `references/pack-v1-wgsl.md`.

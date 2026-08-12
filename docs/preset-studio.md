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
    copilot-prompt.ts     # NL → request assembly (pure)
    copilot-response.ts   # reply → validated proposal (pure)
    copilot-provider.ts   # pluggable inference, BYOK
  components/
```

## Copilot

An optional in-Studio authoring assistant: describe a look in plain language and
get a valid pack-v1 sketch, then keep revising it with the model still holding
your buffer in context. Four actions — **Create**, **Edit**, **Explain**,
**Fix errors** — in the left dock, beside the sketch list.

### Provider setup (BYOK)

**Disabled until you configure it, and no credential ships in the bundle.**
Studio is static files; there is no server to hold a secret, so the key is yours,
entered by you, kept in this browser.

| Field | Notes |
| --- | --- |
| **API key** | Your own key. Stored in `localStorage` under `aurora-studio-copilot` |
| **Model** | Defaults to `claude-opus-5` |
| **Endpoint** | Optional. Point at a proxy or a local endpoint instead of the API |

The direct-from-browser path needs the Anthropic SDK's `dangerouslyAllowBrowser`
flag, and the warning behind that name is real: a key in `localStorage` is
readable by anything that can run script in the tab. For a local authoring tool
with a key you can scope and revoke that is a reasonable trade — but it *is* a
trade, which is why **Endpoint** is a first-class option. Point it at a proxy
that holds the credential and the browser never sees one.

Offline or unconfigured, Studio works exactly as before; the panel says so and
the Run button stays disabled. The SDK is loaded with a dynamic `import()`, so a
session that never configures a provider never downloads it.

### What it will and will not do

**It never writes to your buffer on its own.** Every proposal — including
Create — waits behind an explicit **Apply**. A copilot that silently replaces
the editor is one bad generation away from losing an hour of work.

**It never offers Apply for something that would not export.** Proposals go
through the *same* `validateBundle` that Export and Publish use, plus three
shape checks that validator cannot make:

- no `@fragment` entry point → the reply is a fragment, not a file
- a missing bus uniform → the pack would not bind
- `// ... rest unchanged` → applying it would delete the elided code

A rejected proposal shows its errors and has no Apply button. Discovering at
Publish time that a copilot-authored pack does not validate — mid-load-in — is
the failure this designs out.

Show-form replies are **rejected rather than remapped**: the copilot is told to
emit authoring form, and silently converting a reply that ignored that hides the
fact that it did.

### What the model is told

`copilot-prompt.ts` builds the system prompt from
`PACK_V1_AUTHORING_TEMPLATE` itself rather than a hand-written copy of the bus,
so a binding change updates the prompt instead of leaving the copilot
confidently teaching a stale layout. Rules cover authoring form, the five
uniforms, the `energy === -1` idle sentinel, knobs that must actually do
something, and clamping.

Each turn carries the current buffer (except Create), current knob values (the
model cannot see the preview), and — for Fix — the compiler diagnostics. An
editor selection is sent as a *pointer*, with the whole-file contract restated:
a reply containing only the selected region would delete the rest on Apply.

### Not yet

- **Three.js (v2) packages** — WGSL path first; the panel is hidden on Three sketches
- **Declared audio mappings** — when the #284 schema lands, the copilot should
  emit `mappings.json` alongside the WGSL rather than only shader-side math
- **Auto-repair loop** — Fix errors is manual; the validate → regenerate cycle is
  a follow-on

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

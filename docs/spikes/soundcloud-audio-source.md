# SoundCloud playback as an audio-feature source

Investigation for issue #287. Researched August 2026.

**Verdict: no-go on analysing SoundCloud audio. Go on a narrower slice that solves most of the operator problem without touching SoundCloud's audio at all.**

## The question

Console can play tracks through SoundCloud's official embed while live reactivity comes from the room mic. When SoundCloud is the musical source that is a bad pipeline: the mic hears a delayed, room-coloured copy — or silence, on headphones — and the mic path already disables AEC/AGC precisely because those subtract speaker audio. Can we tap the SoundCloud playback instead, and prefer it over the mic when it is playing?

## Candidates, assessed

### 1. Widget API — metadata and transport only

The `SC.Widget` API is a `postMessage` bridge into a cross-origin iframe. It exposes `getVolume`, `getDuration`, `getPosition`, `getSounds`, `getCurrentSound`, `getCurrentSoundIndex`, `isPaused`, and the `SC.Widget.Events` family (`READY`, `PLAY`, `PAUSE`, `FINISH`, `PLAY_PROGRESS`, …). Every getter is async because it is a postMessage round-trip.

There is **no PCM, no spectrum, no `AudioNode`, no `MediaStream`**. Nothing in the API surface returns audio data.

**Useful for:** knowing SoundCloud is playing, what is playing, and where we are in it.
**Useless for:** features.

### 2. `captureStream` / `MediaElementAudioSourceNode` on the embed — blocked

The embed is a cross-origin iframe. We cannot reach its `<audio>`/`<video>` element, and even if we could, `captureStream()` on a cross-origin media element is blocked, as is routing it through a `MediaElementAudioSourceNode`. This is the same-origin policy doing its job; there is no flag, no header SoundCloud could set that we control, and no cooperation short of SoundCloud shipping an audio-data API.

**Blocked. Permanently, absent a SoundCloud product change.**

### 3. First-party playback via the API — technically possible, blocked by policy

The API does expose streams: `GET /tracks/:id/streams` returns transcodings, and tracks carry an `access` field of `playable`, `preview`, or `blocked`. So a bridge or Worker with our OAuth credentials could, in principle, fetch a stream URL, play it in an `<audio>` element Aurora owns, and feed the same `extractMicFeatures` analyser.

This is where the investigation actually terminates, and it is on **terms, not tech**:

- The API Terms require, when streaming user content, crediting the uploader, crediting SoundCloud, and clearly visible backlinks to the track's `permalink_url`.
- Prohibited use cases have historically included building an alternative digital content service — aggregating and streaming content into an on-demand listening service, or a playback experience that mixes SoundCloud content with other sources. A VJ tool that plays SoundCloud tracks alongside Ableton output is squarely a "playback experience mixing SoundCloud content with other services".
- The help centre states the public APIs generally cannot be used for commercial use cases.
- Stream requests are limited to 15,000 per client ID per 24 hours, and SoundCloud reserves sole discretion to impose further limits, with circumvention explicitly prohibited.
- Access now goes through an application review, requires an Artist Pro account, and uses OAuth 2.1 with PKCE.

Replacing the official embed with our own player is exactly the thing the terms are written to prevent, and doing it *in order to* run a spectrum analyser over the audio does not make it more compliant. Aurora already made the right call once — README says "official embedded player, tokens off the frontend" — and this would reverse it.

**No-go.** Not because it would not work, but because it would put the project on the wrong side of an agreement it has so far respected.

Proxying the media through the Worker for analysis is the same violation with a bandwidth bill attached.

### 4. `getDisplayMedia` tab audio — works, and is honest

The operator shares the Console tab (or the whole system output) with audio; we get a real `MediaStream` and feed it to the existing analyser path. No SoundCloud API involvement at all: we are analysing *our own machine's audio output*, which is the operator's own audio, played through the official player, exactly as licensed.

Constraints, stated plainly:

- **Requires a user gesture and a picker dialog**, every session. It cannot be made automatic.
- **Tab audio capture is Chromium-only in practice.** Firefox `getDisplayMedia` does not deliver audio; Safari does not either. Aurora already requires WebGPU (current Chrome/Edge), so this is close to free — but it is a hard dependency, not a graceful degradation.
- On macOS, system-wide loopback still needs a virtual device; *tab* capture avoids that, which is why tab is the right target rather than screen.
- Adds no meaningful latency over the mic path and removes the room entirely.

**This is the recommendation.**

### 5. System loopback — out of scope for the web path

Noted for a future native host. Requires a virtual audio device (BlackHole, VB-Cable, WASAPI loopback) and is an install-time concern, not something Aurora can arrange from a page.

## Recommendation

**Do not attempt to analyse SoundCloud's audio. Ship two smaller things instead.**

### Slice A — tab audio as a first-class source (the actual fix)

Generalise the existing `startMicCapture` into `startBrowserAudioAnalyse(stream, source)` so the analyser is source-agnostic, and add a **Tab audio** option beside **Use mic** and **Demo audio**. The features that come out are byte-identical in shape; only the acquisition changes.

`StatusHeader` gains a third label alongside `Mic audio` / `Demo audio` / `OSC live`: **Tab audio**.

This solves the operator's real problem — visuals driven by the actual music instead of a room mic — for SoundCloud *and* for YouTube, Bandcamp, a DAW's browser preview, or anything else playing on that machine. It is strictly more useful than a SoundCloud-specific tap would have been, and it has no ToS surface at all.

### Slice B — Widget API for "SoundCloud is playing"

Use `SC.Widget` for what it does expose: bind `PLAY`/`PAUSE`/`FINISH` and surface *SoundCloud is playing* as a state Console knows about. That is enough to:

- prompt once ("SoundCloud is playing — share this tab's audio to drive visuals from it?")
- show the current track in Console rather than only inside the iframe
- feed transport position to anything that wants it later

### Source arbitration

The issue asks for automatic preference. With tab audio as the mechanism, "automatic" is impossible — capture needs a gesture. Proposed priority, highest first:

1. Explicit operator selection
2. Tab audio, while its stream is live
3. AbletonOSC, while frames are arriving
4. Mic, while capturing
5. Demo audio
6. Idle → `energy: -1`

On track change or a paused stream, hold the last features briefly and then fall to the idle sentinel rather than dropping to zeros — zeros read as "silent room", the sentinel reads as "no source", and they should look different downstream (see `docs/audio-mapping.md`).

## Non-goals, decided

- **Will not** scrape widget internals or reach into the iframe.
- **Will not** replace the official embed with a first-party player, with or without OAuth stream URLs.
- **Will not** proxy SoundCloud media through the bridge or Worker.
- **Will not** claim automatic SoundCloud→features switching; the capture gesture makes it a prompt, not an automation.

## Follow-on

One implementation issue for Slice A (source-agnostic browser analyser + tab audio option + status pill + arbitration), with Slice B as a smaller companion. Slice A does not depend on the SoundCloud integration at all and is worth doing even if the SoundCloud panel never changes.

## Sources

- [Widget API — SoundCloud Developers](https://developers.soundcloud.com/docs/api/html5-widget)
- [API Terms of Use — SoundCloud Developers](https://developers.soundcloud.com/docs/api/terms-of-use)
- [Rate Limits — SoundCloud Developers](https://developers.soundcloud.com/docs/api/rate-limits)
- [SoundCloud Public APIs — Help Center](https://help.soundcloud.com/hc/en-us/articles/115003446727-SoundCloud-Public-APIs)
- [API Guide — SoundCloud Developers](https://developers.soundcloud.com/docs/api/guide)

## In-tree references

- `web/controls/components/SoundCloudPanel.tsx`, `web/controls/lib/soundcloud.ts`
- `web/controls/context/ControlsContext.tsx` — `startMicCapture`, `micTick`
- `web/controls/lib/mic.ts` — feature extraction, secure-context errors
- `bridge/soundcloud-client.ts`, `worker/src/soundcloud-account.ts`, `docs/soundcloud-worker.md`

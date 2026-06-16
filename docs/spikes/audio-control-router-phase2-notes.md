# Audio-Control Router — Phase 2 Follow-On Notes

Phase 1 (issue #155) shipped the bridge-side routing layer:

- `audio-control-router.ts` — `AudioMapping` schema + `AudioControlRouter`.
- `/bevyosc/audio/features` WS path (browser → bridge) and `/bevyosc/audio/config`
  (mappings reload).
- `ControlState.audioControlMode` (clamped in `coerceControlState`); VST
  `audio_control_mode` control.
- `audio-mappings.json` default routing config.

Phase 2 decouples the audio source from Ableton entirely by capturing audio in the
browser with `getUserMedia` + an `AnalyserNode`, then feeding the same
`/bevyosc/audio/features` path Phase 1 already consumes. No further bridge changes are
required.

## Blocker to document for the Phase 2 implementer: secure-context requirement

`getUserMedia` is only exposed in a **secure context** — an HTTPS origin **or**
`localhost`/`127.0.0.1`. The controls page is served over plain HTTP on `:3001`, so:

- On the show laptop itself (`localhost:3001`) capture works.
- On a **LAN rehearsal rig** reached by IP (e.g. `http://192.168.1.20:3001`), the origin
  is **not** secure. `navigator.mediaDevices` is `undefined` there, and a naive call
  rejects with `NotAllowedError`/`TypeError` — it **breaks silently** with no audio and
  no obvious cause.

**Mitigation the Phase 2 work must include:**

1. Feature-detect `navigator.mediaDevices?.getUserMedia` and `window.isSecureContext`
   before offering the Web Audio toggle; show an explicit "requires HTTPS or localhost"
   message instead of failing silently.
2. Document that any non-localhost deployment of the controls page needs TLS (a reverse
   proxy / self-signed cert) or an SSH/`localhost` tunnel from the operator machine.

This is a deployment/UX constraint, not an API gap — `getUserMedia` is available in all
supported browsers (Chrome, Firefox, Safari ≥ 14.1).

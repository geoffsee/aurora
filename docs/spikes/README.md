# Spikes

Design investigations. A spike lands here when the deliverable is a **decision**
— the argument, the options rejected, and the reason — rather than code.

Nothing here is implemented unless it says so. Each doc states its own status.

| Doc | Question | Outcome |
| --- | --- | --- |
| [cues-model.md](./cues-model.md) | What is a Cue, and how does it relate to presets, flash, `cueVersion`, and safety? (#288) | Five concepts stay five; `cueVersion` renamed to `lookEpoch`; cues snap, presets interpolate |
| [soundcloud-audio-source.md](./soundcloud-audio-source.md) | Can SoundCloud playback drive the audio-feature bus, in preference to the mic? (#287) | **No** on analysing SoundCloud audio (ToS, not tech). **Yes** to tab audio capture, which solves more |
| [hardware-io-adapters.md](./hardware-io-adapters.md) | How should Aurora grow lighting / laser / show-control support? (#283) | One Rust sidecar, many adapters, shared transports with layered personalities. First slice: Art-Net params |

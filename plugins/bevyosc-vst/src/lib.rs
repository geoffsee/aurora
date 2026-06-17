use std::{net::UdpSocket, num::NonZeroU32, sync::Arc};

use nih_plug::prelude::*;
use rosc::{encoder, OscMessage, OscPacket, OscType};

const DEFAULT_TARGET: &str = "127.0.0.1:12000";
struct BevyoscVst {
    params: Arc<BevyoscParams>,
    sender: OscSender,
    cache: ParameterCache,
    sent_initial_state: bool,
}

#[derive(Params)]
struct BevyoscParams {
    #[id = "crossfade"]
    crossfade: FloatParam,
    #[id = "bpm"]
    bpm: FloatParam,
    #[id = "speed"]
    speed: FloatParam,
    #[id = "intensity"]
    intensity: FloatParam,
    #[id = "feedback"]
    feedback: FloatParam,
    #[id = "depth"]
    depth: FloatParam,
    #[id = "palette"]
    palette: FloatParam,
    #[id = "deck_a_mode"]
    deck_a_mode: IntParam,
    #[id = "deck_b_mode"]
    deck_b_mode: IntParam,
    #[id = "rings"]
    rings: BoolParam,
    #[id = "ring_opacity"]
    ring_opacity: FloatParam,
    #[id = "strobe"]
    strobe: BoolParam,
    #[id = "strobe_lockout"]
    strobe_lockout: BoolParam,
    #[id = "blackout"]
    blackout: BoolParam,
    #[id = "freeze"]
    freeze: BoolParam,
    #[id = "max_brightness"]
    max_brightness: FloatParam,
    #[id = "beat_sync"]
    beat_sync: BoolParam,
    #[id = "bar_sync"]
    bar_sync: BoolParam,
    #[id = "demo_mode"]
    demo_mode: BoolParam,
    #[id = "show_gpu_palette"]
    show_gpu_palette: BoolParam,
    #[id = "active_shader"]
    active_shader: IntParam,
    #[id = "palette_saturation"]
    palette_saturation: FloatParam,
    #[id = "palette_brightness"]
    palette_brightness: FloatParam,
    #[id = "grid_density"]
    grid_density: FloatParam,
    #[id = "grid_diamond"]
    grid_diamond: FloatParam,
    #[id = "grid_line_width"]
    grid_line_width: FloatParam,
    #[id = "grid_shape_mix"]
    grid_shape_mix: FloatParam,
    #[id = "flash"]
    flash: FloatParam,
    #[id = "reset"]
    reset: FloatParam,
    #[id = "cue_warmup"]
    cue_warmup: FloatParam,
    #[id = "cue_drop"]
    cue_drop: FloatParam,
    #[id = "cue_tunnel"]
    cue_tunnel: FloatParam,
    #[id = "cue_burst"]
    cue_burst: FloatParam,
    #[id = "cue_wash"]
    cue_wash: FloatParam,
    #[id = "cue_panic"]
    cue_panic: FloatParam,
}

#[derive(Clone, Copy)]
struct ParameterCache {
    crossfade: f32,
    bpm: f32,
    speed: f32,
    intensity: f32,
    feedback: f32,
    depth: f32,
    palette: f32,
    deck_a_mode: i32,
    deck_b_mode: i32,
    rings: bool,
    ring_opacity: f32,
    strobe: bool,
    strobe_lockout: bool,
    blackout: bool,
    freeze: bool,
    max_brightness: f32,
    beat_sync: bool,
    bar_sync: bool,
    demo_mode: bool,
    show_gpu_palette: bool,
    active_shader: i32,
    palette_saturation: f32,
    palette_brightness: f32,
    grid_density: f32,
    grid_diamond: f32,
    grid_line_width: f32,
    grid_shape_mix: f32,
    flash: f32,
    reset: f32,
    cue_warmup: f32,
    cue_drop: f32,
    cue_tunnel: f32,
    cue_burst: f32,
    cue_wash: f32,
    cue_panic: f32,
}

struct OscSender {
    socket: Option<UdpSocket>,
    target: String,
}

impl Default for BevyoscVst {
    fn default() -> Self {
        let params = Arc::new(BevyoscParams::default());

        Self {
            cache: ParameterCache::from_params(&params),
            sender: OscSender::new(),
            params,
            sent_initial_state: false,
        }
    }
}

impl Default for BevyoscParams {
    fn default() -> Self {
        Self {
            crossfade: float_param("Crossfade", 0.5, 0.0, 1.0),
            bpm: float_param("BPM", 124.0, 40.0, 240.0),
            speed: float_param("Speed", 1.0, 0.1, 3.0),
            intensity: float_param("Intensity", 0.82, 0.05, 1.5),
            feedback: float_param("Trails", 0.35, 0.0, 1.0),
            depth: float_param("Depth", 0.0, 0.0, 1.0),
            palette: float_param("Palette", 0.0, 0.0, 1.0),
            deck_a_mode: IntParam::new("Deck A Mode", 0, IntRange::Linear { min: 0, max: 9 }),
            deck_b_mode: IntParam::new("Deck B Mode", 1, IntRange::Linear { min: 0, max: 9 }),
            rings: BoolParam::new("Rings", true),
            ring_opacity: float_param("Ring Opacity", 1.0, 0.0, 1.0),
            strobe: BoolParam::new("Strobe", false),
            strobe_lockout: BoolParam::new("Strobe Lockout", false),
            blackout: BoolParam::new("Blackout", false),
            freeze: BoolParam::new("Freeze", false),
            max_brightness: float_param("Max Brightness", 0.9, 0.1, 1.0),
            beat_sync: BoolParam::new("Beat Sync", true),
            bar_sync: BoolParam::new("Bar Sync", false),
            demo_mode: BoolParam::new("Demo Mode", false),
            show_gpu_palette: BoolParam::new("Show GPU Palette", false),
            active_shader: IntParam::new("Active Shader", 0, IntRange::Linear { min: 0, max: 9 }),
            palette_saturation: float_param("Palette Saturation", 1.0, 0.0, 1.0),
            palette_brightness: float_param("Palette Brightness", 1.0, 0.0, 1.0),
            grid_density: float_param("Grid Density", 0.5, 0.0, 1.0),
            grid_diamond: float_param("Grid Diamond", 0.5, 0.0, 1.0),
            grid_line_width: float_param("Grid Line Width", 0.5, 0.0, 1.0),
            grid_shape_mix: float_param("Grid Shape Mix", 0.5, 0.0, 1.0),
            flash: trigger_param("Flash"),
            reset: trigger_param("Reset"),
            cue_warmup: trigger_param("Cue Warmup"),
            cue_drop: trigger_param("Cue Drop"),
            cue_tunnel: trigger_param("Cue Tunnel"),
            cue_burst: trigger_param("Cue Burst"),
            cue_wash: trigger_param("Cue Wash"),
            cue_panic: trigger_param("Cue Panic Dim"),
        }
    }
}

impl Plugin for BevyoscVst {
    const NAME: &'static str = "bevyosc VJ Bridge";
    const VENDOR: &'static str = "bevyosc";
    const URL: &'static str = "https://localhost";
    const EMAIL: &'static str = "vj@localhost";
    const VERSION: &'static str = env!("CARGO_PKG_VERSION");
    const AUDIO_IO_LAYOUTS: &'static [AudioIOLayout] = &[AudioIOLayout {
        main_input_channels: NonZeroU32::new(2),
        main_output_channels: NonZeroU32::new(2),
        aux_input_ports: &[],
        aux_output_ports: &[],
        names: PortNames::const_default(),
    }];
    const MIDI_INPUT: MidiConfig = MidiConfig::None;
    const MIDI_OUTPUT: MidiConfig = MidiConfig::None;
    const SAMPLE_ACCURATE_AUTOMATION: bool = false;

    type SysExMessage = ();
    type BackgroundTask = ();

    fn params(&self) -> Arc<dyn Params> {
        self.params.clone()
    }

    fn process(
        &mut self,
        _buffer: &mut Buffer,
        _aux: &mut AuxiliaryBuffers,
        _context: &mut impl ProcessContext<Self>,
    ) -> ProcessStatus {
        let next = ParameterCache::from_params(&self.params);

        if !self.sent_initial_state {
            self.send_full_state(next);
            self.sent_initial_state = true;
        } else {
            self.send_changed_controls(self.cache, next);
        }

        self.send_trigger_edges(self.cache, next);
        self.cache = next;

        ProcessStatus::Normal
    }
}

impl Vst3Plugin for BevyoscVst {
    const VST3_CLASS_ID: [u8; 16] = *b"BevyoscVJBridge!";
    const VST3_SUBCATEGORIES: &'static [Vst3SubCategory] =
        &[Vst3SubCategory::Fx, Vst3SubCategory::Tools];
}

impl BevyoscVst {
    fn send_full_state(&self, next: ParameterCache) {
        self.sender.send_f32("crossfade", next.crossfade);
        self.sender.send_f32("bpm", next.bpm);
        self.sender.send_f32("speed", next.speed);
        self.sender.send_f32("intensity", next.intensity);
        self.sender.send_f32("feedback", next.feedback);
        self.sender.send_f32("depth", next.depth);
        self.sender.send_f32("palette", next.palette);
        self.sender.send_i32("deck_a_mode", next.deck_a_mode);
        self.sender.send_i32("deck_b_mode", next.deck_b_mode);
        self.sender.send_bool("rings", next.rings);
        self.sender.send_f32("ring_opacity", next.ring_opacity);
        self.sender.send_bool("strobe", next.strobe);
        self.sender.send_bool("strobe_lockout", next.strobe_lockout);
        self.sender.send_bool("blackout", next.blackout);
        self.sender.send_bool("freeze", next.freeze);
        self.sender.send_f32("max_brightness", next.max_brightness);
        self.sender.send_bool("beat_sync", next.beat_sync);
        self.sender.send_bool("bar_sync", next.bar_sync);
        self.sender.send_bool("demo_mode", next.demo_mode);
        self.sender
            .send_bool("show_gpu_palette", next.show_gpu_palette);
        self.sender.send_i32("active_shader", next.active_shader);
        self.sender
            .send_f32("palette_saturation", next.palette_saturation);
        self.sender
            .send_f32("palette_brightness", next.palette_brightness);
        self.sender.send_f32("grid_density", next.grid_density);
        self.sender.send_f32("grid_diamond", next.grid_diamond);
        self.sender
            .send_f32("grid_line_width", next.grid_line_width);
        self.sender.send_f32("grid_shape_mix", next.grid_shape_mix);
    }

    fn send_changed_controls(&self, previous: ParameterCache, next: ParameterCache) {
        if changed(previous.crossfade, next.crossfade) {
            self.sender.send_f32("crossfade", next.crossfade);
        }
        if changed(previous.bpm, next.bpm) {
            self.sender.send_f32("bpm", next.bpm);
        }
        if changed(previous.speed, next.speed) {
            self.sender.send_f32("speed", next.speed);
        }
        if changed(previous.intensity, next.intensity) {
            self.sender.send_f32("intensity", next.intensity);
        }
        if changed(previous.feedback, next.feedback) {
            self.sender.send_f32("feedback", next.feedback);
        }
        if changed(previous.depth, next.depth) {
            self.sender.send_f32("depth", next.depth);
        }
        if changed(previous.palette, next.palette) {
            self.sender.send_f32("palette", next.palette);
        }
        if previous.deck_a_mode != next.deck_a_mode {
            self.sender.send_i32("deck_a_mode", next.deck_a_mode);
        }
        if previous.deck_b_mode != next.deck_b_mode {
            self.sender.send_i32("deck_b_mode", next.deck_b_mode);
        }
        if previous.rings != next.rings {
            self.sender.send_bool("rings", next.rings);
        }
        if changed(previous.ring_opacity, next.ring_opacity) {
            self.sender.send_f32("ring_opacity", next.ring_opacity);
        }
        if previous.strobe != next.strobe {
            self.sender.send_bool("strobe", next.strobe);
        }
        if previous.strobe_lockout != next.strobe_lockout {
            self.sender.send_bool("strobe_lockout", next.strobe_lockout);
        }
        if previous.blackout != next.blackout {
            self.sender.send_bool("blackout", next.blackout);
        }
        if previous.freeze != next.freeze {
            self.sender.send_bool("freeze", next.freeze);
        }
        if changed(previous.max_brightness, next.max_brightness) {
            self.sender.send_f32("max_brightness", next.max_brightness);
        }
        if previous.beat_sync != next.beat_sync {
            self.sender.send_bool("beat_sync", next.beat_sync);
        }
        if previous.bar_sync != next.bar_sync {
            self.sender.send_bool("bar_sync", next.bar_sync);
        }
        if previous.demo_mode != next.demo_mode {
            self.sender.send_bool("demo_mode", next.demo_mode);
        }
        if previous.show_gpu_palette != next.show_gpu_palette {
            self.sender
                .send_bool("show_gpu_palette", next.show_gpu_palette);
        }
        if previous.active_shader != next.active_shader {
            self.sender.send_i32("active_shader", next.active_shader);
        }
        if changed(previous.palette_saturation, next.palette_saturation) {
            self.sender
                .send_f32("palette_saturation", next.palette_saturation);
        }
        if changed(previous.palette_brightness, next.palette_brightness) {
            self.sender
                .send_f32("palette_brightness", next.palette_brightness);
        }
        if changed(previous.grid_density, next.grid_density) {
            self.sender.send_f32("grid_density", next.grid_density);
        }
        if changed(previous.grid_diamond, next.grid_diamond) {
            self.sender.send_f32("grid_diamond", next.grid_diamond);
        }
        if changed(previous.grid_line_width, next.grid_line_width) {
            self.sender
                .send_f32("grid_line_width", next.grid_line_width);
        }
        if changed(previous.grid_shape_mix, next.grid_shape_mix) {
            self.sender.send_f32("grid_shape_mix", next.grid_shape_mix);
        }
    }

    fn send_trigger_edges(&self, previous: ParameterCache, next: ParameterCache) {
        if rising_edge(previous.flash, next.flash) {
            self.sender.send_trigger("flash");
        }
        if rising_edge(previous.reset, next.reset) {
            self.sender.send_trigger("reset");
        }
        if rising_edge(previous.cue_warmup, next.cue_warmup) {
            self.sender.send_cue("warmup");
        }
        if rising_edge(previous.cue_drop, next.cue_drop) {
            self.sender.send_cue("drop");
        }
        if rising_edge(previous.cue_tunnel, next.cue_tunnel) {
            self.sender.send_cue("tunnel");
        }
        if rising_edge(previous.cue_burst, next.cue_burst) {
            self.sender.send_cue("burst");
        }
        if rising_edge(previous.cue_wash, next.cue_wash) {
            self.sender.send_cue("wash");
        }
        if rising_edge(previous.cue_panic, next.cue_panic) {
            self.sender.send_cue("panic");
        }
    }
}

impl ParameterCache {
    fn from_params(params: &BevyoscParams) -> Self {
        Self {
            crossfade: params.crossfade.value(),
            bpm: params.bpm.value(),
            speed: params.speed.value(),
            intensity: params.intensity.value(),
            feedback: params.feedback.value(),
            depth: params.depth.value(),
            palette: params.palette.value(),
            deck_a_mode: params.deck_a_mode.value(),
            deck_b_mode: params.deck_b_mode.value(),
            rings: params.rings.value(),
            ring_opacity: params.ring_opacity.value(),
            strobe: params.strobe.value(),
            strobe_lockout: params.strobe_lockout.value(),
            blackout: params.blackout.value(),
            freeze: params.freeze.value(),
            max_brightness: params.max_brightness.value(),
            beat_sync: params.beat_sync.value(),
            bar_sync: params.bar_sync.value(),
            demo_mode: params.demo_mode.value(),
            show_gpu_palette: params.show_gpu_palette.value(),
            active_shader: params.active_shader.value(),
            palette_saturation: params.palette_saturation.value(),
            palette_brightness: params.palette_brightness.value(),
            grid_density: params.grid_density.value(),
            grid_diamond: params.grid_diamond.value(),
            grid_line_width: params.grid_line_width.value(),
            grid_shape_mix: params.grid_shape_mix.value(),
            flash: params.flash.value(),
            reset: params.reset.value(),
            cue_warmup: params.cue_warmup.value(),
            cue_drop: params.cue_drop.value(),
            cue_tunnel: params.cue_tunnel.value(),
            cue_burst: params.cue_burst.value(),
            cue_wash: params.cue_wash.value(),
            cue_panic: params.cue_panic.value(),
        }
    }
}

impl OscSender {
    fn new() -> Self {
        let target =
            std::env::var("BEVYOSC_VST_TARGET").unwrap_or_else(|_| DEFAULT_TARGET.to_string());
        let socket = UdpSocket::bind("127.0.0.1:0").ok();
        if let Some(socket) = &socket {
            let _ = socket.set_nonblocking(true);
        }

        Self { socket, target }
    }

    fn send_f32(&self, name: &str, value: f32) {
        self.send(
            &format!("/bevyosc/vst/control/{name}"),
            OscType::Float(value),
        );
    }

    fn send_i32(&self, name: &str, value: i32) {
        self.send(&format!("/bevyosc/vst/control/{name}"), OscType::Int(value));
    }

    fn send_bool(&self, name: &str, value: bool) {
        self.send(
            &format!("/bevyosc/vst/control/{name}"),
            OscType::Int(if value { 1 } else { 0 }),
        );
    }

    fn send_trigger(&self, name: &str) {
        self.send(&format!("/bevyosc/vst/trigger/{name}"), OscType::Int(1));
    }

    fn send_cue(&self, name: &str) {
        self.send(&format!("/bevyosc/vst/cue/{name}"), OscType::Int(1));
    }

    fn send(&self, address: &str, arg: OscType) {
        let Some(socket) = &self.socket else {
            return;
        };
        let packet = OscPacket::Message(OscMessage {
            addr: address.to_string(),
            args: vec![arg],
        });
        if let Ok(bytes) = encoder::encode(&packet) {
            let _ = socket.send_to(&bytes, &self.target);
        }
    }
}

fn float_param(name: &str, default: f32, min: f32, max: f32) -> FloatParam {
    FloatParam::new(name, default, FloatRange::Linear { min, max })
        .with_smoother(SmoothingStyle::None)
}

fn trigger_param(name: &str) -> FloatParam {
    FloatParam::new(name, 0.0, FloatRange::Linear { min: 0.0, max: 1.0 })
        .with_smoother(SmoothingStyle::None)
}

fn changed(previous: f32, next: f32) -> bool {
    (previous - next).abs() > 0.0005
}

fn rising_edge(previous: f32, next: f32) -> bool {
    previous <= 0.5 && next > 0.5
}

nih_export_vst3!(BevyoscVst);

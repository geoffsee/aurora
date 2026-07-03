export const VISUAL_MODES = [
	"Beams",
	"Tunnel",
	"Burst",
	"Mirror",
	"Wash",
	"Strobe",
	"Swarm",
	"Orbit",
	"Pulse",
	"Spiral",
	"Ripple",
	"Shatter",
	"Flux",
	"Lattice",
	"Drift",
	"Storm",
	"Echo",
	"Vortex",
	"Fracture",
	"Nebula",
	"Prism",
	"Scanner",
	"Comet",
	"Bloom",
] as const;

export const SHADER_OPTIONS = [
	"Palette - Rehoboam (Ring)",
	"Palette - Spokes",
	"Palette - Rings",
	"Palette - Plasma (Warp)",
	"Grid (Tiles)",
	"Tunnel (Cyberpunk)",
	"Glitch (Y2K)",
	"Fluid (Ambient)",
	"Truchet (Geometric)",
	"Imported (Shadertoy)",
	"Bass Reactor",
	"High Spark Field",
	"Kick Rings",
	"Laser Lattice",
	"Strobe Shards",
	"Vortex Bloom",
	"Crystal Core",
	"Bass Portal",
	"Mercury Lake",
	"Iridescent Veil",
	"Starweb",
	"Recursive Maw",
	"Inkbloom",
	"Scanlab Holo",
	"Lumen Coral",
	"Polaris Petals",
	"Aurora Curtains",
	"Bass Monolith",
	"Prism Tunnel",
	"Data Rain",
	"Solar Flare",
	"Topo Lines",
	"Glass Ribbons",
	"Gummy Wire Bear",
	"Fierce Walking Wolf",
	"Spectral Ghost",
] as const;

export const MAX_GPU_SHADER_INDEX = SHADER_OPTIONS.length - 1;

export const CUE_NAMES = [
	"warmup",
	"drop",
	"tunnel",
	"burst",
	"wash",
	"panic",
] as const;

export const CLOCK_LABELS: Record<string, string> = {
	link: "Link",
	midi: "MIDI",
	internal: "Internal",
};

export const PRESETS_KEY = "aurora.presets";
export const SESSION_STATE_KEY = "aurora.control-session";
export const MIDI_CC_BINDINGS_KEY = "aurora.midi-cc-bindings";
export const AUTOMATION_TRIGGERS_KEY = "aurora.automation-triggers";

export const MIDI_CC_PARAM_LABELS: Record<string, string> = {
	crossfade: "Crossfade",
	bpm: "BPM",
	speed: "Speed",
	intensity: "Intensity",
	feedback: "Trails",
	depth: "3D Lines",
	palette: "Color",
	paletteSaturation: "GPU Sat",
	paletteBrightness: "GPU Bright",
	gridDensity: "Grid Density",
	gridDiamond: "Grid Diamond",
	gridLineWidth: "Grid Lines",
	gridShapeMix: "Grid Shape",
	deckAMode: "Deck A Mode",
	deckBMode: "Deck B Mode",
	ringOpacity: "Ring Opc",
	maxBrightness: "Max Bright",
};

export const MIDI_CC_INTEGER_PARAMS = new Set(["deckAMode", "deckBMode"]);

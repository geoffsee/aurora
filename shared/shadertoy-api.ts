export type ShadertoyMeta = {
	id: string;
	name: string;
	username: string;
};

const SHADERTOY_ID_RE = /^[A-Za-z0-9]{1,16}$/;

export const extractShadertoyId = (input: string): string | null => {
	const trimmed = input.trim();
	if (SHADERTOY_ID_RE.test(trimmed)) return trimmed;
	const match = trimmed.match(/\/view\/([A-Za-z0-9]+)/);
	if (match && match[1] && SHADERTOY_ID_RE.test(match[1])) {
		return match[1];
	}
	return null;
};

const sanitize = (s: unknown): string =>
	String(s ?? "")
		.replace(/[\x00-\x1f<>]/g, "")
		.slice(0, 200);

export const fetchShadertoyShader = async (id: string, apiKey: string) => {
	const apiUrl = `https://www.shadertoy.com/api/v1/shaders/${id}?key=${encodeURIComponent(apiKey)}`;
	const response = await fetch(apiUrl);
	if (!response.ok) {
		throw new Error(`Shadertoy API HTTP ${response.status}`);
	}
	const json = (await response.json()) as Record<string, unknown>;
	if (typeof json.Error === "string") {
		throw new Error(`Shadertoy API error: ${json.Error}`);
	}
	const shader = json.Shader as Record<string, unknown> | undefined;
	if (!shader) {
		throw new Error("Shadertoy API response missing `Shader` field");
	}
	return shader;
};

export type ParsedShadertoyImagePass = {
	id: string;
	userGlsl: string;
	meta: ShadertoyMeta;
};

export const parseShadertoyImagePass = (
	shader: Record<string, unknown>,
	id: string,
): ParsedShadertoyImagePass | { ok: false; error: string } => {
	const info = (shader.info ?? {}) as Record<string, unknown>;
	const renderpass = (shader.renderpass ?? []) as Array<Record<string, unknown>>;
	if (!Array.isArray(renderpass) || renderpass.length === 0) {
		return { ok: false, error: "Shadertoy response has no render passes" };
	}

	const imagePass = renderpass.find((p) => p.type === "image");
	if (!imagePass) {
		return { ok: false, error: "Shader has no Image render pass" };
	}
	const extraPasses = renderpass.filter((p) => p.type !== "image");
	if (extraPasses.length > 0) {
		const passNames = extraPasses
			.map((p) => sanitize(p.name ?? p.type))
			.join(", ");
		return {
			ok: false,
			error: `Multi-pass shaders not supported in v1. This shader has additional passes: ${passNames}`,
		};
	}

	const userGlsl = typeof imagePass.code === "string" ? imagePass.code : "";
	if (!userGlsl) {
		return { ok: false, error: "Image pass has no source code" };
	}

	return {
		id,
		userGlsl,
		meta: {
			id,
			name: sanitize(info.name ?? id),
			username: sanitize(info.username ?? "unknown"),
		},
	};
};

export const SHADERTOY_KEY_RE = /^[A-Za-z0-9]{8,128}$/;

export function validateShadertoyKey(key: string): boolean {
	return SHADERTOY_KEY_RE.test(key.trim());
}

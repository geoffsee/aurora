export const clamp = (
	value: unknown,
	min: number,
	max: number,
	fallback = min,
): number => {
	const number = Number(value);
	return Math.max(
		min,
		Math.min(max, Number.isFinite(number) ? number : fallback),
	);
};

export const clamp01 = (value: unknown) => clamp(value, 0, 1, 0);

export const clampInt = (
	value: unknown,
	min: number,
	max: number,
	fallback = min,
) => Math.floor(clamp(value, min, max, fallback));

export const average = (items: number[]) =>
	items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : 0;

export const smoothSignal = (
	current: number,
	target: number,
	dtMs: number,
	attackMs: number,
	releaseMs: number,
) => {
	const timeMs = target > current ? attackMs : releaseMs;
	const blend = 1 - Math.exp(-dtMs / Math.max(1, timeMs));
	return current + (target - current) * blend;
};

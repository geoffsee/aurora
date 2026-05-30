export type StateLogEntry = {
	ts: number;
	diff: Record<string, unknown>;
};

/**
 * Compute a shallow diff between two plain objects. Nested object values are
 * compared by shallow-equality of their own properties. Returns null when
 * nothing changed.
 */
export function diffObjects(
	prev: Record<string, unknown>,
	next: Record<string, unknown>,
): Record<string, unknown> | null {
	const diff: Record<string, unknown> = {};
	let changed = false;
	for (const key of Object.keys(next)) {
		const nextVal = next[key];
		const prevVal = prev[key];
		if (
			typeof nextVal === "object" &&
			nextVal !== null &&
			typeof prevVal === "object" &&
			prevVal !== null
		) {
			const pm = prevVal as Record<string, unknown>;
			const nm = nextVal as Record<string, unknown>;
			if (Object.keys(nm).some((k) => pm[k] !== nm[k])) {
				diff[key] = nextVal;
				changed = true;
			}
		} else if (prevVal !== nextVal) {
			diff[key] = nextVal;
			changed = true;
		}
	}
	return changed ? diff : null;
}

/**
 * Fixed-capacity ring buffer of StateLogEntry values. Oldest entry is evicted
 * when the buffer is full.
 */
export function makeStateLog(capacity: number): {
	record(prev: Record<string, unknown> | null, next: Record<string, unknown>): void;
	toArray(): StateLogEntry[];
	readonly size: number;
} {
	const entries: StateLogEntry[] = [];

	return {
		record(prev, next) {
			const diff =
				prev === null ? { ...next } : diffObjects(prev, next);
			if (diff === null) return;
			if (entries.length >= capacity) entries.shift();
			entries.push({ ts: Date.now(), diff });
		},
		toArray() {
			return entries.slice();
		},
		get size() {
			return entries.length;
		},
	};
}

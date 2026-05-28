// Canonical exponential backoff formula shared with controls.html and index.html.
// HTML files inline this logic — keep them in sync when changing the formula here.
export function nextReconnectDelay(current: number, max = 16000): number {
	return Math.min(current * 2, max);
}

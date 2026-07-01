export type BannerType = "error" | "warn" | "disconnect";

export type ErrorBanner = {
	id: number;
	description: string;
	type: BannerType;
	createdAt: number;
};

let nextBannerId = 1;

export function createBanner(
	description: string,
	type: BannerType = "error",
): ErrorBanner {
	return {
		id: nextBannerId++,
		description,
		type,
		createdAt: Date.now(),
	};
}

export function pushBanner(
	banners: ErrorBanner[],
	description: string,
	type: BannerType = "error",
	max = 10,
): ErrorBanner[] {
	const next = [...banners, createBanner(description, type)];
	return next.length > max ? next.slice(next.length - max) : next;
}

export function removeBannersByType(
	banners: ErrorBanner[],
	type: BannerType,
): ErrorBanner[] {
	return banners.filter((b) => b.type !== type);
}

export function dismissBanner(
	banners: ErrorBanner[],
	id: number,
): ErrorBanner[] {
	return banners.filter((b) => b.id !== id);
}

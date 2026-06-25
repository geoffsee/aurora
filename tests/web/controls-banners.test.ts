import { describe, expect, test } from "vitest";
import {
	dismissBanner,
	pushBanner,
	removeBannersByType,
} from "../../web/controls/lib/banners.ts";

describe("controls banners", () => {
	test("pushBanner caps at 10 and evicts the oldest", () => {
		let banners = [] as ReturnType<typeof pushBanner>;
		for (let i = 0; i < 11; i++) {
			banners = pushBanner(banners, `Error ${i}`);
		}
		expect(banners).toHaveLength(10);
		expect(banners[0]?.description).toBe("Error 1");
	});

	test("removeBannersByType drops disconnect banners on reconnect", () => {
		let banners = pushBanner([], "Bridge WebSocket disconnected — reconnecting…", "disconnect");
		banners = pushBanner(banners, "Other error");
		banners = removeBannersByType(banners, "disconnect");
		expect(banners).toHaveLength(1);
		expect(banners[0]?.description).toBe("Other error");
	});

	test("dismissBanner removes by id", () => {
		let banners = pushBanner([], "one");
		const id = banners[0]!.id;
		banners = dismissBanner(banners, id);
		expect(banners).toHaveLength(0);
	});
});

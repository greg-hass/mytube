import { expect, test, type Page } from "@playwright/test";

const syncSnapshot = {
	subscriptions: [
		{
			id: "UC1234567890123456789012",
			title: "Test Channel",
			thumbnail: "",
			description: "A deterministic browser-test channel",
			addedAt: Date.parse("2026-07-16T12:00:00.000Z"),
		},
	],
	redirects: {},
	subscriptionTombstones: [],
	settings: {},
	watchedVideos: [],
	syncRevision: 1,
};

const videosSnapshot = {
	videos: [
		{
			id: "video123456",
			title: "Browser regression video",
			description: "A deterministic browser-test video",
			thumbnail: "",
			channelId: "UC1234567890123456789012",
			channelTitle: "Test Channel",
			publishedAt: "2026-07-17T09:00:00.000Z",
		},
	],
	lastUpdated: "2026-07-17T09:05:00.000Z",
	totalChannels: 1,
	totalVideos: 1,
};

const statusSnapshot = {
	state: "idle",
	current: 1,
	total: 1,
	videos: 1,
	errors: 0,
	startedAt: null,
	completedAt: "2026-07-17T09:05:00.000Z",
	lastUpdated: "2026-07-17T09:05:00.000Z",
};

async function mockHealthyApi(page: Page) {
	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const path = new URL(request.url()).pathname;

		if (path === "/api/sync") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { etag: '"1"' },
				body: JSON.stringify(syncSnapshot),
			});
			return;
		}
		if (path === "/api/videos/status") {
			await route.fulfill({ json: statusSnapshot });
			return;
		}
		if (path === "/api/videos") {
			await route.fulfill({ json: videosSnapshot });
			return;
		}

		await route.fulfill({ status: 200, json: { success: true } });
	});
}

test("mobile Add remains clickable and production omits query devtools", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockHealthyApi(page);
	await page.goto("/");

	const tabBar = page.getByTestId("floating-tab-bar");
	await expect(tabBar).toBeVisible();
	await expect(
		page.getByRole("button", { name: /open tanstack query devtools/i }),
	).toHaveCount(0);

	await tabBar.getByRole("button", { name: "Add", exact: true }).click();
	await expect(page.getByText("Add Channel", { exact: true })).toBeVisible();
});

test("mobile Latest stays in a loading state until videos arrive", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.route("**/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname;

		if (path === "/api/sync") {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: { etag: '"1"' },
				body: JSON.stringify(syncSnapshot),
			});
			return;
		}
		if (path === "/api/videos/status") {
			await route.fulfill({ json: statusSnapshot });
			return;
		}
		if (path === "/api/videos") {
			await new Promise((resolve) => setTimeout(resolve, 750));
			await route.fulfill({ json: videosSnapshot });
			return;
		}

		await route.fulfill({ status: 200, json: { success: true } });
	});

	await page.goto("/");

	await expect(page.getByTestId("latest-videos-loading")).toBeVisible();
	await expect(page.getByText("No videos found")).toHaveCount(0);
	await expect(page.getByText("Browser regression video")).toBeVisible();
});

test("mobile channel search explains rate limiting without blaming connectivity", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await mockHealthyApi(page);
	await page.route("**/api/channel-search?*", async (route) => {
		await route.fulfill({
			status: 429,
			contentType: "application/json",
			body: JSON.stringify({ error: "Too many requests" }),
		});
	});
	await page.goto("/");

	await page
		.getByTestId("floating-tab-bar")
		.getByRole("button", { name: "Add", exact: true })
		.click();
	await page
		.getByLabel("YouTube Channel")
		.fill("Northern Ireland traveller");

	await expect(page.getByText("Too many searches")).toBeVisible();
	await expect(page.getByText("Wait a minute, then try again.")).toBeVisible();
	await expect(page.getByText(/check your connection/i)).toHaveCount(0);
});

test("mobile video cards keep thumbnails clear and show clockwise watch progress", async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.addInitScript(() => {
		localStorage.setItem(
			"video-playback-progress",
			JSON.stringify({
				video123456: {
					currentTime: 30,
					duration: 120,
					updatedAt: Date.now(),
				},
			}),
		);
	});
	await mockHealthyApi(page);
	await page.goto("/");

	await expect(page.getByText("Browser regression video")).toBeVisible();
	await expect(
		page.getByRole("checkbox", { name: "Select Browser regression video" }),
	).toHaveCount(0);
	await expect(page.getByTestId("video-progress-indicator")).toHaveClass(
		/orange/,
	);
	await expect(page.getByTestId("video-progress-ring")).toHaveAttribute(
		"stroke-dashoffset",
		"75",
	);

	await page.getByRole("button", { name: "Mark video as watched" }).click();
	await expect(page.getByTestId("video-watched-indicator")).toBeVisible();
	await expect(page.getByTestId("video-progress-indicator")).toHaveCount(0);
});

test("an invalid stored token shows recovery instead of an endless loader", async ({
	page,
}) => {
	await page.addInitScript(() => {
		localStorage.setItem("mytube.serverApiToken", "stale-test-token");
	});
	await page.route("**/api/**", async (route) => {
		await route.fulfill({
			status: 401,
			contentType: "application/json",
			body: JSON.stringify({ error: "Unauthorized" }),
		});
	});
	await page.goto("/");

	await expect(page.getByTestId("auth-required")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Connect to your MyTube server" }),
	).toBeVisible();
	await expect(page.getByTestId("dashboard-loading")).toHaveCount(0);
});

test("authenticated desktop feed supports favorites and Settings workflows", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await mockHealthyApi(page);
	await page.goto("/");

	await expect(page.getByText("Browser regression video")).toBeVisible();
	await page.getByRole("button", { name: "Refresh feeds" }).click();
	await expect(
		page.getByText("Feed refresh started — pulling new videos..."),
	).toBeVisible();
	await page.getByRole("button", { name: "Add video to favorites" }).click();
	await page
		.getByTestId("floating-tab-bar")
		.getByRole("button", { name: "Faves", exact: true })
		.click();

	await expect(page.getByText("Browser regression video")).toBeVisible();

	await page.getByRole("button", { name: "Settings", exact: true }).click();
	await expect(page.getByText("Settings", { exact: true })).toBeVisible();
});

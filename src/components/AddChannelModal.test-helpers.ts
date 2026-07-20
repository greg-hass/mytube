/**
 * Shared test fixtures and helpers for AddChannelModal — the inline
 * fetch mock in beforeEach is large enough that inlining it pushes
 * every test over the high-fan-out lens threshold. Extracting it and
 * the common workflow helpers keeps test bodies readable as a linear
 * list of user-visible assertions.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import type { YouTubeChannel } from "../types/youtube";
import { AddChannelModal } from "./AddChannelModal";

export const DEFAULT_CHANNELS = [
	{
		id: "UC1234567890123456789012",
		title: "Linux Tech Channel",
		description: "Linux tutorials and reviews",
		thumbnail: "https://example.com/channel.jpg",
	},
	{
		id: "UC2222222222222222222222",
		title: "Kernel Notes",
		description: "Deep dives into operating systems",
		thumbnail: "https://example.com/kernel.jpg",
	},
];

export function buildDefaultFetchMock() {
	return vi.fn((url: string | URL | Request) => {
		const requestUrl = String(url);
		if (requestUrl.startsWith("/api/channel-search")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ results: DEFAULT_CHANNELS }),
			});
		}
		return Promise.resolve({ ok: false, status: 404 });
	});
}

export function buildCustomFetchMock(results: YouTubeChannel[]) {
	return vi.fn((url: string | URL | Request) => {
		const requestUrl = String(url);
		if (requestUrl.startsWith("/api/channel-search")) {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ results }),
			});
		}
		return Promise.resolve({ ok: false, status: 404 });
	});
}

export function installDefaultFetchMock() {
	vi.stubGlobal("fetch", buildDefaultFetchMock());
}

export function installCustomFetchMock(results: YouTubeChannel[]) {
	vi.stubGlobal("fetch", buildCustomFetchMock(results));
}

export function install401FetchMock() {
	vi.stubGlobal("fetch", build401FetchMock());
}

function build401FetchMock() {
	return vi.fn(() => Promise.resolve({ ok: false, status: 401 }));
}

// ── Workflow helpers ──────────────────────────────────────────────────────

export function assertInitialState(container: HTMLElement) {
	expect(screen.getByAltText("MyTube")).toBeInTheDocument();
	expect(screen.getByText("Add Channel")).toBeInTheDocument();
	expect(container.querySelector(".bg-black\\/60")).toBeNull();
	expect(container.querySelector(".shadow-2xl")).toBeNull();
	expect(screen.getByLabelText("YouTube Channel")).not.toHaveFocus();
}

export async function searchFor(query: string) {
	fireEvent.change(screen.getByLabelText("YouTube Channel"), {
		target: { value: query },
	});
	await waitFor(() => {
		expect(fetch).toHaveBeenCalledWith(
			`/api/channel-search?q=${encodeURIComponent(query)}`,
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});
}

export function clickPreview(channelName: string) {
	fireEvent.click(
		screen.getByRole("button", {
			name: (accessibleName: string) =>
				accessibleName.toLowerCase().includes(channelName.toLowerCase()),
		}),
	);
}

export function assertPreviewCard(channelName: string) {
	expect(screen.getByText("Channel Preview")).toBeInTheDocument();
	const card = screen.getByText("Channel Preview").closest("section");
	expect(card).not.toBeNull();
	expect(
		within(card as HTMLElement).getByText(channelName),
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
}

export async function clickAddAndAssert(
	onAdd: ReturnType<typeof vi.fn>,
	channel: Partial<YouTubeChannel>,
) {
	fireEvent.click(screen.getByRole("button", { name: "Add" }));
	await waitFor(() => {
		expect(onAdd).toHaveBeenCalledWith(expect.objectContaining(channel));
	});
}

export function assertPreviewDetailLines(
	subscriber: string,
	customUrl: string,
) {
	const card = screen.getByText("Channel Preview").closest("section");
	expect(card).not.toBeNull();
	expect(within(card as HTMLElement).getByText(subscriber)).toBeInTheDocument();
	expect(within(card as HTMLElement).getByText(customUrl)).toBeInTheDocument();
}

export async function assertPreviewWorkflow(
	onAdd: ReturnType<typeof vi.fn>,
	onClose: ReturnType<typeof vi.fn>,
	container: HTMLElement,
	query: string,
	previewName: string,
	channel: Partial<YouTubeChannel>,
) {
	assertInitialState(container);
	await searchFor(query);
	clickPreview(previewName);
	assertPreviewCard(channel.title as string);
	await clickAddAndAssert(onAdd, channel);
	expect(onClose).not.toHaveBeenCalled();
	expect(screen.queryByText("Channel Preview")).not.toBeInTheDocument();
}

export async function assertAuthErrorWorkflow(
	query: string,
	consoleError: ReturnType<typeof vi.fn>,
) {
	await searchFor(query);
	expect(
		await screen.findByText(/authentication required/i),
	).toBeInTheDocument();
	expect(
		await screen.findByText(/set your server api token in settings/i),
	).toBeInTheDocument();
	expect(screen.queryByText(/no channels found/i)).not.toBeInTheDocument();
	expect(consoleError).not.toHaveBeenCalled();
}


// ── Test registration ─────────────────────────────────────────────────────

export function registerAddChannelModalTests() {
	beforeEach(installDefaultFetchMock);
	afterEach(() => {
		vi.unstubAllGlobals();
	});
	registerPreviewWorkflowTest();
	registerExistingSubscriptionFilterTest();
	registerNaturalLanguageSearchTest();
	registerAuthErrorTest();
	registerFormatsDisclosureTest();
}

function renderModal(props: {
	onClose?: () => void;
	onAdd?: (channel: YouTubeChannel) => void | Promise<void>;
	existingSubscriptions?: YouTubeChannel[];
} = {}) {
	return render(
		createElement(AddChannelModal, {
			isOpen: true,
			onClose: props.onClose ?? vi.fn(),
			onAdd: props.onAdd ?? vi.fn(),
			existingSubscriptions: props.existingSubscriptions,
		}),
	);
}

function registerPreviewWorkflowTest() {
	it("shows a preview before adding a searched channel", async () => {
		const onAdd = vi.fn();
		const onClose = vi.fn();
		const { container } = renderModal({ onAdd, onClose });
		await assertPreviewWorkflow(
			onAdd,
			onClose,
			container,
			"the linux tech channel",
			"linux tech channel",
			{
				id: "UC1234567890123456789012",
				title: "Linux Tech Channel",
			},
		);
	});
}

function registerExistingSubscriptionFilterTest() {
	it("filters existing subscriptions out of keyword search results", async () => {
		renderModal({
			existingSubscriptions: [
				{
					id: "UC1234567890123456789012",
					title: "Linux Tech Channel",
					description: "",
					thumbnail: "",
				},
			],
		});
		await searchFor("linux tech");
		expect(screen.queryByText("Linux Tech Channel")).not.toBeInTheDocument();
	});
}

function registerNaturalLanguageSearchTest() {
	it("sends natural-language search phrases to the backend unchanged", async () => {
		installCustomFetchMock([
			{
				id: "UC3333333333333333333333",
				title: "Workshop Companion",
				description: "Woodworking plans, tools, and shop projects",
				thumbnail: "https://example.com/workshop.jpg",
				customUrl: "/@workshopcompanion",
				subscriberCount: "250000",
			},
		]);
		renderModal();
		await searchFor("the best woodworking channels");
		expect(await screen.findByText("Workshop Companion")).toBeInTheDocument();
		expect(fetch).toHaveBeenCalledTimes(1);
		clickPreview("workshop companion");
		assertPreviewDetailLines("250,000 subscribers", "/@workshopcompanion");
	});
}

function registerAuthErrorTest() {
	it('surfaces an authentication-required message on 401 instead of "no channels found"', async () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		install401FetchMock();
		renderModal();
		await assertAuthErrorWorkflow("the best woodworking channels", consoleError);
	});
}

function registerFormatsDisclosureTest() {
	it("keeps the supported formats card collapsed until the toggle is tapped", () => {
		renderModal();

		const toggle = screen.getByRole("button", { name: "Supported formats" });
		expect(toggle).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText("Channel ID")).not.toBeInTheDocument();

		fireEvent.click(toggle);
		expect(toggle).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText("Channel ID")).toBeInTheDocument();
	});
}

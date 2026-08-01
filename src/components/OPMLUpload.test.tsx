import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OPMLUpload } from "./OPMLUpload";

const mockStorage = vi.hoisted(() => ({
	rawSubscriptions: [] as Array<{ id: string; title: string; addedAt: number }>,
	importSubscriptions: vi.fn(),
	isImporting: false,
}));

vi.mock("../hooks/useSubscriptionStorage", () => ({
	useSubscriptionStorage: () => mockStorage,
}));

const existingId = "UC1234567890123456789012";
const newId = "UCabcdefghijklmnopqrstuv";

const csv = [
	"Channel Id,Channel Url,Channel Title",
	`${existingId},http://www.youtube.com/channel/${existingId},Existing Channel`,
	`${newId},http://www.youtube.com/channel/${newId},New Channel`,
	`${newId},http://www.youtube.com/channel/${newId},Duplicate Channel`,
	"not-a-channel,not-a-channel,Broken Row",
].join("\n");

function createImportFile() {
	const file = new File([csv], "subscriptions.csv", { type: "text/csv" });
	Object.defineProperty(file, "text", { value: () => Promise.resolve(csv) });
	return file;
}

describe("OPMLUpload", () => {
	beforeEach(() => {
		mockStorage.rawSubscriptions = [
			{ id: existingId, title: "Existing Channel", addedAt: 1 },
		];
		mockStorage.importSubscriptions.mockReset();
		mockStorage.importSubscriptions.mockResolvedValue(undefined);
	});

	it("previews an import and leaves subscriptions untouched until confirmed", async () => {
		render(<OPMLUpload minimal showLabelOnMobile />);

		fireEvent.change(screen.getByLabelText("Import subscriptions file"), {
			target: { files: [createImportFile()] },
		});

		const review = await screen.findByTestId("subscription-import-review");
		expect(review).toHaveTextContent("1 new channel");
		expect(review).toHaveTextContent("1 already subscribed");
		expect(review).toHaveTextContent("1 duplicate entry skipped");
		expect(review).toHaveTextContent("1 invalid entry skipped");
		expect(review).toHaveTextContent("Nothing is added until you confirm");
		expect(mockStorage.importSubscriptions).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByTestId("subscription-import-review")).not.toBeInTheDocument();
		expect(mockStorage.importSubscriptions).not.toHaveBeenCalled();
	});

	it("imports only new unique channels after explicit confirmation", async () => {
		render(<OPMLUpload minimal showLabelOnMobile />);

		fireEvent.change(screen.getByLabelText("Import subscriptions file"), {
			target: { files: [createImportFile()] },
		});
		await screen.findByTestId("subscription-import-review");

		fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));

		await waitFor(() => {
			expect(mockStorage.importSubscriptions).toHaveBeenCalledWith([
				expect.objectContaining({ id: newId, title: "New Channel" }),
			]);
		});
		expect(await screen.findByRole("status")).toHaveTextContent(
			"1 new channel imported",
		);
	});
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServerAuthSetup } from "./ServerAuthSetup";

const authMocks = vi.hoisted(() => ({
	getServerApiToken: vi.fn(() => ""),
	setServerApiToken: vi.fn(),
	verifyServerApiToken: vi.fn(),
}));

vi.mock("../lib/api-auth", () => ({
	AuthError: class AuthError extends Error {
		constructor(message = "Server authentication required") {
			super(message);
			this.name = "AuthError";
		}
	},
	getServerApiToken: authMocks.getServerApiToken,
	setServerApiToken: authMocks.setServerApiToken,
	verifyServerApiToken: authMocks.verifyServerApiToken,
}));

describe("ServerAuthSetup", () => {
	beforeEach(() => {
		authMocks.getServerApiToken.mockReturnValue("");
		authMocks.setServerApiToken.mockClear();
		authMocks.verifyServerApiToken.mockReset();
	});

	it("verifies the entered token before completing authentication", async () => {
		const onAuthenticated = vi.fn();
		authMocks.verifyServerApiToken.mockResolvedValue(undefined);

		render(
			<ServerAuthSetup
				onAuthenticated={onAuthenticated}
				onOpenSettings={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Server API token"), {
			target: { value: "audit-token" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Connect to server" }));

		await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
		expect(authMocks.setServerApiToken).toHaveBeenCalledWith("audit-token");
		expect(authMocks.verifyServerApiToken).toHaveBeenCalledOnce();
	});

	it("explains when the server rejects the token", async () => {
		authMocks.verifyServerApiToken.mockRejectedValue(
			new Error("Server authentication required"),
		);

		render(
			<ServerAuthSetup
				onAuthenticated={vi.fn()}
				onOpenSettings={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Server API token"), {
			target: { value: "wrong-token" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Connect to server" }));

		expect(
			await screen.findByRole("alert"),
		).toHaveTextContent("Server authentication required");
	});
});

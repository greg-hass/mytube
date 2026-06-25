/**
 * useAddChannelHandlers — bundles the AddChannelModal's event handlers
 * (input change/keydown, preview select/dismiss/add, parsed-input add).
 * Lives in its own hook so the parent useAddChannelSearch stays focused
 * on state composition.
 */
import { useCallback, type RefObject } from "react";
import type { YouTubeChannel } from "../types/youtube";
import type { ParsedChannelInput } from "../lib/youtube-parser";
import { resolveChannelFromParsedInput } from "../lib/channel-input-resolver";

export interface UseAddChannelHandlersOptions {
	inputRef: RefObject<HTMLInputElement | null>;
	setInput: (value: string) => void;
	setPreviewChannel: (channel: YouTubeChannel | null) => void;
	previewChannel: YouTubeChannel | null;
	directReset: () => void;
	directChannelInfo: YouTubeChannel | null;
	parsedInput: ParsedChannelInput | null;
	actionClearError: () => void;
	actionSetError: (message: string) => void;
	actionMarkLoading: (value: { loading: boolean }) => void;
	actionAddChannel: (channel: YouTubeChannel) => Promise<void>;
}

export interface UseAddChannelHandlersResult {
	handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
	handleSelectPreviewChannel: (channel: YouTubeChannel) => void;
	handleDismissPreview: () => void;
	handleAddPreviewChannel: () => Promise<void>;
	handleAddParsedInput: () => Promise<void>;
}

export function useAddChannelHandlers(
	options: UseAddChannelHandlersOptions,
): UseAddChannelHandlersResult {
	const {
		inputRef,
		setInput,
		setPreviewChannel,
		previewChannel,
		directReset,
		directChannelInfo,
		parsedInput,
		actionClearError,
		actionSetError,
		actionMarkLoading,
		actionAddChannel,
	} = options;

	const createChannelFromParsedInput = useCallback(
		(): Promise<YouTubeChannel> => {
			if (!parsedInput) {
				throw new Error(
					"Search for a channel or enter a valid YouTube channel",
				);
			}
			return resolveChannelFromParsedInput(parsedInput, directChannelInfo);
		},
		[parsedInput, directChannelInfo],
	);

	const handleAddParsedInput = useCallback(async () => {
		try {
			const channelToAdd = await createChannelFromParsedInput();
			await actionAddChannel(channelToAdd);
		} catch (error) {
			console.error("Failed to prepare channel:", error);
			actionSetError(
				error instanceof Error
					? error.message
					: "Failed to add channel. Please try again.",
			);
			actionMarkLoading({ loading: false });
			throw error;
		}
	}, [createChannelFromParsedInput, actionAddChannel, actionSetError, actionMarkLoading]);

	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			setPreviewChannel(null);
			setInput(e.target.value);
		},
		[setPreviewChannel, setInput],
	);

	const handleSelectPreviewChannel = useCallback(
		(channel: YouTubeChannel) => {
			setPreviewChannel(channel);
			actionClearError();
		},
		[setPreviewChannel, actionClearError],
	);

	const handleDismissPreview = useCallback(() => {
		if (previewChannel) {
			setPreviewChannel(null);
			return;
		}
		directReset();
	}, [previewChannel, setPreviewChannel, directReset]);

	const handleAddPreviewChannel = useCallback(async () => {
		const channelToAdd = previewChannel ?? directChannelInfo;
		if (!channelToAdd) return;

		await actionAddChannel(channelToAdd);
		setPreviewChannel(null);
	}, [previewChannel, directChannelInfo, actionAddChannel, setPreviewChannel]);

	const handleInputKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				inputRef.current?.blur();
			}
		},
		[inputRef],
	);

	return {
		handleInputChange,
		handleInputKeyDown,
		handleSelectPreviewChannel,
		handleDismissPreview,
		handleAddPreviewChannel,
		handleAddParsedInput,
	};
}

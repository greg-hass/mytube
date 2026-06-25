/**
 * useSettingsFormState — manages the Settings form input state in isolation
 * so the parent hook stays focused on orchestration.
 */
import { useState } from "react";
import { useStore } from "../store/useStore";
import { getServerApiToken } from "../lib/api-auth";

export function useSettingsFormState() {
	const {
		apiKey,
		braveApiKey,
		opencodeApiKey,
		llmProvider,
		llmApiKey,
		llmModel,
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		setLlmProvider,
		setLlmApiKey,
		setLlmModel,
	} = useStore();

	const [inputKey, setInputKey] = useState(apiKey);
	const [braveInputKey, setBraveInputKey] = useState(braveApiKey);
	const [opencodeInputKey, setOpencodeInputKey] = useState(opencodeApiKey);
	const [llmProviderInput, setLlmProviderInput] = useState(llmProvider);
	const [llmApiKeyInput, setLlmApiKeyInput] = useState(llmApiKey);
	const [llmModelInput, setLlmModelInput] = useState(llmModel);
	const [serverApiTokenInput, setServerApiTokenInput] = useState(() =>
		getServerApiToken(),
	);

	return {
		inputKey,
		setInputKey,
		braveInputKey,
		setBraveInputKey,
		opencodeInputKey,
		setOpencodeInputKey,
		llmProviderInput,
		setLlmProviderInput,
		llmApiKeyInput,
		setLlmApiKeyInput,
		llmModelInput,
		setLlmModelInput,
		serverApiTokenInput,
		setServerApiTokenInput,
		// Store setters (bound to form state values)
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		setLlmProvider,
		setLlmApiKey,
		setLlmModel,
	};
}

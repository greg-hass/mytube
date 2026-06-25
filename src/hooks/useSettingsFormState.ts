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
		deepseekApiKey,
		customApiKey,
		llmProvider,
		llmModel,
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		setDeepseekApiKey,
		setCustomApiKey,
		setLlmProvider,
		setLlmApiKey,
		setLlmModel,
	} = useStore();

	const [inputKey, setInputKey] = useState(apiKey);
	const [braveInputKey, setBraveInputKey] = useState(braveApiKey);
	const [opencodeInputKey, setOpencodeInputKey] = useState(opencodeApiKey);
	const [deepseekInputKey, setDeepseekInputKey] = useState(deepseekApiKey);
	const [customApiKeyInput, setCustomApiKeyInput] = useState(customApiKey);
	const [llmProviderInput, setLlmProviderInput] = useState(llmProvider);
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
		deepseekInputKey,
		setDeepseekInputKey,
		customApiKeyInput,
		setCustomApiKeyInput,
		llmProviderInput,
		setLlmProviderInput,
		llmModelInput,
		setLlmModelInput,
		serverApiTokenInput,
		setServerApiTokenInput,
		// Store setters (bound to form state values)
		setApiKey,
		setBraveApiKey,
		setOpencodeApiKey,
		setDeepseekApiKey,
		setCustomApiKey,
		setLlmProvider,
		setLlmApiKey,
		setLlmModel,
	};
}

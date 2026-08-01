import { useCallback, useEffect, useRef } from "react";
import type {
	KeyboardEvent as ReactKeyboardEvent,
	RefObject,
} from "react";

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(",");

interface UseModalFocusOptions {
	isOpen: boolean;
	onClose: () => void;
	initialFocusRef?: RefObject<HTMLElement | null>;
	trapFocus?: boolean;
}

interface UseModalFocusResult<T extends HTMLElement> {
	modalRef: RefObject<T | null>;
	onKeyDown: (event: ReactKeyboardEvent<T>) => void;
}

export function useModalFocus<T extends HTMLElement>({
	isOpen,
	onClose,
	initialFocusRef,
	trapFocus = true,
}: UseModalFocusOptions): UseModalFocusResult<T> {
	const modalRef = useRef<T | null>(null);
	const openerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!isOpen) return;

		openerRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;

		const focusTarget =
			initialFocusRef?.current ??
			modalRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
			modalRef.current;
		focusTarget?.focus();

		return () => {
			const opener = openerRef.current;
			openerRef.current = null;
			if (opener && document.contains(opener)) opener.focus();
		};
	}, [initialFocusRef, isOpen]);

	const onKeyDown = useCallback(
		(event: ReactKeyboardEvent<T>) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				onClose();
				return;
			}

			if (event.key !== "Tab" || !trapFocus || !modalRef.current) return;

			const focusableElements = Array.from(
				modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
			);
			if (focusableElements.length === 0) {
				event.preventDefault();
				modalRef.current.focus();
				return;
			}

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (!event.shiftKey && document.activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus();
			}
		},
		[onClose, trapFocus],
	);

	return { modalRef, onKeyDown };
}

import { useLayoutEffect, useRef } from "react";

export const useHeaderHeight = () => {
	const headerRef = useRef<HTMLElement | null>(null);

	useLayoutEffect(() => {
		const header = headerRef.current;
		if (!header || typeof document === "undefined") return;

		const updateHeaderHeight = () => {
			document.documentElement.style.setProperty(
				"--app-current-header-height",
				`${header.offsetHeight}px`,
			);
		};

		updateHeaderHeight();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateHeaderHeight);
			return () => {
				window.removeEventListener("resize", updateHeaderHeight);
				document.documentElement.style.removeProperty(
					"--app-current-header-height",
				);
			};
		}

		const resizeObserver = new ResizeObserver(updateHeaderHeight);
		resizeObserver.observe(header);

		return () => {
			resizeObserver.disconnect();
			document.documentElement.style.removeProperty(
				"--app-current-header-height",
			);
		};
	}, []);

	return headerRef;
};

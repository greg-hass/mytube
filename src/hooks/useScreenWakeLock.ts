import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
	release: () => Promise<void>;
	addEventListener?: (
		type: "release",
		listener: () => void,
		options?: AddEventListenerOptions,
	) => void;
	removeEventListener?: (
		type: "release",
		listener: () => void,
		options?: EventListenerOptions,
	) => void;
};

type WakeLockManagerLike = {
	request: (type: "screen") => Promise<WakeLockSentinelLike>;
};

type NavigatorWithWakeLock = Navigator & {
	wakeLock?: WakeLockManagerLike;
};

export function useScreenWakeLock() {
	const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

	useEffect(() => {
		let cancelled = false;

		const releaseWakeLock = async () => {
			const current = wakeLockRef.current;
			wakeLockRef.current = null;
			if (!current) return;

			try {
				await current.release();
			} catch {
				// Ignore release errors. Unsupported browsers and transient lock
				// state changes should not break the app.
			}
		};

		const acquireWakeLock = async () => {
			if (cancelled) return;
			if (typeof navigator === "undefined") return;
			const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
			if (!wakeLock) return;
			if (document.visibilityState !== "visible") return;
			if (wakeLockRef.current) return;

			try {
				const sentinel = await wakeLock.request("screen");
				if (cancelled) {
					await sentinel.release().catch(() => {});
					return;
				}

				const clearSentinel = () => {
					if (wakeLockRef.current === sentinel) {
						wakeLockRef.current = null;
					}
				};

				sentinel.addEventListener?.("release", clearSentinel);
				wakeLockRef.current = sentinel;
			} catch {
				// Ignore unsupported browsers and permission failures.
			}
		};

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void acquireWakeLock();
				return;
			}

			void releaseWakeLock();
		};

		void acquireWakeLock();
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			void releaseWakeLock();
		};
	}, []);
}

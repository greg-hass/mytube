import { useEffect } from 'react';

export interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    description: string;
    action: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            for (const shortcut of shortcuts) {
                const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : true;
                const metaMatch = shortcut.meta ? event.metaKey : true;
                const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
                const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

                if (keyMatch && ctrlMatch && metaMatch && shiftMatch) {
                    // Don't trigger if user is typing in an input
                    const target = event.target as HTMLElement;
                    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                        // Exception: Escape key should work even in inputs
                        if (event.key !== 'Escape') continue;
                    }

                    event.preventDefault();
                    shortcut.action();
                    break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts, enabled]);
}

export const COMMON_SHORTCUTS = {
    SEARCH: { key: 'k', ctrl: true, description: 'Focus search' },
    NEW_CHANNEL: { key: 'n', ctrl: true, description: 'Add new channel' },
    CLOSE_MODAL: { key: 'Escape', description: 'Close modal' },
    HELP: { key: '?', description: 'Show keyboard shortcuts' },
} as const;

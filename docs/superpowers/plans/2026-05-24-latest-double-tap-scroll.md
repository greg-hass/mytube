# Latest Double-Tap Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users double tap the already-active `Latest` tab to return to the top of the Latest timeline.

**Architecture:** Keep the interaction in `Dashboard`, which owns dashboard tab activation and existing top-scroll resets. Track the previous active-Latest activation timestamp in a ref, then clear the Latest persisted scroll key and scroll the window to the top after a second activation within the gesture threshold.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite.

---

### Task 1: Active Latest Double-Tap Interaction

**Files:**
- Modify: `src/components/Dashboard.test.tsx`
- Modify: `src/components/Dashboard.tsx`

- [x] **Step 1: Write the failing Dashboard interaction test**

Add a test alongside existing dashboard tab/scroll tests:

```tsx
it('scrolls the active Latest timeline to the top after a double tap', () => {
  vi.spyOn(Date, 'now')
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_200);
  sessionStorage.setItem('latest-videos-scroll', '640');

  render(<Dashboard />);

  const latestTab = screen.getByRole('button', { name: /latest/i });
  fireEvent.click(latestTab);

  expect(window.scrollTo).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('latest-videos-scroll')).toBe('640');

  fireEvent.click(latestTab);

  expect(sessionStorage.getItem('latest-videos-scroll')).toBeNull();
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --run src/components/Dashboard.test.tsx -t "scrolls the active Latest timeline to the top after a double tap"
```

Expected: FAIL because the active `Latest` tab currently only calls `changeTab('latest')` and never clears its stored timeline position or scrolls to the top.

- [x] **Step 3: Implement the minimal active-Latest double-tap handler**

In `src/components/Dashboard.tsx`, import `useRef`, add constants, create a timestamp ref, and route only the Latest tab button through a dedicated handler:

```tsx
import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';

const QUALITY_FILTERS_STORAGE_KEY = 'feed-quality-filters';
const LATEST_TIMELINE_SCROLL_STORAGE_KEY = 'latest-videos-scroll';
const LATEST_DOUBLE_TAP_INTERVAL_MS = 350;

const lastActiveLatestTapAtRef = useRef<number | null>(null);

const handleLatestTabClick = () => {
  const now = Date.now();

  if (activeTab !== 'latest') {
    lastActiveLatestTapAtRef.current = null;
    changeTab('latest');
    return;
  }

  const lastTapAt = lastActiveLatestTapAtRef.current;
  if (lastTapAt !== null && now - lastTapAt <= LATEST_DOUBLE_TAP_INTERVAL_MS) {
    lastActiveLatestTapAtRef.current = null;
    sessionStorage.removeItem(LATEST_TIMELINE_SCROLL_STORAGE_KEY);
    window.scrollTo({ top: 0 });
  } else {
    lastActiveLatestTapAtRef.current = now;
  }

  changeTab('latest');
};
```

Update the Latest button:

```tsx
<button
  onClick={handleLatestTabClick}
```

- [x] **Step 4: Run the focused and full verification suites**

Run:

```bash
npm test -- --run src/components/Dashboard.test.tsx -t "scrolls the active Latest timeline to the top after a double tap"
npm test -- --run
npm run lint
npm run type-check
npm run build
```

Expected: all commands exit successfully; the full suite includes the new Latest double-tap test.

- [x] **Step 5: Commit the tested implementation**

```bash
git add docs/superpowers/plans/2026-05-24-latest-double-tap-scroll.md src/components/Dashboard.test.tsx src/components/Dashboard.tsx
git commit -m "Add Latest double-tap scroll to top"
```

# Compact Subscriptions and Icon Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dense, alphabetically navigable subscriptions view, clear discovered-channel results, and repair icon loading/count behavior.

**Architecture:** Extend the existing persisted UI mode and route compact rendering through a focused component. Reuse existing subscription mutation handlers, statically bundle YouTube icon repair, and expose discovery reset through the current state machine.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS, Vitest, Testing Library

---

### Task 1: Compact subscription data model and component

**Files:**
- Modify: `src/store/createUISlice.ts`
- Modify: `src/components/DesktopControls.tsx`
- Modify: `src/components/MobileMenu.tsx`
- Create: `src/components/CompactSubscriptionsList.tsx`
- Create: `src/components/CompactSubscriptionsList.test.tsx`

- [ ] Write failing tests for grouping, row controls, toggle state, and section anchors.
- [ ] Run the focused test and confirm failure.
- [ ] Implement `compact` view mode and the focused compact-list component.
- [ ] Run the focused test and confirm it passes.

### Task 2: Wire compact mode into Subs

**Files:**
- Modify: `src/components/SubscriptionsList.tsx`
- Modify: `src/components/SubscriptionsList.test.tsx`
- Modify: `src/components/Dashboard.tsx`

- [ ] Write failing tests for compact selection, filtering, and A–Z rail visibility.
- [ ] Run the focused tests and confirm failure.
- [ ] Render compact rows from the existing filtered channel list and mutation callbacks.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Clear discovered channels

**Files:**
- Modify: `src/components/AddChannelModal.tsx`
- Modify: `src/components/AddChannelModal.test.tsx`

- [ ] Write a failing interaction test that discovers, previews, clears, and returns to idle.
- [ ] Run the focused test and confirm failure.
- [ ] Add the Clear action and preview dismissal.
- [ ] Run the focused test and confirm it passes.

### Task 4: Repair icon module loading and counts

**Files:**
- Modify: `src/lib/icon-repair.ts`
- Create or modify: `src/lib/icon-repair.test.ts`
- Modify: `src/components/Dashboard.test.tsx`

- [ ] Write failing tests for static API repair and accurate changed-thumbnail count.
- [ ] Run the focused tests and confirm failure.
- [ ] Replace the dynamic import with a static import and return the calculated repair count.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Verification

- [ ] Run `npm run lint`.
- [ ] Run `npm run type-check`.
- [ ] Run `npm run test -- --run`.
- [ ] Run `npm run build`.
- [ ] Verify desktop and mobile compact view, A–Z navigation, discovery Clear, and icon repair in the rendered app.

# Latest Double-Tap Scroll Design

## Goal

Let a user who is reading down the Latest timeline return to its beginning by double tapping the already-selected `Latest` tab, especially in the installed mobile PWA.

## Behavior

- A normal tap on `Latest` continues to select the Latest tab.
- When Latest is already active, two activations of its tab within a short double-tap interval scroll the page immediately to `top: 0`.
- The action clears `latest-videos-scroll` from `sessionStorage` so the timeline is not restored to the old lower position on a later render.
- Double tapping `Latest` while switching from another tab does not unexpectedly jump the timeline; the gesture is only recognized when Latest was already active.
- No visible instructional UI, animation, or new control is added.

## Implementation

The gesture belongs in `Dashboard`, where the `Latest` tab selection is owned and where existing tab changes already reset page scroll for Queue and Faves. Store the timestamp of the last activation made while Latest is active in a ref. On a second active-Latest activation inside the threshold, clear the persisted Latest scroll key and call `window.scrollTo({ top: 0 })`.

Use click activation rather than relying on DOM `dblclick`, because two button activations are emitted consistently for both mouse use and touch/PWA tapping. Keep the threshold local to the gesture handler and avoid changing `VirtualizedVideoGrid`, whose responsibility remains list rendering and generic scroll persistence.

## Testing

- Add a `Dashboard` interaction test proving that two activations of the active `Latest` tab scroll to the top and clear `latest-videos-scroll`.
- Add or include a check that one activation alone does not scroll, preserving existing tab behavior.
- Run the relevant test first, then the full frontend/server test suite and standard static/build checks.
- Validate the gesture in the rendered app at the deployed/mobile-oriented surface after implementation.

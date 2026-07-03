# Compact Subscriptions and Icon Repair Design

## Objective

Add a third compact subscriptions view, fast alphabetical navigation, a clear
action for discovered channels, and a reliable channel-icon repair action.

## Compact subscriptions

The persisted subscription `viewMode` accepts `grid`, `list`, or `compact`.
Existing stored values remain valid. Compact mode renders one dense row per
channel with:

- a 36–40 px channel icon;
- channel name and optional group;
- favorite, mute, and delete controls;
- accessible names and pressed state for toggle controls.

Filtered subscriptions are grouped by the first alphanumeric display
character. Letters use uppercase A–Z headings and all other characters use
`#`. Headings remain sticky while scrolling.

For sufficiently large lists, an A–Z rail displays only sections present in the
filtered data. Activating a letter scrolls its section into view. The existing
toolbar search remains the only text filter.

Delete retains the existing undo/toast behavior. Grid and large-card list views
remain unchanged.

## Discover Channels clear action

When channel discovery reaches a results state, a visible Clear action resets
suggestions to idle, dismisses any active suggestion preview, and restores the
Discover Channels button. It applies to populated and empty result states.

## Icon repair

The runtime dynamic import of `youtube-api.ts` is replaced with a statically
bundled dependency so deployed chunk lookup cannot fail. Repair remains
server-first and optionally uses the configured YouTube API key.

The repaired count compares channel thumbnails before and after the operation.
The UI reports updated icons, no required updates, missing API configuration,
or a real failure accurately.

## Testing

Automated tests cover:

- compact view selection and rendering;
- alphabetical grouping and `#`;
- toolbar-filtered compact data;
- A–Z navigation targets;
- favorite, mute, and delete controls;
- accessible toggle state;
- discovery reset and preview dismissal;
- statically bundled icon repair;
- server-first and API-assisted repair;
- accurate repaired counts and failure behavior.

Final verification runs lint, type-check, all tests, production build, and
desktop/mobile rendered interaction checks.

No database migration or public API change is required.

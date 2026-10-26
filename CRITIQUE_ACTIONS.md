## Recommended Actions

Ordered by your stated priority (keyboard focus first), then by impact. The player (`ChannelPlayer`) is kept as-is per your constraint, so no recommended command touches it.

1. **`/impeccable audit`** — Keyboard focus + a11y pass on the home surface. Restore `:focus-visible` rings on the channel search input (currently `outline-none`), server-selector chips, channel rows, and retest/retry buttons; verify focus order flows logically through the top bar. Addresses **[P0] invisible keyboard focus** — your #1 priority; unblocks Sam (keyboard-only user) from the primary flow.

2. **`/impeccable layout`** — Top bar hierarchy. Give the channel list / "pick a channel" primary action clear visual precedence; demote the Channel Health Checker or move it to a secondary tier; keep search in one consistent place across breakpoints. Addresses **[P1] top bar overloaded**.

3. **`/impeccable clarify`** — Copy/label review. Rename "Server:" to "Source"/"Playlist" with a one-line helper; add a one-line hint near the status dots explaining how stream checking works and what the dot colors mean. Note: the "no way to deselect" issue is partially constrained — a player-header "Stop"/"Close player" control is off-limits per your "keep the player as-is" decision; a channel-list deselect (clicking the active row again) can still be considered. Addresses **[P1] zero first-use guidance**.

4. **`/impeccable polish`** — Component consistency + final polish. Use one consistent icon for all server chips (differentiate active state via color/border only, not index-based Radio/Wifi alternation); move the detector-flagged 10px/11px font sizes onto the DESIGN.md type ramp (channel-browser, channel-health, channel-list-item, server-selector — skipping channel-player per your constraint). Addresses **[P2] meaningless server icons** and the 14 detector `design-system-font-size` advisories. Final polish pass before shipping.

Not recommended: `/impeccable bolder` — you confirmed the utilitarian dashboard tone is intentional, so no tonal amplification.

You can ask me to run these one at a time, all at once, or in any order you prefer. Re-run `/impeccable critique` after fixes to see your score improve (current: 23/40 Acceptable).

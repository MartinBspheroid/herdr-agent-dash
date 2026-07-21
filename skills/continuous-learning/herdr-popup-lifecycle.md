# Herdr Popup Lifecycle Runbook

## Learning: Popup geometry is launch-only

- **Context:** Implementing persistent compact and orientation controls for a Herdr 0.7.4 plugin popup.
- **Symptom:** `herdr pane resize` and `pane.move` exist, but a popup process has no `HERDR_PANE_ID`, and the socket schema exposes only `popup.close` for an existing popup.
- **Root cause:** Treat Herdr popups as session-modal launch surfaces, never as panes. Pane lifecycle and geometry APIs cannot target them.
- **Fix:** Persist the desired geometry, invoke a manifest-owned action, call `popup.close`, and reopen the entrypoint with `plugin.pane.open` plus explicit `width` and `height`. Retry only the transient `ui_busy` release race.
- **Prevention check:** Before implementing popup controls, run `herdr api schema --json` and verify the available `popup.*` methods and `PluginPaneOpenParams`; do not infer capabilities from `pane.*` commands.
- **Tags:** herdr, plugin, popup, geometry, lifecycle, research

## Herdr popup pre-flight

Before changing popup placement or dimensions:

- [ ] Record `herdr --version` and verify it against `min_herdr_version`.
- [ ] Inspect `herdr api schema --json` for popup-specific methods.
- [ ] Confirm whether the process receives `HERDR_PANE_ID` or only underlying-pane context.
- [ ] Keep popup dimensions on `plugin.pane.open`; never call `pane.resize` for a popup.
- [ ] Persist geometry before replacing the popup so the replacement action reads committed state.
- [ ] Test close/open request order, transient `ui_busy` retry, tab no-op behavior, and next-session dimensions.
- [ ] Run `bun run check`, `bun run smoke`, `bun run docs:smoke`, and `bun run build`.

Acceptance criteria:

- `s` and `p` change the outer popup, not internal table columns or panel direction.
- A tab remains unchanged and only saves preferences for the next popup.
- The popup replacement action is manifest-declared and visible to the plugin lifecycle smoke test.
- Existing `view.compact` and `view.detailPosition` values migrate without breaking startup.

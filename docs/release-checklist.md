# Release checklist

- [x] `bun run check` passes with TypeScript 7.
- [x] `bun run smoke` passes from a clean checkout.
- [?] `bun run plugin:smoke -- --open` passes on an isolated supported Herdr 0.7.4 macOS host and cleans up its link. Historical evidence exists outside this checkout; rerun for a current release.
- [x] Hand-curated Herdr protocol fixtures cover the target 0.7.4 snapshot fields; live host parity remains an external gate.
- [ ] Herdr 0.7.4+ popup and tab smoke tests pass on macOS and Linux.
- [x] Synthetic 20-, 50-, and 1,000-agent projection/enrichment/sort measurements run locally.
- [x] Git worktree, detached-head, no-Git, timeout, Unicode, and leading-hyphen paths pass.
- [x] Disconnect/reconnect and pane-move focus scenarios pass.
- [x] Terminal escape injection and output size bounds pass.
- [x] No network calls or raw terminal/transcript persistence occur by default.
- [x] `bun run privacy:smoke` passes the source-level local-only/persistence audit.
- [x] Manifest commands and dependency lockfile are reviewed.
- [x] README documents install, configuration, privacy, activity semantics, and troubleshooting.

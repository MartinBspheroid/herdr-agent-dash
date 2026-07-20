# Adversarial review hardening checklist

This is the executable checklist derived from the six-agent review. Each item is
closed only after its regression test and the relevant project gate pass.

Status values: `[ ]` open, `[-]` verified already fixed before this pass, `[x]`
implemented and verified, `[?]` requires an external host or packaging environment.

## Phase 1 — Stop the bleeding

- [x] Transport: add request deadlines, strict response envelopes, bounded NDJSON frames, bounded event queues, and reconnect buffer reset.
- [x] Protocol: reject malformed snapshots instead of converting them to live empty state.
- [x] Protocol: consume official Herdr 0.7.4 nested identifiers, including `pane_id` and `terminal_id`.
- [x] Session: generation-guard concurrent refreshes and preserve the last valid snapshot after invalid data.
- [x] Session: make `start()` and `dispose()` idempotent and cancellation-aware.
- [x] Git: treat nonzero exit codes and truncated output as explicit errors.
- [x] Git: make `includeUntracked: false` explicit and generation-guard invalidated requests.
- [x] Git: bound cache growth and publish watchdog refreshes through the board store.
- [x] Runtime: enforce a hard process deadline with escalation.
- [x] Commands: fail closed after refresh failure and await popup close.
- [x] UI safety: sanitize all display-bound terminal metadata and preserve safe truncation.

## Phase 2 — Stabilize the project

- [x] Reducer: guard workspace/tab revisions and reconcile pane replacement atomically.
- [x] UI state: distinguish connecting, live, stale, failed, incompatible, and valid-empty states.
- [x] UI input: isolate search/help modal keyboard handling from global commands.
- [x] UI output: associate recent output with its originating agent and clear it on selection changes.
- [x] UI language: replace raw enums, clarify provenance/staleness, and fix pluralization/copy.
- [x] Startup: render the board before slow Git enrichment and expose startup failures.
- [x] Configuration: implement or remove `defaultMode`; reject unknown visible columns.
- [x] Testing: add transport, refresh-race, Git, process-timeout, UI-modal, and recovery regressions.
- [x] CI: run smoke, build, benchmark, and documentation checks; supported-host smoke remains external.
- [x] Benchmark: measure full projection/enrichment paths at representative fleet sizes.
- [x] Smoke: assert plugin list/action contents and fail on cleanup errors.

## Phase 3 — Strengthen the foundation

- [x] Documentation: replace conflicting PRD/release/troubleshooting claims with an as-built runbook.
- [x] Documentation: add exact host setup, socket/bin environment requirements, recovery, and release evidence commands.
- [ ] Release: add reproducible macOS/Linux/Herdr-version/package validation artifacts.
- [x] Architecture: document identity, revision, transport, Git, and provider ownership boundaries.
- [x] Operations: add resource limits, in-memory metrics, and health diagnostics; long-running soak coverage remains open.
- [?] Validate the current checkout against a real Herdr 0.7.4 host and production packaging environment.

## Acceptance gate

- `bun check`
- `bun run smoke`
- `bun run privacy:smoke`
- `bun run plugin:smoke` against an isolated supported host
- `bun run benchmark`
- production build/package command
- documentation commands from a clean checkout
- no leftover Herdr process, plugin link, pane, session, or socket

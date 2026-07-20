# Adversarial Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the six-agent adversarial review into verified production-hardening changes without weakening the project’s TypeScript 7 and host-contract gates.

**Architecture:** Harden boundaries first: strict bounded transport and protocol parsing feed a generation-aware session store; Git and process execution return explicit failure states; the UI consumes typed connection and provenance states. Documentation and CI are updated only after runtime behavior is verified.

**Tech Stack:** Bun 1.3.12, TypeScript 7.0.2, Bun tests, OpenTUI, oxlint, Prettier, Herdr NDJSON and CLI transports.

## Global Constraints

- Use TypeScript 7.0.2 and the repository’s declared Bun commands.
- No default exports, `any`, unsafe casts without a documented reason, or production `console.log`.
- Preserve privacy defaults: no network access, no persistent terminal output, no persistent timeline.
- Keep public routes/loaders independent from protected loaders where routing is touched.
- Every behavior change gets a focused regression test before broad verification.
- Treat the real Herdr 0.7.4 host as a required external acceptance gate, not as a fixture assumption.

## Task 1: Strict bounded NDJSON transport

**Files:** `src/herdr/ndjson-client.ts`, `src/herdr/async-queue.ts`, `src/herdr/protocol.ts`, `tests/integration/ndjson.test.ts`, `tests/unit/protocol.test.ts`

- [ ] Add failing tests for malformed error envelopes, request timeout, incomplete-frame reconnect, frame-size rejection, and queue bounds.
- [ ] Implement bounded frames, request deadlines, strict response discrimination, buffer reset, and explicit transport errors.
- [ ] Run `bun test tests/integration/ndjson.test.ts tests/unit/protocol.test.ts`.

## Task 2: Snapshot, identity, and refresh correctness

**Files:** `src/herdr/protocol.ts`, `src/herdr/session-store.ts`, `src/herdr/event-reducer.ts`, `tests/unit/protocol.test.ts`, `tests/unit/session-store.test.ts`, `tests/unit/event-reducer.test.ts`

- [ ] Add official 0.7.4-shaped nested identifier fixtures and invalid snapshot tests.
- [ ] Implement discriminated snapshot validation, refresh generations, idempotent lifecycle, nested identifier normalization, workspace/tab revision guards, and atomic pane replacement cleanup.
- [ ] Run the focused session/protocol/reducer tests.

## Task 3: Git and process failure integrity

**Files:** `src/git/git-enricher.ts`, `src/app/runtime.ts`, `tests/unit/git-enricher.test.ts`, `tests/unit/runtime.test.ts`, `tests/fixtures/process-runners.ts`

- [ ] Add failing tests for nonzero/truncated Git output, explicit untracked flags, invalidated in-flight results, cache limits, and hard process deadlines.
- [ ] Implement explicit Git result validation, cache generations/limits, and deadline escalation.
- [ ] Run focused Git/runtime tests and `bun check`.

## Task 4: Command lifecycle and startup state

**Files:** `src/app/command-service.ts`, `src/main.tsx`, `src/app/agent-board-store.ts`, `src/contracts/types.ts`, tests under `tests/unit`

- [ ] Add tests for failed refresh retry, awaited popup close, idempotent board startup, and render-before-enrichment behavior.
- [ ] Implement fail-closed command retry, awaited popup lifecycle, explicit startup error state, and asynchronous enrichment.
- [ ] Run command/store/UI tests.

## Task 5: UI safety, modality, and semantics

**Files:** `src/ui/App.tsx`, `src/ui/AgentRow.tsx`, `src/ui/DetailPanel.tsx`, `src/ui/StatusBar.tsx`, `src/ui/Help.tsx`, `src/safety/sanitize-terminal.ts`, `tests/unit/ui.test.tsx`, `tests/unit/safety.test.ts`

- [ ] Add tests for modal keyboard isolation, preview ownership, connection-state copy, display sanitization, staleness, and valid-empty messaging.
- [ ] Implement the typed UI state matrix, safe display formatting, modal event consumption, preview ownership, and human-facing labels.
- [ ] Run UI and accessibility-adjacent terminal tests.

## Task 6: Configuration, smoke, benchmarks, and CI

**Files:** `src/config/schema.ts`, `src/main.tsx`, `scripts/plugin-smoke.ts`, `scripts/benchmark.ts`, `.github/workflows/ci.yml`, `package.json`, tests

- [ ] Add tests for configuration rejection and smoke cleanup/list/action assertions.
- [ ] Implement config behavior or remove inert options, broaden smoke assertions, and add full-pipeline benchmark measurements.
- [ ] Add CI jobs for smoke, build, plugin smoke, benchmark, and documentation checks.

## Task 7: Documentation and external acceptance

**Files:** `README.md`, `docs/architecture.md`, `docs/configuration.md`, `docs/troubleshooting.md`, `docs/release-report.md`, `docs/release-checklist.md`, `docs/implementation-map.md`, new as-built runbook

- [ ] Reconcile current behavior, host setup, compatibility, configuration, release evidence, and recovery guidance.
- [ ] Add reproducible commands and acceptance criteria without claiming unexecuted Linux/0.7.4/package checks.
- [ ] Execute the supported-host smoke when the environment is available and leave external items marked `[?]` otherwise.

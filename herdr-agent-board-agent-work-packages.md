# Herdr Agent Board — Parallel Agent Work Packages

**Companion to:** `herdr-agent-board-prd.md`
**Purpose:** Split P0 into independently implementable packages with explicit interfaces and merge dependencies.
**Rule:** No agent may bypass shared contracts by importing another package's internals.

---

## 1. Coordination model

### Branches/worktrees

Recommended worktree branches:

```text
feature/contracts-fixtures
feature/herdr-data-plane
feature/git-enrichment
feature/domain-activity
feature/tui
feature/plugin-packaging
feature/qa-hardening
```

### First merge

The contracts/fixtures slice must merge before the main parallel implementation begins. It defines:

- normalized Herdr protocol fixture types;
- `SessionStore` interface;
- `AgentCard`, `GitContext`, `ActivitySignal`, and view-model interfaces;
- fake-store fixtures for UI work;
- process-runner interface for Git and CLI work;
- common error type and test conventions.

### Integration rule

Each package exposes a narrow public module. Cross-package calls use the public interfaces only. The UI never imports socket, filesystem, or Git implementation modules directly.

---

## 2. Work Package 0 — Contracts and fixture foundation

### Owner profile

Senior TypeScript architecture/testing agent.

### Objective

Create the repository skeleton and stable contracts that let all other agents work independently.

### Deliverables

- strict TypeScript/Bun project;
- React/OpenTUI dependencies declared but no full UI;
- lint, typecheck, unit test, and integration test scripts;
- domain interfaces from the PRD;
- `ProcessRunner` abstraction;
- `Clock` abstraction for deterministic timestamps;
- fake Herdr protocol fixtures;
- fake `AgentBoardStore` snapshots for compact, standard, and wide UI;
- temporary Git repository fixture helpers;
- architecture decision records for transport, identity, activity semantics, and Git safety;
- CI workflow.

### Required public interfaces

```ts
interface HerdrTransport {
  request<T>(method: string, params?: unknown): Promise<T>;
  subscribe(subscriptions: EventSubscription[]): AsyncIterable<HerdrEvent>;
  close(): Promise<void>;
}

interface ProcessRunner {
  run(argv: readonly string[], options: ProcessOptions): Promise<ProcessResult>;
}

interface Clock {
  now(): number;
}
```

### Acceptance

- `bun test` passes from a clean checkout;
- strict typecheck passes;
- UI agent can render fixture view models without live Herdr;
- data-plane agent can replay fixture snapshots/events without UI;
- Git agent can use temporary repository helpers;
- no implementation package owns shared types privately.

### Must not do

- choose provider transcript formats;
- build the full renderer;
- connect to a live Herdr server in unit tests;
- put protocol and domain records in one undifferentiated type.

---

## 3. Work Package A — Herdr protocol and session store

### Objective

Implement reliable snapshot/event synchronization and a normalized local session cache.

### Inputs

- `HerdrTransport` interface;
- Herdr schema/fixtures;
- shared raw and normalized types;
- fake NDJSON server harness contract.

### Deliverables

- NDJSON request client with unique request IDs;
- Unix socket transport for macOS/Linux;
- CLI fallback adapter using `HERDR_BIN_PATH` where appropriate;
- protocol/version check;
- `session.snapshot` bootstrap;
- event subscription client;
- session reducer for workspace/tab/pane/agent/worktree events;
- revision/duplicate handling;
- connection state machine;
- capped reconnect/backoff;
- stale-cache state;
- atomic resnapshot/reconciliation;
- current target resolution by stable identity;
- unit and integration tests.

### Public output

```ts
interface SessionStoreSnapshot {
  connection: "connecting" | "live" | "stale" | "failed";
  serverVersion?: string;
  protocolVersion?: number;
  workspaces: ReadonlyMap<string, WorkspaceRecord>;
  tabs: ReadonlyMap<string, TabRecord>;
  panes: ReadonlyMap<string, PaneRecord>;
  agents: ReadonlyMap<string, AgentRecord>;
  lastSynchronizedAt?: number;
}

interface SessionStore {
  getSnapshot(): SessionStoreSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  resolveCurrentTarget(stableAgentId: string): CurrentAgentTarget | undefined;
  dispose(): Promise<void>;
}
```

### Critical scenarios

- event arrives near startup snapshot;
- duplicate and stale revisions;
- pane moves to another tab/workspace;
- public pane ID changes while terminal identity remains stable;
- agent disappears;
- stream disconnects after data loaded;
- reconnect returns a materially different snapshot;
- future unknown fields;
- structured Herdr error.

### Acceptance

- no fixed whole-agent polling;
- state event visible in store immediately;
- stale data remains available during disconnect;
- reconnect plus resnapshot returns to `live`;
- focus target resolves correctly after fixture move;
- malformed one-record fixture does not destroy valid records;
- all transport resources close cleanly.

### Must not do

- run Git;
- choose display sorting;
- parse terminal output into progress;
- depend on React.

---

## 4. Work Package B — Git enrichment

### Objective

Provide accurate, safe, asynchronous per-agent repository and branch context.

### Inputs

- `ProcessRunner`;
- `Clock`;
- `effectiveCwd` values;
- shared `GitContext` type.

### Deliverables

- safe argv-based Git runner;
- command timeout and cancellation;
- repository/worktree identity resolution;
- porcelain-v2 branch/status parser;
- branch, detached head, clean/dirty, category counts, upstream, ahead/behind;
- cache keyed by repository/worktree identity;
- inflight de-duplication;
- concurrency limit;
- invalidation/debounce API;
- configurable watchdog;
- backoff after repeated timeout;
- unit and real temporary-repository tests.

### Public interface

```ts
interface GitEnricher {
  get(cwd: string): GitContext | undefined;
  ensure(cwd: string, reason: GitRefreshReason): Promise<GitContext>;
  invalidate(cwdOrRepo: string, reason: GitRefreshReason): void;
  subscribe(listener: (key: string) => void): () => void;
  dispose(): Promise<void>;
}
```

### Required process constraints

- never use shell interpolation;
- limit output bytes;
- default timeout 1.5 seconds;
- default max concurrency four;
- no full diff for table rendering;
- result errors remain local to one key.

### Acceptance

Fixtures prove correct behavior for:

- normal branch;
- no commits yet;
- detached head;
- dirty categories;
- untracked files;
- rename/conflict;
- upstream ahead/behind;
- nested directory;
- linked worktree;
- no-Git directory;
- deleted/inaccessible directory;
- spaces, Unicode, and leading hyphens in paths;
- command timeout;
- two agents sharing one repository causing one inflight refresh.

### Must not do

- modify repositories;
- run checkout, reset, clean, fetch, pull, commit, or push;
- block initial agent rendering;
- infer narrative agent progress from Git state.

---

## 5. Work Package C — Domain projection and activity semantics

### Objective

Convert raw session records plus enrichment into trustworthy provider-neutral agent cards.

### Inputs

- `SessionStoreSnapshot`;
- `GitEnricher`;
- shared domain contracts;
- metadata/title fixtures.

### Deliverables

- stable agent identity resolver;
- agent/pane/tab/workspace projector;
- effective cwd resolver;
- state normalization;
- local state transition timestamp tracking;
- attention sort and alternate sorts;
- search index/token matching;
- activity provider interface and engine;
- metadata provider;
- reported-state-message provider when public record supports it;
- terminal-title provider;
- Git-change activity evidence;
- source/semantics/confidence labels;
- provider-neutral `AgentBoardStore` or domain service;
- unit tests.

### Public interface

```ts
interface AgentBoardSnapshot {
  connection: "connecting" | "live" | "stale" | "failed";
  agents: readonly AgentCard[];
  visibleAgents: readonly AgentCard[];
  selectedAgentId?: string;
  attentionCount: number;
  filter: BoardFilter;
  sort: BoardSort;
  search: string;
  generatedAt: number;
}

interface AgentBoardStore {
  getSnapshot(): AgentBoardSnapshot;
  subscribe(listener: () => void): () => void;
  select(id: string): void;
  moveSelection(delta: number): void;
  setSearch(value: string): void;
  setFilter(filter: BoardFilter): void;
  setSort(sort: BoardSort): void;
  markReviewed(id: string): void;
}
```

### Semantic rules to enforce in tests

- metadata summary outranks terminal title;
- latest human prompt, when later added, is `last_request`, not `current_signal` by default;
- Git changes are separate from narrative signal;
- raw terminal content is `raw_output` only;
- unknown state stays visible;
- initial state age is unknown unless actually observed/restored;
- stale connection marks every row stale without rewriting semantic state;
- agent selection survives unrelated reordering.

### Acceptance

- complete fixture projection has no duplicate agent rows;
- stable identity survives move fixtures;
- attention sort is deterministic;
- search covers agent, labels, IDs, paths, repo, branch, and activity;
- every displayed signal has source and semantics;
- no provider-specific filesystem access in P0 core.

### Must not do

- import React;
- call the socket directly;
- read arbitrary home-directory transcript trees;
- use an LLM.

---

## 6. Work Package D — OpenTUI React user interface

### Objective

Implement the responsive keyboard-first board using only store and command-service interfaces.

### Inputs

- fake `AgentBoardStore` fixtures;
- `CommandService` interface;
- UI requirements and wireframe from PRD.

### Deliverables

- OpenTUI renderer bootstrap;
- compact, standard, and wide layouts;
- header health/freshness summary;
- table and row components;
- selected-agent detail panel/screen;
- search input;
- filter/sort controls;
- loading, empty, stale, error, and no-Git states;
- help screen with activity semantics;
- keyboard navigation;
- truncation and path-shortening display;
- terminal-output preview panel using already-sanitized bounded text;
- UI snapshot tests.

### Command interface expected

```ts
interface CommandService {
  focusAgent(stableAgentId: string): Promise<CommandResult>;
  refreshAll(): Promise<CommandResult>;
  refreshGit(stableAgentId: string): Promise<CommandResult>;
  loadRecentOutput(stableAgentId: string): Promise<CommandResult<OutputPreview>>;
  close(): Promise<void>;
}
```

### Acceptance

- usable at 60, 100, 140, and 200 columns;
- color is never the only state cue;
- selection remains visible;
- Enter calls focus for stable identity, not a cached pane ID owned by UI;
- failed focus displays error and leaves board open;
- terminal output is not requested until `o` is pressed;
- popup and tab modes can share the same UI with mode-specific close behavior;
- all UI tests use fake stores and commands; no protocol or Git process in component tests.

### Must not do

- call Herdr or Git directly;
- parse protocol fields;
- redefine activity semantics;
- persist raw output.

---

## 7. Work Package E — Plugin packaging, launchers, configuration, and commands

### Objective

Make the product installable and connect UI actions to safe Herdr operations.

### Inputs

- plugin manifest requirements;
- `SessionStore.resolveCurrentTarget`;
- UI command interface;
- config contract.

### Deliverables

- `herdr-plugin.toml` with popup and tab entrypoints;
- launcher using `HERDR_BIN_PATH` and `HERDR_PLUGIN_ID`;
- development keybinding documentation;
- plugin config loader from Herdr-provided directory;
- safe defaults and validation diagnostics;
- command service for focus, refresh, Git refresh, on-demand read, and popup close;
- stale-target re-resolution flow;
- install/link/open/uninstall smoke scripts;
- README installation and troubleshooting sections.

### Focus algorithm

1. Receive stable board identity.
2. Resolve the current target from `SessionStore` immediately before action.
3. Call Herdr focus.
4. On `not_found`, resnapshot once.
5. Resolve again only when stable identity maps uniquely.
6. Retry once.
7. Close popup only after success.
8. Return structured failure otherwise.

### Output-read algorithm

- resolve current target;
- request `recent-unwrapped` bounded lines;
- sanitize ANSI/control sequences;
- truncate by processed byte limit;
- return in-memory preview;
- never write it to disk.

### Acceptance

- clean checkout can install/link and open popup;
- popup dimensions and modal behavior are correct;
- tab opens as normal pane;
- focus-after-move scenario passes;
- invalid config identifies exact path and uses safe fallback;
- manifest contains no hidden build/runtime action;
- no production code hard-codes a particular Herdr installation path;
- uninstall leaves no running dashboard process.

### Must not do

- add destructive agent actions;
- close popup before focus acknowledgement;
- place terminal content in logs;
- require a configuration file.

---

## 8. Work Package F — QA, integration, load, and security hardening

### Objective

Own the release gate independently from feature authors.

### Inputs

- PRD acceptance criteria;
- fake protocol harness;
- all package public interfaces;
- Git fixtures;
- installable plugin build.

### Deliverables

- fake NDJSON Herdr server implementation;
- startup-race scenarios;
- duplicate/stale event scenarios;
- disconnect/reconnect scenarios;
- pane-move/focus scenarios;
- malformed/unknown protocol data tests;
- real Git fixture matrix;
- terminal escape/control injection tests;
- path injection tests;
- output-size limits;
- 20-agent and 50-agent load fixtures;
- CPU/memory benchmark script;
- network-denial test or observation harness;
- persistent-state content audit;
- macOS/Linux manual test checklist;
- release acceptance report.

### Release authority

This agent may block release for:

- any failed P0 acceptance criterion;
- polling architecture that violates FR-018;
- unlabelled activity semantics;
- wrong-agent focus risk;
- shell interpolation;
- raw content persistence;
- unexpected network access;
- crash on an individual malformed record;
- unreviewed dependency/manifest command.

### Acceptance

- AC-001 through AC-020 have automated or documented manual evidence;
- performance measurements are attached, not asserted;
- failures include reproduction fixture;
- no test depends on a developer's private transcript files;
- release report names tested Herdr versions and operating systems.

---

## 9. Optional P1 Work Package G — Native session adapters

### Start condition

Begin only after P0 activity semantics and privacy controls are merged and accepted.

### Objective

Add provider-specific local session evidence without weakening the provider-neutral core.

### Deliverables per adapter

- `supports()` based on explicit `agent_session` source/kind;
- version-aware parser;
- narrow read scope to the referenced session;
- `last_request` signal;
- any provable current-status/tool signal with explicit semantics;
- no raw persistence;
- failure-isolation tests;
- fixture data containing no real user content;
- documentation of provider format assumptions.

### Initial priority recommendation

1. Claude adapter, because prior art shows demand and a local transcript path.
2. Codex adapter, because Herdr exposes native session references.
3. Pi adapter, after its stable session format is verified.

### Acceptance

- disabled by default;
- deleting or corrupting provider data does not affect core board;
- latest prompt is labelled `Last request`;
- unknown version fails closed;
- adapter performs no broad home-directory crawl when session reference is absent.

---

## 10. Suggested pull-request order

1. `chore: scaffold contracts fixtures and CI`
2. `feat: add Herdr snapshot and event session store`
3. `feat: add per-agent Git enrichment`
4. `feat: add agent projection activity semantics and search`
5. `feat: render responsive agent board TUI`
6. `feat: package popup and tab entrypoints with focus commands`
7. `test: add reconnect move security and load release suite`
8. `docs: add installation configuration semantics and troubleshooting`
9. `release: prepare v0.1.0 marketplace package`

PRs 2–6 may develop in parallel after PR 1, but their integration order should preserve passing tests and public-interface compatibility.

---

## 11. Shared definition of done for every work package

- public interface documented;
- unit tests for normal and failure paths;
- no hidden coupling to another package's implementation;
- errors are structured and bounded;
- resources and subprocesses are disposed;
- strict typecheck passes;
- no raw terminal/transcript data in fixtures or logs;
- no `TODO` or `TBD` left in production behavior;
- PR description maps changes to PRD requirement IDs;
- verification commands and results included in the PR description.

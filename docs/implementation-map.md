# PRD implementation map

| Requirement group | Implementation                                                                                                          | Evidence                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| FR-001–007        | `herdr-plugin.toml`, `scripts/open-board-pane.ts`, `src/launcher.ts`, `src/app/bootstrap.ts`, `scripts/plugin-smoke.ts` | `bun run smoke`, supported-host manual matrix                                |
| FR-010–019        | `src/herdr/ndjson-client.ts`, `src/herdr/session-store.ts`, `src/herdr/event-reducer.ts`, `src/herdr/protocol.ts`       | protocol, session, and NDJSON tests                                          |
| FR-020–028        | `src/domain/agent-projector.ts`, `src/domain/attention-sort.ts`, `src/domain/search.ts`, `src/app/agent-board-store.ts` | domain, board-store, and load tests                                          |
| FR-030–038        | `src/git/git-enricher.ts`, `src/git/porcelain-v2.ts`                                                                    | temporary repository, worktree, timeout, cache, debounce, and watchdog tests |
| FR-050–057        | `src/activity/*`, `src/safety/*`, `src/app/command-service.ts`, `src/ui/DetailPanel.tsx`                                | activity, safety, command, and UI render tests                               |
| FR-070–073        | `src/app/command-service.ts`, `src/ui/App.tsx`                                                                          | focus move/retry/failure tests and supported-host smoke                      |
| FR-080–082        | `src/config/*`                                                                                                          | configuration tests and optional-file runtime path                           |

Required local gates are `bun run check`, `bun run smoke`, `bun run privacy:smoke`, and `bun run benchmark`. Host-dependent evidence is recorded separately in [release-report.md](release-report.md).

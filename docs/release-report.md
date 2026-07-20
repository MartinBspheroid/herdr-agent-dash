# Implementation verification report

## Automated evidence

- TypeScript compiler: `7.0.2`.
- `bun run check`: pass.
- `bun run smoke`: pass.
- Unit, integration, and OpenTUI render tests: run `bun run check` for the current count; this report intentionally does not freeze a stale assertion count.
- Synthetic load benchmark: run `bun run benchmark` for current 20-, 50-, and 1,000-agent projection, enrichment, sort, and heap measurements.
- Unix-socket NDJSON request/event harness: pass.
- Real temporary Git repository and no-Git directory: pass.
- Terminal escape and byte-bound tests: pass.
- Privacy observation harness: `bun run privacy:smoke` passes.
- Subscription acknowledgement and post-subscribe reconciliation: pass.
- Git cache invalidation, concurrency, debounce, and watchdog backoff: pass.

## Acceptance evidence

| Criterion                | Evidence                                                                                                                                      | Status                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| AC-001 / AC-002          | Manifest contains popup and tab entrypoints; actions invoke Herdr-managed popup/tab panes.                                                    | Historical external evidence; rerun required       |
| AC-003 / AC-004 / AC-005 | Normalization, event reducer, projector, and 50-agent fixture tests.                                                                          | Pass                                               |
| AC-006 / AC-007          | Real temporary Git repositories cover branch, detached, unborn, linked worktree, no-Git, deleted path, timeout, and missing executable cases. | Pass                                               |
| AC-008 / AC-009          | Activity provenance types, explicit metadata priority, source-labelled detail, and no native adapters by default.                             | Pass                                               |
| AC-010 / AC-011          | Pane-move focus, stale-target retry, and failed-focus tests.                                                                                  | Pass                                               |
| AC-012 / AC-013 / AC-014 | Reconnect/resnapshot, on-demand `pane.read`, sanitizer, and OpenTUI status tests.                                                             | Pass                                               |
| AC-015 / AC-016          | No persistence implementation or network client; subprocess and socket boundaries are local and audited by source.                            | Automated pass                                     |
| AC-017                   | Compact/standard/wide breakpoint tests plus OpenTUI render snapshots.                                                                         | Automated pass; host matrix pending                |
| AC-018 / AC-019          | 50-agent load test, benchmark script, malformed/unknown-field protocol tests.                                                                 | Pass                                               |
| AC-020                   | `plugin:smoke` performs link/list/action/open/close/unlink on supported hosts.                                                                | External host gate; not run on current Herdr 0.7.1 |

## Host evidence

The default global host remains Herdr `0.7.1`, while this plugin requires `0.7.4+`. A historical isolated Homebrew Herdr `0.7.4` run exists, but its raw logs, exact commit, timestamp, and schema capture are not committed here. Treat the host lifecycle as an external rerun gate, not as current repository-contained proof. The current local test suite uses live-shaped fixtures and rejects incompatible hosts explicitly.

## Remaining release action

The Linux host comparison, supported-host lifecycle, and real-host runtime memory measurements still require external runs. They are listed in [release-checklist.md](release-checklist.md).

The requirement-to-file mapping is maintained in [implementation-map.md](implementation-map.md); supported-host commands are in [manual-test-matrix.md](manual-test-matrix.md).

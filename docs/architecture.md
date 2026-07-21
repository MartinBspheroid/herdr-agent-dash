# Architecture

The board is divided into transport, normalized session state, domain projection, enrichment, commands, and rendering.

```text
Herdr socket/CLI -> HerdrTransport -> LiveSessionStore -> AgentProjector -> AgentBoardStore -> OpenTUI
                                                        ^       ^
                                                        |       |
                                                   GitEnricher ActivityEngine
```

At process start, a bounded five-minute display-card cache seeds `AgentBoardStore` before the live session handshake. It contains sanitized presentation fields only and is never considered live. Preferences and the startup cache use separate atomic files under `HERDR_PLUGIN_CONFIG_DIR`; neither stores terminal output, prompts, raw protocol payloads, or native session identifiers.

The UI consumes `AgentBoardStore` and `CommandService` only. It does not import socket, protocol, filesystem, or Git implementation modules. `LiveSessionStore` acknowledges event subscription before marking the stream live, reconciles with a fresh snapshot, and applies event updates without whole-agent polling. During disconnect it keeps the last valid data and marks the board stale; the CLI fallback stops monitoring rather than polling snapshots.

Git runs are argv arrays through `ProcessRunner`, have a 1.5 second default timeout with hard escalation, 64 KiB output bound, four-process concurrency limit, bounded cache/inflight deduplication, explicit invalidation generations, and failure-aware status parsing. Git never changes a repository.

Transport requests have deadlines, strict response envelopes, bounded frames, bounded event backlog, and reconnect buffer reset. Session refreshes are generation-guarded; malformed snapshots are rejected while the last valid snapshot remains available. Connection states distinguish live, stale, failed, and incompatible host behavior.

## Stable identity

Cards prefer Herdr `terminal_id`, then native session source/value, then pane ID. Focus commands resolve the current pane/tab/workspace immediately before the request and retry once after a `not_found` refresh. The UI never caches a pane ID as the durable identity.

## Module rules

- `src/contracts` owns shared interfaces and normalized records.
- `src/herdr` owns protocol shape and transport details.
- `src/git` owns process execution input and porcelain parsing.
- `src/activity` owns evidence collection and provenance.
- `src/domain` owns projection, filtering, searching, and ordering.
- `src/ui` owns presentation and keyboard behavior.
- `src/app` wires dependencies and commands.
- `src/cache` owns the bounded, sanitized startup display cache.
- `docs/adversarial-review-todo.md` is the current hardening checklist; close items only with focused regression tests and the acceptance gate.

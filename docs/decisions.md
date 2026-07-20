# Architecture decisions

## ADR-001: socket-first transport

The board uses Herdr's local NDJSON socket for snapshots and long-lived events, with a CLI fallback for one-shot operations. The UI and domain layers never know which transport is active.

## ADR-002: stable agent identity

Terminal identity or explicit native session identity is preferred over pane identity because panes can move. Current target IDs are resolved immediately before commands.

## ADR-003: evidence-labelled activity

Activity is a bundle of source-labelled signals rather than one guessed task field. This prevents stale prompts and raw output from being presented as current progress.

## ADR-004: Git is read-only enrichment

Git calls use argument arrays, timeouts, bounded output, cache, deduplication, and concurrency limits. No checkout, reset, clean, fetch, pull, commit, push, or diff is performed in P0.

## ADR-005: subscription acknowledgement before live state

The transport acknowledges `events.subscribe` before returning its event iterable. The session store then requests a reconciliation snapshot before setting `LIVE`. A CLI-only fallback remains manually refreshable and does not emulate a live stream with periodic snapshots.

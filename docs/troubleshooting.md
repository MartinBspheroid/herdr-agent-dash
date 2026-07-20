# Troubleshooting

## Herdr version warning

The manifest requires Herdr 0.7.4+. Check with:

```bash
herdr --version
```

Upgrade Herdr before relying on socket event and popup behavior. If the host is below the minimum, the board reports `INCOMPATIBLE — update Herdr` and does not present the result as a valid empty fleet.

## Stale board

`STALE — reconnecting` means the last synchronized rows are still visible but the event transport is not healthy. Press `r` to request a snapshot. `FAILED — retry with r` means no valid snapshot is available. If the socket path is wrong, inspect `HERDR_SOCKET_PATH` and the path reported by Herdr's environment.

## Git unavailable or slow

The board renders the agent row before Git enrichment. `not a Git repository` is neutral; `error (timeout)` is scoped to that directory. Git commands are read-only, argv-based, bounded, and retried only through the watchdog or an explicit `g`/`r` action.

## Focus failed

The command resolves stable identity to current pane IDs immediately before focusing. A stale target triggers one snapshot and retry. If the identity is no longer unique or the agent closed, the board stays open and shows the failure.

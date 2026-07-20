# Herdr Agent Board

Herdr Agent Board is a local, keyboard-first Herdr plugin for scanning active coding agents, their semantic state, effective working directory, Git context, and source-labelled activity.

## Requirements

- Bun 1.3+
- TypeScript 7+
- Herdr 0.7.4 or newer
- macOS or Linux

The automated unit and integration checks do not require a live Herdr host. Runtime use does: an older or unavailable host produces an explicit incompatible/failed state and does not masquerade as an empty board.

## Development

```bash
bun install
bun run check
bun run privacy:smoke
bun run smoke
bun run docs:smoke
bun run build
bun run plugin:smoke -- --open  # supported Herdr host only
```

Start one runtime surface at a time after linking the checkout:

```bash
herdr plugin link .
bun run start:popup
# In another terminal, use `bun run start:tab` when the tab surface is needed.
```

The plugin reads `HERDR_SOCKET_PATH`, `HERDR_BIN_PATH`, and `HERDR_PLUGIN_CONFIG_DIR` from the host environment. With a socket it uses bounded NDJSON snapshot/event synchronization; otherwise it uses the bounded CLI fallback for one-shot requests. `HERDR_SOCKET_PATH` must point at the supported host socket when running the live board.

## Install/link

Link the checkout with `herdr plugin link .`, then open either the `dev.agent-board.open` popup action or the `open-tab` action described in [herdr-plugin.toml](herdr-plugin.toml). Remove the linked plugin with `herdr plugin unlink dev.agent-board`.

## Activity semantics

The board never labels a latest human prompt as current progress by default. Explicit metadata is a current signal, a terminal title is derived evidence, a prompt is a last request, repository changes are deterministic Git evidence, and terminal output is raw evidence loaded only with `o`. See [docs/activity-semantics.md](docs/activity-semantics.md).

## Privacy and safety

P0 makes no network requests, persists no raw terminal/transcript text, uses argv-only subprocesses, bounds all external text, strips terminal control sequences, and enables no provider-native transcript adapters. Git errors remain local to one row. See [docs/troubleshooting.md](docs/troubleshooting.md) for stale data and host-version diagnostics.

## Configuration

Configuration is optional. If `HERDR_PLUGIN_CONFIG_DIR` is set, the board reads `config.json` there. Invalid fields fall back independently to safe defaults and identify their JSON path. See [docs/configuration.md](docs/configuration.md).

See [docs/manual-test-matrix.md](docs/manual-test-matrix.md) for supported-host verification, [docs/marketplace.md](docs/marketplace.md) for installation metadata, and [docs/release-report.md](docs/release-report.md) for evidence status.

## Verification

```bash
bun run format:check
bun run lint
bun run typecheck
bun test
bun run privacy:smoke
bun run smoke
bun run docs:smoke
bun run build
```

The automated suite covers protocol normalization, malformed-record isolation, bounded transport, refresh races, event reduction, stable identity, activity provenance, Git failure semantics, control-sequence safety, process deadlines, and config validation. The release smoke matrix remains host-dependent; use the checklist in [docs/release-checklist.md](docs/release-checklist.md) for Herdr 0.7.4+ on macOS and Linux.

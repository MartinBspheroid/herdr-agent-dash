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

Board shortcuts: `u` shows or hides UNKNOWN rows, `s` toggles the whole Herdr popup between expanded and compact outer dimensions, `p` switches the popup between horizontal and vertical shapes, and `t` cycles sorting. These display preferences persist between sessions. In a tab, `s` and `p` save the next popup geometry without resizing the tab.

Herdr 0.7.4 does not expose a live popup move or resize API. The board applies `s` and `p` through the supported lifecycle: save the preference, close the active popup, and reopen it with explicit `plugin.pane.open` dimensions. Herdr centers the session-modal popup; arbitrary popup coordinates are not currently supported.

## Install the plugin

Herdr 0.7.4 or newer is required:

```bash
herdr --version
```

### Install from GitHub

Install the published plugin directly from its public GitHub repository:

```bash
herdr plugin install MartinBspheroid/herdr-agent-dash --yes
```

Inspect the installed plugin and open the popup:

```bash
herdr plugin list --plugin dev.agent-board --json
herdr plugin action invoke open --plugin dev.agent-board
```

Use the tab action when you want the board in a persistent Herdr tab:

```bash
herdr plugin action invoke open-tab --plugin dev.agent-board
```

The repository is tagged with the `herdr-plugin` GitHub topic and can also be discovered through the [Herdr plugin marketplace](https://herdr.dev/plugins/). Marketplace indexing is automatic and may take a short time after a repository or topic change.

### Link a local checkout

For development, link the checkout instead of installing a managed GitHub copy:

```bash
herdr plugin link .
herdr plugin list --plugin dev.agent-board --json
herdr plugin action invoke open --plugin dev.agent-board
```

Unlink it when finished:

```bash
herdr plugin unlink dev.agent-board
```

`herdr plugin link` leaves the checkout in place. `herdr plugin uninstall` removes a Herdr-managed GitHub installation and its managed checkout.

## Open with a keybinding

Herdr can invoke the installed plugin action from `~/.config/herdr/config.toml`. Add this custom command to bind `Ctrl+B`, then `Shift+O` to the Agent Board popup:

```toml
[[keys.command]]
key = "prefix+shift+o"
type = "plugin_action"
command = "dev.agent-board.open"
description = "Open Agent Board"
```

Reload the running Herdr server after saving the file:

```bash
herdr server reload-config
```

`prefix+o` is already used by Herdr's notification target binding, so the example uses `prefix+shift+o`. See Herdr's [configuration guide](https://herdr.dev/docs/configuration/) for other key syntax and custom command options.

## Activity semantics

The board never labels a latest human prompt as current progress by default. Explicit metadata is a current signal, a terminal title is derived evidence, a prompt is a last request, repository changes are deterministic Git evidence, and terminal output is raw evidence loaded only with `o`. See [docs/activity-semantics.md](docs/activity-semantics.md).

## Privacy and safety

P0 makes no network requests, persists no raw terminal/transcript text, uses argv-only subprocesses, bounds all external text, strips terminal control sequences, and enables no provider-native transcript adapters. A short-lived startup cache stores only sanitized display-card fields and always renders them as stale until live synchronization replaces them. Git errors remain local to one row. See [docs/troubleshooting.md](docs/troubleshooting.md) for stale data and host-version diagnostics.

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

# Supported-host manual test matrix

Run this matrix from a clean checkout on each supported operating system after installing Herdr `0.7.4+`.

## Common setup

```bash
herdr --version
bun install --frozen-lockfile
bun run check
bun run privacy:smoke
```

The version command must report `0.7.4` or newer. The privacy smoke must pass before host actions are tested.

For an isolated target host, record the binary and socket explicitly before
linking the plugin:

```bash
export HERDR_BIN_PATH="$(command -v herdr)"
export HERDR_SOCKET_PATH="${HERDR_SOCKET_PATH:?Set this to the socket exported by the target Herdr session}"
# If this checkout is already linked, remove that link before relinking.
herdr plugin unlink dev.agent-board
herdr plugin link .
printf 'HERDR_BIN_PATH=%s\nHERDR_SOCKET_PATH=%s\n' "$HERDR_BIN_PATH" "$HERDR_SOCKET_PATH"
```

If the binary or socket changes, unlink and link again before rerunning the
smoke. The smoke must finish by removing the link and any opened panes.

## macOS and Linux

| Surface          | Command                                                                                  | Expected result                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Link and inspect | `bun run plugin:smoke`                                                                   | Links the checkout, lists `dev.agent-board`, lists actions, and unlinks cleanly.                     |
| Popup            | `bun run plugin:smoke -- --open`                                                         | Opens the popup action, closes it through `popup.close`, opens the tab pane, closes it, and unlinks. |
| Persistent tab   | `herdr plugin pane open --plugin dev.agent-board --entrypoint board-tab --placement tab` | A normal Herdr tab opens without changing popup state. Close the returned pane ID after inspection.  |
| Runtime          | `bun run start:popup` and `bun run start:tab`                                            | The board renders, reports connection health, and exits cleanly with Ctrl+C.                         |

Record the Herdr version, OS version, popup result, tab result, and cleanup result in the release report. A failed host command must include its exact output and must not be marked as a pass.

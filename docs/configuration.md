# Configuration

Configuration is optional and defaults are safe without a file. Set `HERDR_PLUGIN_CONFIG_DIR` to the directory supplied by Herdr; the board reads `config.json` from that directory.

```json
{
  "view": {
    "defaultMode": "popup",
    "defaultSort": "attention",
    "visibleColumns": ["state", "agent", "location", "signal", "repository", "branch"],
    "compactPathSegments": 3,
    "showDetail": true,
    "showUnknown": true,
    "compactPopup": false,
    "popupOrientation": "horizontal"
  },
  "git": {
    "enabled": true,
    "watchdogMs": 15000,
    "commandTimeoutMs": 1500,
    "maxConcurrency": 4,
    "includeUntracked": true
  },
  "activity": {
    "metadataTokens": ["summary", "task", "phase", "custom_status", "state_message"],
    "terminalTitle": true,
    "terminalPreviewLines": 30,
    "terminalPreviewMaxBytes": 8192,
    "nativeAdapters": []
  }
}
```

Invalid fields retain their individual defaults and produce a diagnostic with the exact field path. `privacy.networkAccess`, `privacy.persistTimeline`, and `privacy.persistTerminalOutput` are always false in P0; raw terminal and transcript persistence are disabled and cannot be enabled by configuration.

The board updates `view.showUnknown`, `view.compactPopup`, and `view.popupOrientation` when `u`, `s`, or `p` is pressed. Writes are atomic and preserve unrelated configuration fields. `popupOrientation` accepts `horizontal` or `vertical`. Compact horizontal popups use a fixed `120 × 32` outer-cell size; compact vertical popups use `80 × 48`. Expanded horizontal and vertical popups use `90% × 85%` and `65% × 90%`, respectively.

Herdr 0.7.4 accepts popup dimensions only when opening a popup. A popup is not a pane and cannot be passed to `pane.resize` or `pane.move`, so the board applies a geometry change by replacing the active popup. Herdr controls popup centering and currently exposes no arbitrary popup-position coordinates. Legacy `view.compact` and `view.detailPosition` values are read as migration fallbacks but new writes use the popup-specific names.

A separate `startup-cache.json` beside `config.json` stores at most 200 sanitized display cards for five minutes. It accelerates first paint while Herdr synchronizes. Cached rows are always marked stale and exclude raw snapshots, terminal output, prompts, native session identifiers, and activity history. Live synchronization replaces them immediately.

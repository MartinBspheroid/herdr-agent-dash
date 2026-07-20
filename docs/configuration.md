# Configuration

Configuration is optional and defaults are safe without a file. Set `HERDR_PLUGIN_CONFIG_DIR` to the directory supplied by Herdr; the board reads `config.json` from that directory.

```json
{
  "view": {
    "defaultMode": "popup",
    "defaultSort": "attention",
    "visibleColumns": ["state", "agent", "location", "signal", "repository", "branch"],
    "compactPathSegments": 3,
    "showDetail": true
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

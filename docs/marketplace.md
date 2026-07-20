# Marketplace metadata and installation

The plugin metadata is declared in [herdr-plugin.toml](../herdr-plugin.toml):

- marketplace topic: `herdr-plugin`;
- plugin ID: `dev.agent-board`;
- supported platforms: macOS and Linux;
- minimum Herdr version: `0.7.4`;
- popup action: `open`;
- persistent tab action: `open-tab`.

For local development, link the checkout with `herdr plugin link .`. Inspect it with `herdr plugin list --plugin dev.agent-board --json`, invoke the popup with `herdr plugin action invoke open --plugin dev.agent-board`, and remove it with `herdr plugin unlink dev.agent-board`. The supported-host lifecycle smoke is available as `bun run plugin:smoke -- --open`.

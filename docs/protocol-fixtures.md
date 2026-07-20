# Protocol fixture provenance

The normalized fixture in [tests/fixtures/herdr.ts](../tests/fixtures/herdr.ts) represents the Herdr `0.7.4` socket contract used by the board: `session.snapshot`, workspace/tab/pane/agent records, the live host fields `version: "0.7.4"` and `protocol: 16`, structured metadata, and pane status events.

On a supported target host, regenerate the authoritative schema and then update the fixture deliberately:

```bash
herdr --version
herdr api schema --json
bun run check
```

The target schema was retrieved from an isolated Herdr `0.7.4` host during validation. The repository keeps hand-curated fixtures rather than generated schema files. Unknown fields remain covered by `tests/unit/protocol.test.ts`.

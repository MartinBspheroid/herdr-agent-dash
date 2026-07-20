# Activity semantics

Every activity value has a source, semantic meaning, confidence, source label, and stale flag.

| Display                | Source                                 | Meaning                                                   |
| ---------------------- | -------------------------------------- | --------------------------------------------------------- |
| Reported metadata      | Herdr metadata token such as `summary` | Current signal, explicit                                  |
| Reported state message | Public Herdr semantic message          | Current signal, explicit                                  |
| Terminal title         | `terminal_title_stripped`              | Current signal, derived                                   |
| Last request           | Opt-in native adapter only             | Last human request, never current progress by default     |
| Repository changes     | Git status                             | Deterministic repository evidence, not narrative progress |
| Recent terminal output | On-demand `o` action                   | Raw evidence, bounded and sanitized                       |

When no evidence exists the UI says `No reported activity`. It does not infer work from a repository name, branch, filename, or arbitrary terminal text. Provider adapters are intentionally absent from P0 and must remain opt-in, version-aware, narrow in scope, and failure-isolated when added.

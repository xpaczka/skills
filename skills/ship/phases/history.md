# History

Answers questions about past features from their records. Read-only. Entry: `/ship history [query] [--all]`.

Records live in `SHIP_HOME/repos/<key>/records/*.md`; `--all` searches every repo under `SHIP_HOME/repos/`.

- **No query**: list the records, newest `completed` first, one line each: ID, title, date, the first line of **Goal**.
- **A term or ID**: search the records case-insensitively and show each match with its record ID and section.
- **A question** ("why did we…", "what did ABC-118 decide about…"): read the matching records and answer from their **Decisions**, **Deviations** and **Notes**, citing record IDs. When no record covers it, say so; never fill the gap from memory.

No records yet → say so, and that `/ship` writes one when a feature finishes.

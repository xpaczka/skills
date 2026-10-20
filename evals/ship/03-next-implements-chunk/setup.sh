make_repo
make_ship_home
write_state implementing << MD
$DECISIONS

## Plan

Pure serializer first, then dates, then a CLI command. Every chunk runs \`node --test\`.

## Chunks

### 1. CSV serializer for invoice lines
- status: pending
- kind: plan
- goal: \`toCsv(invoices)\` in \`src/csv.mjs\` returns a header row plus one row per invoice line (id, issue date as ISO for now, description, amount as a two-place decimal string).
- files: \`src/csv.mjs\`, \`test/csv.test.mjs\`
- acceptance: \`node --test\`
- tdd: no — small pure function; tests written alongside
- executor: main — core logic the user will read closely
- commit_message: \`feat(ABC-123): serialize invoice lines to CSV\`

### 2. Locale-aware dates
- status: pending
- kind: plan
- goal: format issue dates with \`Intl.DateTimeFormat(locale)\`.

### 3. RFC 4180 quoting
- status: pending
- kind: plan
- goal: quote fields containing commas, quotes or newlines; double inner quotes.

## Metrics

\`\`\`json
{ "chunks_planned": 2, "chunks_shipped": 0, "amendments": 0, "verify_failures": {}, "rework_lines": {}, "user_turns": {}, "review": { "findings": 0, "accepted": 0, "by_axis": {}, "by_severity": {} } }
\`\`\`

## Timeline

- implementing 2026-10-20T10:00:00Z
MD

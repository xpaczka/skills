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
- tdd: no (small pure function; tests written alongside)
- commit_message: \`feat(ABC-123): serialize invoice lines to CSV\`

### 2. Locale-aware dates
- status: pending
- kind: plan
- goal: format issue dates with \`Intl.DateTimeFormat(locale)\`.

### 3. RFC 4180 quoting
- status: pending
- kind: plan
- goal: quote fields containing commas, quotes or newlines; double inner quotes.
MD

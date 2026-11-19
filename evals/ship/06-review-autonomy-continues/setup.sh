make_repo
make_ship_home
AUTONOMY=review REVIEW_ROUNDS=1 write_state implementing << MD
$DECISIONS

## Plan

Pure serializer, then quoting. Every chunk runs \`node --test\`.

## Chunks

### 1. CSV serializer for invoice lines
- status: pending
- kind: review-fix
- goal: R1.1, \`toCsv(invoices)\` in \`src/csv.mjs\` returns a header row plus one row per invoice line (id, issue date via \`Intl.DateTimeFormat(locale)\`, description, amount as a two-place decimal string); \`locale\` defaults to \`en-US\`.
- files: \`src/csv.mjs\`, \`test/csv.test.mjs\`
- acceptance: \`node --test\`
- tdd: no (small pure function; tests written alongside)
- depends_on: []
- commit_message: \`fix(ABC-123): serialize invoice lines to CSV\`
- commit:

### 2. RFC 4180 quoting
- status: pending
- kind: review-fix
- goal: R1.2, \`toCsv\` quotes fields containing commas, quotes or newlines, doubling inner quotes.
- files: \`src/csv.mjs\`, \`test/csv.test.mjs\`
- acceptance: \`node --test\`
- tdd: no (one rule; tests written alongside)
- depends_on: [1]
- commit_message: \`fix(ABC-123): quote CSV fields per RFC 4180\`
- commit:

## Review

### Round 1
- R1.1 [spec · blocker] \`src/csv.mjs\`: no serializer exists → add \`toCsv\` (accepted → chunk 1)
- R1.2 [spec · high] \`src/csv.mjs\`: fields are not quoted → quote per RFC 4180 (accepted → chunk 2)
MD

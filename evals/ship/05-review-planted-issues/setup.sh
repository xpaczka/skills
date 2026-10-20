make_repo
make_ship_home
# Feature commits with two planted problems: ISO dates contradict the locale decision (spec),
# and per-currency special-casing duplicated across branches (quality).
cat > src/csv.mjs << 'JS'
export function toCsv(invoices, currency) {
  const rows = ["id,date,description,amount"]
  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      let amount
      if (currency === "EUR") {
        if (line.cents < 0) {
          amount = "-" + (Math.abs(line.cents) / 100).toFixed(2)
        } else {
          amount = (line.cents / 100).toFixed(2)
        }
      } else if (currency === "USD") {
        if (line.cents < 0) {
          amount = "-" + (Math.abs(line.cents) / 100).toFixed(2)
        } else {
          amount = (line.cents / 100).toFixed(2)
        }
      } else if (currency === "PLN") {
        if (line.cents < 0) {
          amount = "-" + (Math.abs(line.cents) / 100).toFixed(2)
        } else {
          amount = (line.cents / 100).toFixed(2)
        }
      } else {
        amount = String(line.cents / 100)
      }
      const description = line.description.includes(",") ? `"${line.description}"` : line.description
      rows.push([invoice.id, invoice.issued.toISOString().slice(0, 10), description, amount].join(","))
    }
  }
  return rows.join("\n")
}
JS
cat > test/csv.test.mjs << 'JS'
import assert from "node:assert/strict"
import { test } from "node:test"
import { toCsv } from "../src/csv.mjs"

test("toCsv writes one row per line", () => {
  const csv = toCsv([{ id: "A1", issued: new Date("2026-01-02"), lines: [{ description: "Pens", cents: 250 }] }], "EUR")
  assert.equal(csv, "id,date,description,amount\nA1,2026-01-02,Pens,2.50")
})
JS
git add -A && git commit -qm "feat(ABC-123): serialize invoice lines to CSV"
write_state reviewing << MD
$DECISIONS

## Plan

Single chunk: \`toCsv\` in \`src/csv.mjs\` with tests.

## Chunks

### 1. CSV serializer
- status: committed

## Metrics

\`\`\`json
{ "chunks_planned": 1, "chunks_shipped": 1, "amendments": 0, "verify_failures": {}, "rework_lines": {}, "user_turns": {}, "review": { "findings": 0, "accepted": 0, "by_axis": {}, "by_severity": {} } }
\`\`\`

## Timeline

- reviewing 2026-10-20T11:00:00Z
MD

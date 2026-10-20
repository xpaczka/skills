make_repo
make_ship_home
printf 'export const toCsv = () => ""\n' > src/csv.mjs
git add -A && git commit -qm "feat(ABC-123): add CSV serializer"
printf 'export const toCsv = (rows) => rows.join("\\n")\n' > src/csv.mjs   # uncommitted chunk 2 work
write_state implementing << 'MD'
## Chunks

### 1. CSV serializer
- status: handed-off
- handoff_snapshot: 0000000

### 2. Locale-aware dates
- status: pending

## Metrics

```json
{ "chunks_planned": 2, "chunks_shipped": 0, "amendments": 0, "verify_failures": {}, "rework_lines": {}, "user_turns": {}, "review": { "findings": 0, "accepted": 0, "by_axis": {}, "by_severity": {} } }
```

## Timeline

- implementing 2026-10-20T10:00:00Z
MD

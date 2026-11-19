make_repo
make_ship_home
printf 'export const toCsv = () => ""\n' > src/csv.mjs
git add -A && git commit -qm "feat(ABC-123): add CSV serializer"
printf 'export const toCsv = (rows) => rows.join("\\n")\n' > src/csv.mjs   # uncommitted chunk 2 work
write_state implementing << 'MD'
## Chunks

### 1. CSV serializer
- status: handed-off

### 2. Locale-aware dates
- status: pending
MD

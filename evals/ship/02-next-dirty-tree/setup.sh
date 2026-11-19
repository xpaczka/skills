make_repo
make_ship_home
printf 'export const toCsv = () => ""\n' > src/csv.mjs
git add -A && git commit -qm "feat(ABC-123): add CSV serializer"
printf 'export const toCsv = (rows) => rows.join("\\n")\n' > src/csv.mjs   # the handed-off fix, plus the user's own edits
AUTONOMY=review REVIEW_ROUNDS=1 write_state implementing << 'MD'
## Chunks

### 1. CSV serializer
- status: committed
- commit: 1a2b3c4

### 2. Join rows with newlines
- status: handed-off
- kind: review-fix
- goal: R1.1, rows are joined with newlines.
- commit_message: `fix(ABC-123): join CSV rows with newlines`

## Review

### Round 1
- R1.1 [spec · blocker] `src/csv.mjs:1`: rows are not joined → join them with newlines (accepted → chunk 2)
MD

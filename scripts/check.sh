#!/usr/bin/env bash
# Validate every skill (frontmatter, line budgets), whitespace rules, plugin manifest. Exits 1 on any failure.
set -euo pipefail
cd "$(dirname "$0")/.."

SKILL_MAX=120
FILE_MAX=150
errors=0

fail() { echo "✘ $*" >&2; errors=$((errors + 1)); }

# Prints the value of <key> from the YAML frontmatter of <file>, or nothing.
frontmatter_value() {
  awk -v key="$2" '
    NR == 1 { if ($0 != "---") exit; next }
    $0 == "---" { exit }
    index($0, key ":") == 1 { sub("^" key ":[[:space:]]*", ""); print; exit }
  ' "$1"
}

shopt -s nullglob
dirs=(skills/*/)
[ ${#dirs[@]} -eq 0 ] && echo "· no skills yet"

for dir in "${dirs[@]}"; do
  dir=${dir%/}
  name=$(basename "$dir")
  before=$errors
  skill="$dir/SKILL.md"

  if [ ! -f "$skill" ]; then
    fail "$dir: missing SKILL.md"
    continue
  fi

  [ "$(frontmatter_value "$skill" name)" = "$name" ] || fail "$skill: frontmatter name must be '$name'"
  [ -n "$(frontmatter_value "$skill" description)" ] || fail "$skill: frontmatter description is empty"

  lines=$(($(wc -l < "$skill")))
  [ "$lines" -le "$SKILL_MAX" ] || fail "$skill: $lines lines (budget $SKILL_MAX)"

  while IFS= read -r file; do
    lines=$(($(wc -l < "$file")))
    [ "$lines" -le "$FILE_MAX" ] || fail "$file: $lines lines (budget $FILE_MAX)"
  done < <(find "$dir" -name '*.md' ! -path "$skill")

  if [ "$(frontmatter_value "$skill" disable-model-invocation)" = "true" ] \
    && ! grep -qs 'allow_implicit_invocation: false' "$dir/agents/openai.yaml"; then
    fail "$dir: user-invoked skill needs agents/openai.yaml with allow_implicit_invocation: false"
  fi

  [ "$errors" -eq "$before" ] && echo "✔ $name"
done

# Whitespace rules from .editorconfig, checked without extra tools.
while IFS= read -r file; do
  [ -f "$file" ] || continue
  grep -q $'\r' "$file" && fail "$file: CRLF line endings (use LF)"
  [ -s "$file" ] && [ -n "$(tail -c 1 "$file")" ] && fail "$file: missing final newline"
  line=$(grep -n $'^\t' "$file" | head -1 | cut -d: -f1 || true)
  [ -z "$line" ] || fail "$file:$line: tab indentation (use 2 spaces)"
  case "$file" in *.md) continue ;; esac
  line=$(grep -nE '[[:blank:]]+$' "$file" | head -1 | cut -d: -f1 || true)
  [ -z "$line" ] || fail "$file:$line: trailing whitespace"
done < <(git ls-files --cached --others --exclude-standard)

if command -v claude > /dev/null; then
  claude plugin validate . || fail "claude plugin validate"
else
  echo "· claude CLI not found; skipped plugin validation"
fi

[ "$errors" -eq 0 ] || { echo "$errors problem(s)" >&2; exit 1; }

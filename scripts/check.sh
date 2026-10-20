#!/usr/bin/env bash
# Validate every skill (frontmatter, line budgets, file layout, openai.yaml), whitespace rules, em-dash and cross-skill link bans, plugin manifest. Exits 1 on any failure.
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

# Prints the value of <parent>.<key> from a YAML <file> with 2-space indentation, unquoted and without a trailing comment, or nothing.
yaml_value() {
  awk -v parent="$2" -v key="$3" '
    /^[^[:space:]#]/ { inside = (index($0, parent ":") == 1); next }
    inside && index($0, "  " key ":") == 1 {
      v = $0; sub("^  " key ":[[:space:]]*", "", v); q = substr(v, 1, 1)
      if (q == "\"" || q == "\047") { v = substr(v, 2); sub(q ".*", "", v) }
      else sub(/[[:space:]]*(#.*)?$/, "", v)
      print v; exit
    }
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

  # Reference files sit flat beside SKILL.md with UPPERCASE names; the only subfolders are scripts/ and agents/.
  while IFS= read -r sub; do
    case "${sub##*/}" in scripts | agents) ;; *) fail "$sub: only scripts/ and agents/ may sit in a skill folder" ;; esac
  done < <(find "$dir" -mindepth 1 -maxdepth 1 -type d)
  while IFS= read -r file; do
    lines=$(($(wc -l < "$file")))
    [ "$lines" -le "$FILE_MAX" ] || fail "$file: $lines lines (budget $FILE_MAX)"
    rel=${file#"$dir"/}
    if [[ "$rel" == */* ]]; then
      fail "$file: .md files belong at the skill root, not in a subfolder"
    elif ! [[ "$rel" =~ ^[A-Z0-9-]+\.md$ ]]; then
      fail "$file: reference file names are UPPERCASE (e.g. PLAN.md, STATE-FORMAT.md)"
    fi
  done < <(find "$dir" -name '*.md' ! -path "$skill")

  openai="$dir/agents/openai.yaml"
  if [ ! -f "$openai" ]; then
    fail "$dir: missing agents/openai.yaml"
  else
    [ -n "$(yaml_value "$openai" interface display_name)" ] || fail "$openai: interface.display_name is empty"
    [ -n "$(yaml_value "$openai" interface short_description)" ] || fail "$openai: interface.short_description is empty"
    [ "$(frontmatter_value "$skill" disable-model-invocation)" = "true" ] && claude_user=yes || claude_user=no
    [ "$(yaml_value "$openai" policy allow_implicit_invocation)" = "false" ] && codex_user=yes || codex_user=no
    [ "$claude_user" = "$codex_user" ] \
      || fail "$openai: user-invoked in Claude Code: $claude_user, in Codex: $codex_user (set disable-model-invocation: true and policy.allow_implicit_invocation: false together)"
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

# Content bans over tracked and untracked files. The em-dash is matched by bytes so this script holds none.
while IFS= read -r hit; do
  fail "$hit: em-dash (rewrite with a comma, colon, period or parentheses)"
done < <(git grep -nI --untracked $'\xe2\x80\x94' -- ':!evals/*/results/' | cut -d: -f1,2 || true)
while IFS= read -r hit; do
  fail "$hit: links must stay inside the skill's folder (found '](../')"
done < <(git grep -nI --untracked -F '](../' -- skills/ | cut -d: -f1,2 || true)

scripts/sync-eval-fixtures.sh --check || fail "eval scaffolds out of date"

if command -v claude > /dev/null; then
  claude plugin validate . || fail "claude plugin validate"
else
  echo "· claude CLI not found; skipped plugin validation"
fi

[ "$errors" -eq 0 ] || { echo "$errors problem(s)" >&2; exit 1; }

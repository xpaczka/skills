#!/bin/sh
# Print the context for resolving an in-progress merge, as key=value lines and one block per file.
# Usage: context.sh conflicts
# One call replaces the per-file status, blob and history lookups an agent would otherwise make.
set -eu

usage() { echo "usage: context.sh conflicts" >&2; exit 2; }

# Prints the blob ID of <file> at index <stage> (1 base, 2 ours, 3 theirs), or "none".
blob() {
  id=$(git ls-files -u -- "$1" | awk -v s="$2" '$3 == s { print $2; exit }')
  echo "${id:-none}"
}

# Prints the commits in <range> that touched <file>, one indented line each, or "  none".
commits() {
  out=$(git log --format='  %h %s' "$1" -- "$2")
  echo "${out:-  none}"
}

conflicts() {
  git rev-parse -q --verify MERGE_HEAD > /dev/null || { echo "no merge in progress" >&2; exit 1; }
  ours=$(git rev-parse --short HEAD)
  theirs=$(git rev-parse --short MERGE_HEAD)
  base=$(git merge-base HEAD MERGE_HEAD)
  files=$(git -c core.quotePath=false diff --name-only --diff-filter=U)

  echo "merge_base=$(git rev-parse --short "$base")"
  echo "ours=$ours (HEAD, $(git branch --show-current))"
  echo "theirs=$theirs ($(head -n 1 "$(git rev-parse --git-path MERGE_MSG)"))"
  if [ -z "$files" ]; then
    echo "conflicts=0"
    return
  fi
  echo "conflicts=$(printf '%s\n' "$files" | wc -l | tr -d ' ')"

  printf '%s\n' "$files" | while IFS= read -r file; do
    status=$(git -c core.quotePath=false status --porcelain -- "$file" | cut -c1-2)
    echo
    echo "file=$file"
    echo "status=$status"
    echo "blobs: base=$(blob "$file" 1) ours=$(blob "$file" 2) theirs=$(blob "$file" 3)"
    echo "ours_commits:"
    commits "$base..HEAD" "$file"
    echo "theirs_commits:"
    commits "$base..MERGE_HEAD" "$file"
  done
}

case "${1:-}" in
  conflicts) conflicts ;;
  *) usage ;;
esac

#!/usr/bin/env bash
# Print the hash of an unreferenced commit capturing the whole working tree:
# tracked, modified and new untracked files (ignored files excluded).
# A throwaway index keeps the user's index, branches and stash untouched.
set -euo pipefail

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export GIT_INDEX_FILE="$tmp/index"

cd "$(git rev-parse --show-toplevel)"
git read-tree HEAD
git add -A
git commit-tree "$(git write-tree)" -p HEAD -m "ship handoff snapshot"

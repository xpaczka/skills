#!/usr/bin/env bash
# Print the hash of an unreferenced commit capturing the whole working tree:
# tracked, modified and new untracked files (ignored files excluded).
# A throwaway index inside .git keeps the user's index, branches and stash untouched,
# and needs no system temp dir (sandboxed agents often cannot write there).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export GIT_INDEX_FILE="$(git rev-parse --absolute-git-dir)/ship-snapshot-index.$$"
trap 'rm -f "$GIT_INDEX_FILE"' EXIT

git read-tree HEAD
git add -A
git commit-tree "$(git write-tree)" -p HEAD -m "ship handoff snapshot"

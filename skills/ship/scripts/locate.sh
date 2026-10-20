#!/usr/bin/env bash
# Print where ship's files for the current repo and branch live, as key=value lines.
# One call replaces the separate lookups an agent would otherwise make.
set -euo pipefail

home=${SHIP_HOME:-$HOME/.agents/ship}
root=$(git rev-parse --show-toplevel)
remote=$(git remote get-url origin 2> /dev/null || true)
if [ -n "$remote" ]; then
  key=$(printf '%s' "$remote" | sed -E 's#\.git$##; s#^.*[:/]([^/]+)/([^/]+)$#\1-\2#')
else
  key=$(basename "$root")
fi
key=$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')
branch=$(git branch --show-current)
repo_dir="$home/repos/$key"
state="$repo_dir/work/${branch//\//-}.md"

status() { if [ -f "$1" ]; then echo exists; else echo missing; fi; }

echo "ship_home=$home"
echo "repo_root=$root"
echo "repo_key=$key"
echo "branch=${branch:-(detached HEAD)}"
echo "global_config=$home/config.yml ($(status "$home/config.yml"))"
echo "repo_config=$repo_dir/config.yml ($(status "$repo_dir/config.yml"))"
echo "state_file=$state ($(status "$state"))"
if [ -f "$state" ]; then
  echo "phase=$(sed -n 's/^phase:[[:space:]]*\([a-z]*\).*/\1/p' "$state" | head -1)"
fi
echo "records=$repo_dir/records"

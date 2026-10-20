#!/usr/bin/env bash
# Symlink every skills/* into ~/.agents/skills and each installed agent's skill dir, so edits apply live.
# Usage: link-dev.sh [--undo]
# Never overwrites a real install: an existing non-symlink (e.g. from the skills CLI) is reported and skipped.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
canonical="$HOME/.agents/skills"
agent_dirs=("$HOME/.claude/skills" "$HOME/.cursor/skills")

link_skill() {
  local name=$1 dest="$canonical/$1" agent_dir link
  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$repo/skills/$name" ]; then
    :
  elif [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "· skip $dest: already exists; remove it (npx skills remove $name -g) to dev-link"
    return
  else
    mkdir -p "$canonical"
    ln -s "$repo/skills/$name" "$dest"
  fi

  for agent_dir in "${agent_dirs[@]}"; do
    [ -d "$agent_dir" ] || continue
    link="$agent_dir/$name"
    if [ -L "$link" ] && [ "$(readlink "$link")" = "../../.agents/skills/$name" ]; then
      continue
    elif [ -e "$link" ] || [ -L "$link" ]; then
      echo "· skip $link: already exists"
    else
      ln -s "../../.agents/skills/$name" "$link"
    fi
  done
  echo "✔ linked $name"
}

unlink_skill() {
  local name=$1 dest="$canonical/$1" agent_dir link
  [ -L "$dest" ] && [ "$(readlink "$dest")" = "$repo/skills/$name" ] || return 0
  rm "$dest"
  # Agent links point at the canonical path; remove only the ones left dangling.
  for agent_dir in "${agent_dirs[@]}"; do
    link="$agent_dir/$name"
    if [ -L "$link" ] && [ ! -e "$link" ]; then rm "$link"; fi
  done
  echo "✔ unlinked $name"
}

shopt -s nullglob
for dir in "$repo"/skills/*/; do
  name=$(basename "$dir")
  case "${1:-}" in
    --undo) unlink_skill "$name" ;;
    "") link_skill "$name" ;;
    *) echo "usage: $0 [--undo]" >&2; exit 2 ;;
  esac
done

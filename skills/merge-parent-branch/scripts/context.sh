#!/bin/sh
# Print merge context as key=value lines.
# Usage: context.sh parent      the parent-branch signals (PR base, reflog, nearest candidates) and a pick
#        context.sh conflicts   per conflicted file of an in-progress merge: status, blobs, each side's commits
# One call replaces the many ref, history and blob lookups an agent would otherwise make.
set -eu

usage() { echo "usage: context.sh parent|conflicts" >&2; exit 2; }

# Prints <ref> as a branch name: without refs/heads/, refs/remotes/origin/ or origin/.
short() {
  echo "$1" | sed -e 's#^refs/heads/##' -e 's#^refs/remotes/##' -e 's#^origin/##'
}

# Prints the remote's default branch with its source, or "none".
default_branch() {
  ref=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2> /dev/null || true)
  [ -n "$ref" ] && { echo "$(short "$ref") (origin/HEAD)"; return; }
  ref=$(git ls-remote --symref origin HEAD 2> /dev/null | awk '$1 == "ref:" { print $2; exit }')
  [ -n "$ref" ] && { echo "$(short "$ref") (ls-remote)"; return; }
  for name in main master; do
    git rev-parse -q --verify "refs/remotes/origin/$name" > /dev/null && { echo "$name (guess)"; return; }
  done
  echo none
}

# Prints the base branch of the open PR for the current branch, with its number, or "none (<why>)".
pr_base() {
  command -v gh > /dev/null || { echo "none (gh not installed)"; return; }
  git remote get-url origin 2> /dev/null | grep -q github.com || { echo "none (origin is not on GitHub)"; return; }
  out=$(gh pr view --json baseRefName,number,state \
    -q 'select(.state == "OPEN") | "\(.baseRefName) (open PR #\(.number))"' 2> /dev/null || true)
  echo "${out:-none (no open PR, or gh not authenticated)}"
}

# Prints the branch <branch> was created from, with the reflog line as evidence, or "none (<why>)".
reflog_parent() {
  created=$(git reflog show --format=%gs "refs/heads/$1" 2> /dev/null | tail -n 1)
  from=$(echo "$created" | sed -n 's/^branch: Created from //p')
  evidence="branch reflog: $created"
  if [ "$from" = HEAD ]; then
    # Created from whatever was checked out: the first switch onto the branch names it.
    switched=$(git reflog show --format=%gs HEAD | awk -v b="$1" '$0 ~ /^checkout: moving from / && $NF == b && $(NF-1) == "to" { line = $0 } END { print line }')
    from=$(echo "$switched" | awk '{ print $4 }')
    evidence="$evidence; HEAD reflog: $switched"
  fi
  from=$(short "$from")
  if [ -z "$from" ] || [ "$from" = HEAD ] || [ "$from" = "$1" ] || echo "$from" | grep -Eq '^[0-9a-f]{7,40}$'; then
    echo "none (${created:-no reflog})"
    return
  fi
  echo "$from ($evidence)"
}

parent() {
  branch=$(git branch --show-current)
  [ -n "$branch" ] || { echo "detached HEAD" >&2; exit 1; }
  upstream=$(git rev-parse -q --abbrev-ref --symbolic-full-name '@{u}' 2> /dev/null || true)
  if git remote get-url origin > /dev/null 2>&1; then
    space=refs/remotes/origin
    default=$(default_branch)
    pr=$(pr_base)
  else
    space=refs/heads
    default="none (no remote)"
    pr="none (no remote)"
  fi
  reflog=$(reflog_parent "$branch")

  # own: commits on HEAD past the merge-base (fewer is nearer); brings: commits the candidate would merge in.
  # Ties go to the candidate that brings more. The 200 most recently updated branches are enough.
  own_upstream=$(short "$upstream")
  candidates=$(git for-each-ref --sort=-committerdate --count=200 --format='%(refname)' "$space" |
    while IFS= read -r ref; do
      name=$(short "$ref")
      if [ "$name" = HEAD ] || [ "$name" = "$branch" ] || [ "$name" = "$own_upstream" ]; then continue; fi
      base=$(git merge-base HEAD "$ref" 2> /dev/null) || continue
      echo "$(git rev-list --count "$base..HEAD") $(git rev-list --count "HEAD..$ref") $name $(git rev-parse --short "$base")"
    done | sort -k1,1n -k2,2nr)
  nearest=$(echo "$candidates" | awk 'NR == 1 { min = $1 } $1 == min && NF { print $3 }')

  # The pick is the one branch every signal agrees on; otherwise "none" with the reason.
  pr_name=$(echo "$pr" | awk '$1 != "none" { print $1 }')
  reflog_name=$(echo "$reflog" | awk '$1 != "none" { print $1 }')
  named=${pr_name:-$reflog_name}
  if [ -n "$pr_name" ] && [ -n "$reflog_name" ] && [ "$pr_name" != "$reflog_name" ]; then
    pick="none (PR base and reflog disagree)"
  elif [ -n "$named" ]; then
    if echo "$nearest" | grep -qxF "$named"; then pick=$named
    else pick="none ($named is not among the nearest candidates)"; fi
  elif [ -z "$nearest" ]; then
    pick="none (no candidate branches)"
  elif [ "$(echo "$nearest" | wc -l | tr -d ' ')" -eq 1 ]; then
    pick=$nearest
  else
    pick="none (nearest candidates tie: $(echo "$nearest" | tr '\n' ' ' | sed 's/ $//'))"
  fi

  echo "branch=$branch"
  echo "upstream=${upstream:-none}"
  echo "default=$default"
  echo "pr_base=$pr"
  echo "reflog=$reflog"
  echo "candidates: (own = commits on $branch past the merge-base; brings = commits it would merge in)"
  echo "${candidates:-none}" | head -n 10 | awk '$1 ~ /^[0-9]+$/ { printf "  %s own=%s brings=%s base=%s\n", $3, $1, $2, $4; next } { print "  " $0 }'
  echo "pick=$pick"
}

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
  parent) parent ;;
  conflicts) conflicts ;;
  *) usage ;;
esac

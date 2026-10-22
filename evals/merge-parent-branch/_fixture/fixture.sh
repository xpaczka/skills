# Shared fixture for every eval case. scripts/sync-eval-fixtures.sh prepends it to
# each case's setup.sh to build scaffold.sh (scaffolds cannot read files outside their case).
set -euo pipefail

# A dependency-free Node project; the case writes its base files after this.
start_repo() {
  git init -q -b main
  git config user.email eval@example.com
  git config user.name eval
  mkdir -p src test
  cat > package.json << 'JSON'
{ "name": "shop", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
}

# publish_base <subject> <feature>: commits the base on main, cuts develop (the parent) from main and
# the feature branch from develop, so the feature's reflog records develop. All three are pushed to a
# bare origin inside .git/ (which keeps it out of git status). Leaves you on develop.
publish_base() {
  git add -A
  git commit -qm "$1"
  git init -q --bare -b main .git/eval-origin.git
  git remote add origin "$PWD/.git/eval-origin.git"
  git push -q -u origin main
  for branch in develop "$2"; do
    git switch -q -c "$branch"
    git push -q -u origin "$branch"
  done
  git switch -q develop
}

# save <subject>: commits everything on the current branch and pushes it.
save() {
  git add -A
  git commit -qm "$1"
  git push -q
}

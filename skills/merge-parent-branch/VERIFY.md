# Verify the merge

Runs on the staged merge, clean or resolved, before the gate. Git merges text, not meaning: a merge without a single conflict can still call a function the parent renamed, pass an argument the parent dropped, or import a file the parent moved. Done when every symbol the parent changed or removed is checked against the branch's new code, every detected check has run, and each failure is fixed or marked blocking (merge-caused) or recorded (pre-existing).

## 1. Semantic scan

With `<base>` as `git merge-base HEAD MERGE_HEAD`:

1. **What the parent changed.** Read `git diff <base> MERGE_HEAD` and list every symbol it removed, renamed, moved or gave a new signature: functions, classes, exported constants and types, file paths (`--name-status` shows deletes and renames), config keys, environment variables, routes, CLI flags. A `-` line defining a name with no `+` line defining the same name marks a removal or rename.
2. **What the branch added.** `git diff -U0 <base> HEAD` limited to `+` lines: the branch's new calls, imports and references.
3. **Match.** Grep each listed symbol in the branch's added lines, then open each hit in the merged working tree. Every hit still pointing at the old shape is a **semantic conflict**.

Fix each one in the merged tree so the branch's new code uses the parent's new shape (the new name, signature or path) and keeps its own behaviour. The parent's change stays as the parent made it: no alias, shim or re-export of the old name. Stage the fix and keep a one-line rationale for the report's **Semantic fixes**. When the parent's new shape cannot carry what the branch needs (the parent removed a feature the branch builds on), ask, as in [RESOLVE.md](RESOLVE.md#3-resolve-or-ask).

## 2. Install

The run asks about installing once, and only when something needs it: a lockfile RESOLVE.md marked for regeneration, dependencies the section 3 checks need that are not installed, or, should a check fail, the temporary worktrees of section 4 (a tip whose lockfile differs from the merged one). Ask before the checks when any of the first two applies, naming every command the yes will run, the worktree installs included; with neither, ask when a worktree first needs one.

- **Yes**: run the regenerations and the install, stage each regenerated lockfile, and install in the worktrees later without asking again.
- **No**: a marked lockfile stays the parent's (the report says the branch's dependency changes are missing from it), a check that needs the missing dependencies is skipped, and a failure whose tips could not be run is reported unclassified, as blocking.

## 3. Checks

Find the project's checks in the environment; a command named in `AGENTS.md`, `CLAUDE.md` or `CONTRIBUTING.md` wins over a detected one.

| Signal | Checks |
|---|---|
| `package.json` scripts | `typecheck`, `lint`, `test`, then `build`, run with the package manager its lockfile names (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, else npm) |
| `Makefile` | targets named `check`, `lint`, `test` |
| `Cargo.toml` | `cargo check`, `cargo test` |
| `go.mod` | `go vet ./...`, `go test ./...` |
| `pyproject.toml` | the tools it configures (ruff, mypy, pytest) |

Skip what needs a running service, a watcher or a browser (dev servers, e2e suites) and say so in the report.

Run every check on the merged tree. Done when each one has passed, or has a failure classified below.

## 4. Merge-caused or pre-existing

For each failing check, run the same command on both tips, outside the working tree:

```sh
tmp=$(mktemp -d)
git worktree add --detach "$tmp/ours" HEAD
git worktree add --detach "$tmp/theirs" MERGE_HEAD
# run the check in each; afterwards, also when it fails:
git worktree remove --force "$tmp/ours"; git worktree remove --force "$tmp/theirs"; rm -rf "$tmp"
```

A worktree has no installed dependencies: link the main tree's (`node_modules`, the virtualenv) when that tip's lockfile matches the merged one, else install there (section 2 covers it). If `git worktree add` is refused, extract the tip instead: `git archive <tip> | tar -x -C "$tmp/<side>"`.

Compare the failures themselves (test names, error messages), not exit codes:

- **Pre-existing**: the same failure on either tip. Record it with the tip it fails on; leave it unfixed. It does not block the gate.
- **Merge-caused**: a failure neither tip has. Fix it in the merged tree, stage the fix, add a line to **Semantic fixes**, and rerun until it passes. After three failed attempts at the same failure, stop fixing: it is **blocking** at the gate, committed only on an explicit override.

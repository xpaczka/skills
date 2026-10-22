# Detect the parent

Runs when no argument names the parent. Done when the user has confirmed one branch, or the run has stopped on the default branch.

## 1. Signals

Run `scripts/context.sh parent` (in this skill's folder) once, after the fetch. It prints:

- `default`: the remote's default branch.
- `pr_base`: the base branch of the open PR for this branch. The strongest signal: it is where the team will merge the work.
- `reflog`: the branch this one was created from, with the reflog line as evidence. It records where the branch was cut, which may itself have been a mistake, and it is missing in a fresh clone or after reflog expiry.
- `candidates`: up to 10 branches, nearest first. `own` counts this branch's commits past the merge-base with the candidate, `brings` the candidate's commits that the merge would bring in. Topology only: branches cut at the same commit tie, and among tied candidates the one that brings more comes first.
- `pick`: the one branch every available signal agrees on, or `none` with the reason (PR base and reflog disagree, the named branch is not among the nearest, the nearest tie).

## 2. Default branch

If `branch` is the `default` branch, print "`<branch>` is the default branch: there is no parent to merge into it." and stop. Nothing has changed.

## 3. Confirm or ask

**`pick=<name>`**: show the pick in this shape, with each signal as evidence, and wait. The `Parent:` line and the reply line stay word for word: they are what the user scans for.

```md
Parent: `develop`
- reflog: created from `develop`
- nearest: 1 commit of this branch past the merge-base; brings 3 commits
- PR base: none (no open PR)

Merge `origin/develop` into `feature/cart-savings`? Reply **yes**, or name another branch.
```

**`pick=none`**: ask which branch is the parent. Say why the signals are inconclusive in one line, then offer up to 4 options with their evidence: the PR base, the reflog branch, and the nearest candidates. Recommend, in this order, the PR base, the reflog branch, the first nearest candidate.

The merge waits for the answer in both cases. A yes continues with the pick; a branch the user names is taken as given, like the argument.

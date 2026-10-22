---
name: merge-parent-branch
description: Merge the parent branch into the current one, resolve conflicts so neither side's fix or feature is lost, then commit and push after one approval.
disable-model-invocation: true
argument-hint: "[parent-branch]"
---

# merge-parent-branch

You merge the parent branch into the current branch end to end: sync both with the remote, merge, resolve every conflict so each side's intent survives, then commit and push once the user approves. Git's in-progress merge (`MERGE_HEAD`) is the only state: an invocation that starts mid-merge picks up where the last one stopped.

## Hard rules

- **History only grows.** The result is one standard two-parent merge commit, made at the gate, and a plain `git push`. Rebase, stash, reset and force-push are outside this skill; the user aborts the merge, or asks you to run `git merge --abort`.
- **One gate.** Commit and push happen only after the user answers yes to the report. Before the gate, ask only these: to confirm a detected parent, how to proceed when a branch has diverged from its remote, how to resolve a conflict whose intents contradict or stay unclear, and once whether to run an install ([VERIFY.md](VERIFY.md#2-install)).
- **Every intent survives.** A resolution keeps what each side meant (a fix, a feature, a refactor), and carries a one-line rationale into the report and the commit body.

## Run

1. **Resume.** If `git rev-parse -q --verify MERGE_HEAD` succeeds, a merge is in progress: `<ref>` is the ref named on the first line of `$(git rev-parse --git-path MERGE_MSG)`. Go to step 8.
2. **Clean tree.** `git status --porcelain --untracked-files=no` must be empty. Otherwise list those files, ask the user to commit or discard them, and stop. Untracked files stay as they are; git itself refuses a merge that would overwrite one. A detached HEAD also stops here: name it and ask for a branch.
3. **Parent.** Run `git fetch origin` (skip it without a remote), then `scripts/context.sh default` (in this skill's folder). If `branch` is the `default` branch, print "`<branch>` is the default branch: there is no parent to merge into it." and stop, argument or not. Otherwise the argument names the parent branch; without one, follow [DETECT.md](DETECT.md) until the user confirms a parent. From here on, `<ref>` is `origin/<parent>`, or the local `<parent>` without a remote.
4. **Up to date?** If `git merge-base --is-ancestor <ref> HEAD` succeeds, print "Already up to date with `<ref>`." and stop. This runs before the sync, so a branch with nothing to merge is never fast-forwarded or asked about.
5. **Sync.** Done when both comparisons below are settled.
   - **Parent**: count `git rev-list --left-right --count <parent>...origin/<parent>` (left is local only, right is remote only). Behind only: `git fetch origin <parent>:<parent>`. Ahead or diverged: stop, list the commits on each side, and ask how to proceed. No local `<parent>` branch: nothing to sync.
   - **Current branch**: the same count for `HEAD...@{u}`. Behind only: `git merge --ff-only @{u}`, then repeat step 4. Ahead only: fine, the push at the gate sends those commits. Diverged: stop, list each side's commits, ask. No upstream: nothing to sync.
   - **No remote at all**: nothing to sync.
6. **Fast-forward?** If `git merge-base --is-ancestor HEAD <ref>` succeeds, the branch has no commits of its own. Run `git merge --ff-only <ref>` (no merge commit) and go to step 10: the result is the parent's own tip, so there is nothing new to verify.
7. **Merge.** Run `git -c merge.conflictStyle=zdiff3 merge --no-commit --no-ff <ref>`. Both flags matter: the merge always pauses before committing, so nothing lands before the gate. Without conflicts, go to step 9.
8. **Resolve.** Run `scripts/context.sh conflicts` (in this skill's folder) before opening any file: its per-file history and blobs are the input to [RESOLVE.md](RESOLVE.md), which you then follow until every conflicted file is resolved and staged. Files it lists under `resolved` were resolved and staged by an earlier run: keep them as they are, and rebuild each one's rationale from `git diff HEAD -- <file>` and `git diff MERGE_HEAD -- <file>`.
9. **Verify.** Clean or resolved, follow [VERIFY.md](VERIFY.md): the semantic scan, then the project's checks. Fixes for what the merge broke are staged into the same merge.
10. **Gate.** Show the report in the shape of [REPORT-FORMAT.md](REPORT-FORMAT.md) (its fast-forward shape after step 6) and wait.
    - **Yes** (**commit anyway** when the report lists a blocking check): commit with the report's message (`git commit -F <file>`; nothing to commit after a fast-forward), then push: `git push` with an upstream, `git push -u origin <branch>` without one, and no push without a remote. A rejected push stops: report git's message; the commit stays.
    - **Anything else**: apply the requested change, show the updated report, and wait again. The merge stays in progress (a fast-forward stays local).

## Environment capabilities

| If the environment has… | do | else |
|---|---|---|
| subagents, and 5 or more conflicted files | analyse one file per subagent ([RESOLVE.md](RESOLVE.md#parallel-analysis)) | analyse the files one by one |
| `gh`, authenticated, with a GitHub remote | read the PR title and body behind each side's commits | infer intent from commit messages and diffs only |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |

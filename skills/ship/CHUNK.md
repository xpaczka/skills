# Chunk phase

Implements **one** chunk per invocation and hands it to the user. Entry: `/ship next`, or `/ship` with `phase: implementing`. `scripts/` paths are relative to this skill's folder.

## 1. Preflight: settle the previous chunk

If a chunk has `status: handed-off`:

1. **Uncommitted changes** (`git status --porcelain` is not empty): stop and say
   > Chunk N isn't committed yet (changes in: …). Commit it, or say "continue anyway".

   On "continue anyway": set its `commit: uncommitted`, `status: committed`, skip its rework metric, and go on.
2. **Clean tree, HEAD moved**: the user committed. Set `commit` to HEAD's short SHA and `status: committed`, add 1 to `chunks_shipped`, and record the user's rework against the handoff snapshot:

   ```sh
   git diff --numstat <handoff_snapshot> HEAD | awk '{ n += ($1 == "-" ? 0 : $1 + $2) } END { print n + 0 }'
   ```

   Store the number in `metrics.rework_lines[N]`.
3. **Clean tree, HEAD unchanged**: the chunk's changes are gone. Ask: redo it, skip it, or amend the plan.

Then pick the lowest-numbered `pending` chunk. If none is left:

- `review_rounds` is 0 → set `phase: reviewing`, end with "All N chunks committed. `/clear`, then `/ship review`."
- otherwise (these were review fixes) → set `phase: finishing`, end with "Fixes committed. `/ship` to finish, or `/ship review` for another round."

## 2. Implement

Set the chunk `status: in-progress`. Read the chunk, the **Decisions** and the **Plan**; open only the files the chunk names and what they lead you to. Stay inside the chunk's goal: work that a later chunk or another decision covers stays out even when it seems to belong here; name it under Deviations as "left for chunk K" instead.

- `executor: subagent` (when the harness has subagents): brief the subagent with the chunk entry, the decisions it touches, and its acceptance commands. Read its diff yourself before handing off; you own the handoff.
- `tdd: yes`: call the `tdd` skill; the seams were approved with the plan. Fallback: one failing test per behaviour through a listed seam, the minimum code to pass it, repeat; refactor only while green.

## 3. Deviations

- **Small** (a renamed helper, an extra file, a different internal approach with the same outcome): continue, and list it under Deviations in the handoff.
- **Structural** (a plan assumption is false, a decision is missing, the chunk must split or merge, later chunks change): stop writing code and propose an amendment: what changes, why, and the effect on later chunks. Once the user approves, append it to **Amendments**, update **Chunks** (new chunks get `kind: amendment`), add 1 to `metrics.amendments`, then continue.

## 4. Verify

Run the chunk's `acceptance` commands and every configured `check`. For each failing run, add 1 to `metrics.verify_failures[N]`, fix, and rerun. Done when everything passes. After three failed attempts at the same failure, stop and hand off as **blocked**, explaining what fails and what you tried.

## 5. Hand off

1. Run `scripts/snapshot.sh` and store its output as `handoff_snapshot`. It captures the working tree without touching the index, branches or stash.
2. Set `status: handed-off`, save the state file.
3. Reply in this shape, and nothing longer:

```
### Chunk N/M: <title> (checks green)
**What and why**
- …
**Deviations**: none | - …
**Look closely at**
- `path:line`: why it is risky
**Commit message**
<commit_message, updated if the chunk changed>
**Remaining**
N+1. <title> · N+2. <title> · …

Commit, then `/ship next` (`/clear` first if the context is long).
```

Never commit. Every message the user sends about this chunk before the next `/ship next` adds 1 to `metrics.user_turns[N]`.

# Resolve conflicts

Each conflicted file ends resolved, staged, and with a one-line rationale. Done when `git diff --name-only --diff-filter=U` prints nothing and no resolved file holds a line starting with `<<<<<<<` or `>>>>>>>`.

## 1. Context

Run `scripts/context.sh conflicts` (in this skill's folder) once. It prints the merge-base, both tips, and per conflicted file: git's conflict status, the base, ours and theirs blob IDs, and each side's commits since the merge-base that touched the file.

Then, per file:

- **The three versions.** The markers in the working file carry all three (`zdiff3`: ours, `|||||||` base, `=======` theirs). For the whole file on one side: `git show :1:<file>` (base), `:2:` (ours, the current branch), `:3:` (theirs, the parent).
- **Each side's changes**: `git log -p <merge-base>..HEAD -- <file>` and `git log -p <merge-base>..MERGE_HEAD -- <file>`.
- **PRs**, when `gh` works: `gh pr list --state all --search <sha> --json number,title,body` for each listed commit; read what the PR says it fixes or adds.

## 2. Intent

Name each side's intent per conflict hunk, from the commit messages, PR text and the diff itself: **fix** (a bug, an edge case, a security issue), **feature** (new behaviour), **refactor** (same behaviour, new shape: extract, rename, move), **revert**, **formatting**, or **removal** (dead code, a dropped feature). A hunk can carry more than one. The resolution keeps every intent; the table gives the usual way.

| Ours / theirs | Resolution |
|---|---|
| fix / refactor | the refactored shape, with the fix applied inside it |
| feature / feature | both, each wired up completely (imports, registrations, exports, list entries) |
| fix / fix of the same bug | the more complete fix; both when they cover different cases |
| formatting or rename / anything | the substantive change, with the formatting or rename reapplied to it |
| refactor / refactor | ask, unless one is a strict subset of the other |
| removal or move / modification | a move: port the modification to the new place; a removal: ask |
| revert / anything | ask |
| the same change on both sides | either one |
| one value changed two ways (a constant, a config entry, a version) | ask, unless a commit message says why one supersedes the other |

Read the whole function or block around a hunk, not only the markers: a fix outside the conflict may depend on a line inside it.

## 3. Resolve or ask

Resolve on your own when the intents fit together. Ask when they contradict, when a side's intent stays unclear after reading its commits, or when the table says ask. A question names `file:line`, each side's change and intent in a sentence, and the options with your recommendation first. Group the questions about one file into one message.

Write the resolved file, check it has no marker lines left, and `git add` it. Keep its rationale as one line: what each side meant and how both survive, such as "kept develop's rounding fix inside the branch's extracted `applyDiscount`".

Statuses other than both-modified (`UU`):

- **`AA`** (added on both sides): merge the two files as above.
- **`UD` / `DU`** (deleted on one side, modified on the other): check whether the deleting side moved the code (`git log --follow` and a grep for its symbols). Moved: port the modification to the new place and `git rm` the old path. Removed outright: ask.
- **`DD`**: `git rm` it.

## Parallel analysis

With 5 or more conflicted files and a harness with subagents, give each file to its own subagent. Its brief: the file's block from `context.sh`, the merge-base, the parent ref, and this file's sections 1 to 3. It reads, writes nothing, and returns:

- the full proposed content of the file (or "port to <path>" for a move);
- the rationale line;
- any question it would ask, with the options and its recommendation.

You collect every result, ask the gathered questions together, then write, check and stage each file yourself.

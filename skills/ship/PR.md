# PR phase

Opens a pull request for the feature branch, written in the repo's own conventions. Entry: `/ship pr [--draft | --ready]`, 'Open PR' after finishing, or the end of an `auto` feature. Before `phase: done`, warn that the feature is unfinished and ask whether to continue.

## 1. Gather

- **Mode**: the flag if given, else `config.pr_default`.
- **Base**: `config.default_branch`.
- **Content**: the record if it exists, else the state: Ticket link, Decisions, chunks and their commits, the checks and acceptance commands every chunk ran green, the review rounds (accepted versus rejected), deviations, and every finding still `open`, for the reviewers' notes.
- **create-pr**: `find ~/.claude/plugins -path '*/skills/create-pr/SKILL.md' -not -path '*/.trash/*' | head -1`. Found → step 2; nothing found → step 3.

## 2. Through create-pr

A `create-pr` skill installed as a Claude Code plugin, so ship's PRs match the ones opened by hand with it.

1. It may commit whatever is uncommitted under its own title. If `git status --porcelain` is not empty, list the files and stop: ship commits only chunks.
2. It takes free text as `$ARGUMENTS`: `draft` in draft mode; the feature ID when `source` is a tracker, so it links the issue; and the **Content** above as context for the PR body.
3. It is usually user-invoked, so the Skill tool can't load it: read that SKILL.md and follow it with those arguments, resolving its relative links from that file's folder. It runs to completion without a preview; its own **Stop** cases stop ship too.

Continue at step 6.

## 3. Write

- **Style reference** (GitHub): `gh pr list --state all --limit 10 --json title,body`.
- **Title**: match the recent PR titles (including how they reference issue IDs); with no history, follow `config.commit_style`.
- **Body**, first that applies:
  1. `config.pr.template` exists → fill every section of the template; keep its headings and checkboxes.
  2. Recent PR bodies exist → follow their structure and length.
  3. Neither → Call the Skill tool with "pr". Fallback: **Summary** (what and why, linking the ticket), **Changes** (one line per chunk), **Testing** (checks and acceptance commands run), **Notes** (risks, follow-ups, open findings).

## 4. Preview

Under `auto` autonomy, skip this step. Otherwise show the title, the body, base ← branch, and the mode, and apply the user's edits. Pushing and creating the PR happen only after the user approves this preview.

## 5. Create

- **GitHub**: `git push -u origin <branch>`, then `gh pr create --base <base> --head <branch> --title <title> --body-file <temp file>`, adding `--draft` in draft mode.
- **Other hosts**: push the same way, then print the title, the body, and the host's new-PR URL for the branch (Bitbucket: `…/pull-requests/new?source=<branch>`; GitLab: `…/-/merge_requests/new?merge_request[source_branch]=<branch>`). The user creates the PR there.

## 6. Record

Done when the PR exists (or its URL is printed). Store the PR URL as `pr` in the record's frontmatter if the record exists. If `tracker_writes` allows comments, offer to post the PR link (preview first). End with the PR URL.

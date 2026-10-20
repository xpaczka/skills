# PR phase

Opens a pull request for the feature branch, written in the repo's own conventions. Entry: `/ship pr [--draft | --ready]`. Before `phase: done`, warn that the feature is unfinished and ask whether to continue.

## 1. Gather

- **Mode**: the flag if given, else `config.pr_default`.
- **Base**: `config.default_branch`.
- **Style reference** (GitHub): `gh pr list --state all --limit 10 --json title,body`.
- **Content**: the record if it exists, else the state: Ticket link, Decisions, chunks and their commits, review summary, deviations.

## 2. Write

- **Title**: match the recent PR titles (including how they reference issue IDs); with no history, follow `config.commit_style`.
- **Body**, first that applies:
  1. `config.pr.template` exists → fill every section of the template; keep its headings and checkboxes.
  2. Recent PR bodies exist → follow their structure and length.
  3. Neither → Call the Skill tool with "pr". Fallback: **Summary** (what and why, linking the ticket), **Changes** (one line per chunk), **Testing** (checks and acceptance commands run), **Notes** (risks, follow-ups).

## 3. Preview

Show the title, the body, base ← branch, and the mode. Apply the user's edits. Pushing and creating the PR happen only after the user approves this preview.

## 4. Create

- **GitHub**: `git push -u origin <branch>`, then `gh pr create --base <base> --head <branch> --title <title> --body-file <temp file>`, adding `--draft` in draft mode.
- **Other hosts**: push the same way, then print the title, the body, and the host's new-PR URL for the branch (Bitbucket: `…/pull-requests/new?source=<branch>`; GitLab: `…/-/merge_requests/new?merge_request[source_branch]=<branch>`). The user creates the PR there.

## 5. Record

Done when the PR exists (or its URL is printed). Store the PR URL as `pr` in the record's frontmatter if the record exists. If `tracker_writes` allows comments, offer to post the PR link (preview first). End with the PR URL.

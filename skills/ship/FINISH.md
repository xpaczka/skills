# Finish phase

Condenses the feature into a **record** for future grilling sessions, plus metrics for `/ship stats`. Entry: `/ship` with `phase: finishing`.

## 1. Check

Every chunk is `committed` and `git status --porcelain` is empty. If not, say what is open and stop: `/ship next` settles the last chunk.

## 2. Write the record

Path: `SHIP_HOME/repos/<key>/records/<feature>-<title as kebab-case>.md`, from [RECORD-FORMAT.md](RECORD-FORMAT.md), at most 60 lines. Its reader is a future agent planning related work, so keep what constrains that work and drop the play-by-play:

- frontmatter: `final_commit` = HEAD's short SHA, `related` = the IDs under **Related work** and the ticket's links, `completed` = today;
- **Goal**: 1–3 lines;
- **Decisions**: the durable ones, each **what**: **why**;
- **Deviations and amendments**: what changed against the approved plan, and why;
- **Review**: findings per axis and severity, accepted versus rejected, the one that mattered most;
- **Commits**: ``git log --reverse --format='- `%h` %s' <base_commit>..HEAD``;
- **Notes for future work**: gotchas, follow-ups, constraints.

## 3. Write the metrics

Next to the record, same name with `.metrics.json`:

```json
{
  "feature": "<feature>",
  "repo_key": "<key>",
  "repo_path": "<absolute repo root>",
  "completed": "<YYYY-MM-DD>",
  "quick": false,
  "review_rounds": 1,
  "timeline": [{ "phase": "grilling", "at": "<UTC time>" }],
  "metrics": { "...": "the state's Metrics block, as is" }
}
```

`timeline` is the state's **Timeline**, in order. `/ship stats` uses `repo_path` and `timeline` to find this feature's token usage.

## 4. Tracker update

Only when the state's `tracker_writes` allows it:

- `comment` or `comment+status`: draft a short comment (what shipped, the commits, the PR link if there is one), show it, and post it once the user approves.
- `comment+status`: also propose the target status, and change it once the user approves.

## 5. Close

Set `phase: done` with its Timeline entry. Keep the state file; `/ship clean` deletes it. End with:

> Done, record saved. `/ship pr` to open a PR, `/ship clean` to drop the live state.

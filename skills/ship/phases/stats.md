# Stats

Shows how the workflow performs across finished features, and where it hurts. Read-only. Entry: `/ship stats [--all]`.

## 1. Run the script

```sh
node <this skill's folder>/scripts/stats.mjs --repo <key> [--tokens]
```

- Drop `--repo <key>` with `--all`, or when the current folder is not a repo.
- Add `--tokens` when the harness writes Claude Code transcripts (`~/.claude/projects/` exists). Tokens are counted from assistant entries whose working directory is inside the repo during each phase's time window, so a parallel session in the same repo is counted too.
- Node missing: read `SHIP_HOME/repos/*/records/*.metrics.json` yourself and compute the same per-feature numbers.

## 2. Interpret

Show the script's output, then at most three concrete changes the numbers point to, each tied to its signal:

| Signal | Usually means | Try |
|---|---|---|
| High rework per chunk | handoffs miss what the user wants | sharper Decisions; smaller chunks |
| Many verify failures | chunks too big, or checks unknown at plan time | smaller chunks; acceptance commands in the plan |
| Many amendments | exploration in planning too shallow | more read-only exploration before drafting |
| Planned / shipped below 1 | plans miss work; review fixes pile up | spec reviewer findings → grilling questions |
| Review acceptance very low | reviewer noise | tighten the review briefs |
| One phase dominates tokens | that phase loads too much | trim its phase file or its reads |

With fewer than three features, say the trends are not yet meaningful.

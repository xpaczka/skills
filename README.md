# skills

Agent-agnostic [Agent Skills](https://agentskills.io) (`SKILL.md` format) for a controlled, chunked development workflow. They work in Claude Code, Cursor and any other agent that reads `SKILL.md`.

## Catalog

| Skill | Invocation | What it does |
|---|---|---|
| [ship](skills/ship/SKILL.md) | user: `/ship` | Grill → plan → small chunks you review and commit → independent two-axis review. State and history live in `~/.agents/ship/`, never in the repo. |

## Install

With the [`skills` CLI](https://github.com/vercel-labs/skills), globally, for Claude Code and Cursor:

```sh
npx skills add xpaczka/skills -s <name> -g -a claude-code -a cursor
npx skills update -g          # pull the latest version
```

## Develop

```sh
scripts/link-dev.sh           # symlink every skills/* into ~/.agents/skills and agent dirs, so edits apply live
scripts/link-dev.sh --undo    # remove those symlinks
scripts/check.sh              # frontmatter, line budgets, `claude plugin validate`
```

Conventions for writing a skill live in [AUTHORING.md](AUTHORING.md).

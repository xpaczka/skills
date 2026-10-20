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

### Claude Code permissions for `ship`

`ship` keeps its state outside the repo, in `~/.agents/ship/`. To stop Claude Code from asking on every call, allow exactly that folder and ship's two scripts in `~/.claude/settings.json` (use your absolute home path where shown):

```json
"permissions": {
  "additionalDirectories": ["/Users/<you>/.agents/ship"],
  "allow": [
    "Read(~/.agents/ship/**)",
    "Edit(~/.agents/ship/**)",
    "Bash(/Users/<you>/.claude/skills/ship/scripts/locate.sh)",
    "Bash(/Users/<you>/.claude/skills/ship/scripts/snapshot.sh)"
  ]
}
```

## Develop

```sh
scripts/link-dev.sh           # symlink every skills/* into ~/.agents/skills (+ ~/.claude/skills), so edits apply live
scripts/link-dev.sh --undo    # remove those symlinks
scripts/check.sh              # frontmatter, line budgets, whitespace rules, `claude plugin validate`
```

Conventions for writing a skill live in [AUTHORING.md](AUTHORING.md).

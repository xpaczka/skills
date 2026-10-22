# skills

Agent-agnostic [Agent Skills](https://agentskills.io) (`SKILL.md` format) for a controlled, chunked development workflow. They work in Claude Code, Cursor and any other agent that reads `SKILL.md`.

## Catalog

| Skill | Invocation | Description |
| --- | --- | --- |
| [merge&#8209;parent&#8209;branch](skills/merge-parent-branch/SKILL.md) | User | Merge the parent branch into the current one: sync both with the remote, resolve conflicts so neither side's fix or feature is lost, then commit and push after one approval. |
| [ship](skills/ship/SKILL.md) | User | Grill → plan → small chunks you review and commit → independent two-axis review. State and history live in `~/.agents/ship/`, never in the repo. |
| [web&#8209;ready&#8209;audit](skills/web-ready-audit/SKILL.md) | User | Audit a website or web app before launch, on any stack: what is missing or misconfigured, as Blocker, Should fix and Nice to have findings. Report only, never edits. |

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

The dev commands and the repo's rules for agents and authors live in [AGENTS.md](AGENTS.md), with topic docs in [.agents/](.agents/).

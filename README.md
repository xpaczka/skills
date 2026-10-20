# skills

Agent-agnostic [Agent Skills](https://agentskills.io) (`SKILL.md` format) for a controlled, chunked development workflow. They work in Claude Code, Cursor and any other agent that reads `SKILL.md`.

## Catalog

### User-invoked

- **[ship](skills/ship/SKILL.md)**: Grill → plan → small chunks you review and commit → independent two-axis review. State and history live in `~/.agents/ship/`, never in the repo.

### Model-invoked

None yet.

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
scripts/check.sh              # frontmatter, line budgets, file layout, agents/openai.yaml, no ../ links, em-dashes, whitespace, eval scaffolds, `claude plugin validate`
scripts/eval.sh <skill>       # run a skill's eval suite (evals/<skill>/README.md); costs money
```

The repo's rules for agents and authors live in [AGENTS.md](AGENTS.md), with topic docs in [.agents/](.agents/).

# skills

Agent Skills (`SKILL.md` format) that work in Claude Code, Cursor, Codex and any agent that reads `SKILL.md`. The conventions follow [mattpocock/skills](https://github.com/mattpocock/skills), plus this repo's own stricter rules.

## Layout

- One flat folder per skill: `skills/<name>/SKILL.md`, the folder name equal to the frontmatter `name`.
- Each skill installs on its own (`npx skills add xpaczka/skills -s <name>`), so a skill folder is self-contained: every link stays inside it, and other skills are reached by name.
- Eval suites live in `evals/<skill>/`; repo tooling lives in `scripts/`.

## Catalog

Every skill has an entry in `README.md`, under **User-invoked** or **Model-invoked**, with the name linked to its `SKILL.md`:

```md
- **[ship](skills/ship/SKILL.md)**: one-line description.
```

## Develop

```sh
scripts/link-dev.sh         # symlink skills/* into ~/.agents/skills and ~/.claude/skills; edits apply live
scripts/link-dev.sh --undo  # remove those symlinks
scripts/check.sh            # lint skills and tracked files (rules listed in its header); run after each change
scripts/eval.sh <skill>     # run evals/<skill>; costs money, so run it when a skill's behaviour changes
```

`scripts/check.sh` passing is the bar for every change.

## Prose

Write without em-dashes in every tracked file; only recorded model output in `evals/*/results/` is exempt. Where a sentence reaches for one, rewrite it with a comma, colon, period, parentheses or a conjunction, whichever the sentence wants, never a blind character substitution. Text a skill writes at runtime (state files, PR bodies) is outside this rule.

## Topic docs

- Writing or editing a skill: read [.agents/authoring.md](.agents/authoring.md) (disclosure, file naming, line budgets, harness capabilities, external dependencies, scripts, evals).
- Choosing a skill's invocation, or having one skill reach another: read [.agents/invocation.md](.agents/invocation.md).
- Why the repo is shaped this way: ADRs in `.agents/adr/NNNN-<slug>.md`, starting with [0001](.agents/adr/0001-adopt-mattpocock-skills-conventions.md). Add one for a decision that is hard to reverse, surprising without context, and the result of a real trade-off.

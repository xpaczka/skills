# Authoring skills

Call the Skill tool with "writing-for-agents" before writing or editing a skill (install: `npx skills add mattpocock/skills -s writing-for-agents -g`). It holds the writing discipline; this file adds the repo's own conventions. Invocation and skill-to-skill calls: [invocation.md](invocation.md).

## Progressive disclosure

- `SKILL.md` holds only what every branch needs: a router of subcommands, hard rules, and pointers.
- What only some branches reach goes in a reference file beside `SKILL.md`, behind a pointer such as "read [PLAN.md](PLAN.md)". The agent reads it only when that branch runs.
- Reference files sit flat at the skill root with UPPERCASE names (`PLAN.md`, `REVIEW.md`). A template the skill fills in at runtime is `<NAME>-FORMAT.md` (`STATE-FORMAT.md`); a non-Markdown format goes in a fenced block inside one (`CONFIG-FORMAT.md` wraps YAML).
- Only two subfolders: `scripts/` and `agents/` (`openai.yaml`). No `.md` file lives in a subfolder.
- Budgets: `SKILL.md` at most 120 lines, any other `.md` in the skill at most 150. Over budget means split by branch, not trim to fit.

`scripts/check.sh` enforces the naming, placement and budgets.

## Harness capabilities

Skills degrade gracefully outside Claude Code. A step that depends on a harness feature is a capability row, not an unconditional instruction:

| If the harness has… | do | else |
|---|---|---|
| a plan mode | enter it; approve through its UI | write the plan to the state file; approve in chat |
| subagents | run independent work in parallel subagents | run it sequentially, each step starting from only its brief |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |
| context clearing | tell the user to `/clear`, then re-invoke | tell the user to start a new chat, then re-invoke |

## Dependencies on external skills

A skill that relies on a skill from another repo names it, gives its install line in `SKILL.md`'s **Dependencies** section, and carries a 2 to 3 line fallback at the step that uses it, so the step still works when the skill is missing.

## Scripts

Bundled scripts live in `skills/<name>/scripts/`, are zero-dependency (POSIX shell or Node 22 or later), and are invoked by path relative to the skill folder. A script replaces a lookup the agent would otherwise do by hand in many tool calls.

## Formatting

No formatter, no dependencies. `.editorconfig` sets the rules (UTF-8, LF, 2-space indent, final newline, no trailing whitespace except in Markdown) and `.vscode/settings.json` applies them in VS Code and Cursor without extensions, with format-on-save off so a global formatter cannot rewrite files. `scripts/check.sh` enforces them. Keep Markdown tables compact (no column padding): skill files load on every invocation.

## Evals

A skill with branches worth guarding gets a suite in `evals/<skill>/`: one folder per case with `case.yaml` and `setup.sh`, plus a shared `_fixture/fixture.sh`. Each case's `scaffold.sh` is generated from the fixture plus its `setup.sh`; edit those two and run `scripts/sync-eval-fixtures.sh`. `scripts/eval.sh <skill>` runs the suite; record the baseline score in `evals/<skill>/README.md` and compare against it after a behaviour change.

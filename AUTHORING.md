# Authoring skills

Rules for every skill in this repo. Load the `writing-for-agents` skill before writing or editing one; this file only adds the repo's own conventions.

## Layout

- One folder per skill: `skills/<name>/SKILL.md`. The folder name equals the frontmatter `name`.
- Each skill installs on its own (`npx skills add … -s <name>`), so a skill folder is self-contained.
- **Refer to another skill by name only** ("call the `grilling` skill"), never by a relative path into another folder. Nothing is shared through a common folder.
- Add every new skill to the catalog table in `README.md`.

## Invocation

- **User-invoked** (a workflow the human starts by typing `/<name>`): set `disable-model-invocation: true`, write a one-line human-facing `description`, and add `agents/openai.yaml` with `policy: allow_implicit_invocation: false` for Codex.
- **Model-invoked** (the agent or another skill must reach it): omit the flag; the `description` names what it is and one trigger per branch, leading word first.
- A skill that other skills call must be model-invoked. A user-invoked skill can be read by path but never fired by another skill.

## Progressive disclosure

- `SKILL.md` holds only what every branch needs: a router of subcommands, hard rules, and pointers.
- Anything only some branches reach goes in a sibling file (`phases/<step>.md`, `templates/…`) behind a pointer such as "read [phases/plan.md](phases/plan.md)". The agent reads it only when that branch runs.
- Budgets, enforced by `scripts/check.sh`: `SKILL.md` ≤ 120 lines, any other `.md` in the skill ≤ 150 lines.

## Harness capabilities

Skills here must degrade gracefully outside Claude Code. When a step depends on a harness feature, write it as a capability row, never as an unconditional instruction:

| If the harness has… | do | else |
|---|---|---|
| a plan mode | enter it; approve through its UI | write the plan to the state file; approve in chat |
| subagents | run independent work in parallel subagents | run it sequentially, each step starting from only its brief |
| a structured question UI | use it for multiple-choice questions | numbered plain-text questions |
| context clearing | tell the user to `/clear`, then re-invoke | tell the user to start a new chat, then re-invoke |

## Dependencies on external skills

When a skill relies on a skill from another repo, name it, say where it installs from, and give a 2–3 line fallback so the step still works when it is missing.

## Scripts

Bundled scripts live in `skills/<name>/scripts/`, are zero-dependency (POSIX shell or Node ≥ 22), and are invoked by path relative to the skill folder.

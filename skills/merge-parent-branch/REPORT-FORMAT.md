# Report format

The gate report: everything the user needs to say yes. Fill every section; a section with nothing to say gets one line saying so.

````md
## Merge `<ref>` into `<branch>`

**Sync**: `<parent>` fast-forwarded 3 commits to `origin/<parent>`; `<branch>` in sync with `origin/<branch>`.
**Brings in**: 12 commits from `<parent>`, such as:
- `a1b2c3d` Fix rounding on discounted prices
- … (up to 8 subjects, fixes and features first)

### Conflicts

- `src/price.js`: kept `<parent>`'s rounding fix inside the branch's extracted `applyDiscount`.
- `src/routes.js`: kept both new routes, `/export` (branch) and `/import` (`<parent>`). Asked: no.
- `config/app.json`: kept the branch's timeout of 30s. Asked: yes, you chose the branch's value.
- `package-lock.json`: took `<parent>`'s version and regenerated it with `npm install`. Asked: yes.

### Semantic fixes

- `src/receipt.js:3`: the branch's new receipt calls `subtotal`, which `<parent>` renamed to `cartSubtotal`; it now calls `cartSubtotal`.

### Checks

- `npm run typecheck`: pass
- `npm test`: pass after the semantic fix above
- `npm run lint`: fail, pre-existing (the same error on `<branch>`): `src/legacy.js:12 'x' is unused`
- e2e: skipped, needs a running server

### Commit

```
<the commit message below>
```

### Push

`git push` to `origin/<branch>`.

Reply **yes** to commit and push. Anything else keeps the merge in progress.
````

- **Sync**: one clause each for the parent and the current branch: fast-forwarded N commits, in sync, or no upstream.
- **Conflicts**: one bullet per conflicted file, with its rationale; add "Asked: yes" and the answer when the user decided it. A clean merge says "None: git merged every file."
- **Semantic fixes**: one bullet per fix from the scan or a merge-caused check failure, with `file:line` and what changed on each side. None: "None: the branch's new code uses nothing the parent changed."
- **Checks**: one bullet per check: pass, merge-caused and still failing after three fix attempts (list these first: the user weighs them at the gate), or pre-existing with the tip it fails on. Skipped checks say why.
- **Push**: `git push` with an upstream, `git push -u origin <branch>` without one, or "No remote: skipped".

## Fast-forward

After a fast-forward (the branch had no commits of its own), there is no merge commit and no conflict list; the gate is only for the push.

````md
## Fast-forward `<branch>` to `<ref>`

**Sync**: `<parent>` in sync with `origin/<parent>`; `<branch>` in sync with `origin/<branch>`.
**Brings in**: 4 commits from `<parent>`, such as:
- `a1b2c3d` Fix rounding on discounted prices

`<branch>` had no commits of its own, so it now points at `<ref>` (`a1b2c3d`), with no merge commit.

### Push

`git push` to `origin/<branch>`.

Reply **yes** to push. Anything else leaves the fast-forward local and unpushed.
````

## Commit message

The subject is the first line of `$(git rev-parse --git-path MERGE_MSG)`: git's own merge subject, which already names the remote or local ref. Then the conflict list and the semantic fixes as the body; each section only when it has entries, so a clean merge with no fixes has no body:

```
<the first line of MERGE_MSG>

Conflicts resolved:
- src/price.js: kept <parent>'s rounding fix inside the branch's extracted applyDiscount
- src/routes.js: kept both new routes, /export (branch) and /import (<parent>)

Semantic fixes:
- src/receipt.js: call cartSubtotal, <parent>'s new name for subtotal
```

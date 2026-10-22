# Report format

The gate report: everything the user needs to say yes. Fill every section; a section with nothing to say gets one line saying so.

````md
## Merge `origin/<parent>` into `<branch>`

**Sync**: `<parent>` fast-forwarded 3 commits to `origin/<parent>`; `<branch>` in sync with `origin/<branch>`.
**Brings in**: 12 commits from `<parent>`, such as:
- `a1b2c3d` Fix rounding on discounted prices
- … (up to 8 subjects, fixes and features first)

### Conflicts

- `src/price.js`: kept `<parent>`'s rounding fix inside the branch's extracted `applyDiscount`.
- `src/routes.js`: kept both new routes, `/export` (branch) and `/import` (`<parent>`). Asked: no.
- `config/app.json`: kept the branch's timeout of 30s. Asked: yes, you chose the branch's value.

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
- **Push**: `git push` with an upstream, `git push -u origin <branch>` without one, or "No remote: skipped".

## Commit message

Git's standard merge subject, then the conflict list as the body (a clean merge has no body):

```
Merge remote-tracking branch 'origin/<parent>' into <branch>

Conflicts resolved:
- src/price.js: kept <parent>'s rounding fix inside the branch's extracted applyDiscount
- src/routes.js: kept both new routes, /export (branch) and /import (<parent>)
```

Without a remote, the subject is `Merge branch '<parent>' into <branch>`.

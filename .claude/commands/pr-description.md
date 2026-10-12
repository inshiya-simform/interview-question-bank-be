---
description: Compare the current branch with dev and generate a PR description
argument-hint: "[base-branch] (default: dev)"
allowed-tools: Bash(git branch:*), Bash(git log:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git merge-base:*)
---

Generate a high-level pull request description for the current branch compared against the base branch.

Base branch: `$ARGUMENTS` if provided, otherwise `dev`. Prefer `origin/<base>` if it exists, otherwise use the local branch.

## Context

- Current branch: !`git branch --show-current`
- Commits not in base: !`git log --oneline origin/dev..HEAD 2>/dev/null || git log --oneline dev..HEAD`
- Files changed: !`git diff --stat origin/dev...HEAD 2>/dev/null || git diff --stat dev...HEAD`

If `$ARGUMENTS` is set, ignore the `dev` output above and re-run the same git commands against that base.

## Task

1. Read the diff (`git diff <base>...HEAD`) and commit messages to understand what is being added or changed. Open changed files if the diff alone is unclear.
2. Write a short overview that lets a reader understand **what this PR adds or changes** just by reading it. Use this structure:

```
## Summary
<1–2 plain-language sentences: what this PR delivers and why>

## What's Added
- <feature / capability / area, in plain words>

## What's Changed
- <existing behavior that is modified or removed, in plain words>
```

## Rules

- Describe **what** and **why**, never **how**. No implementation details: no file names, function/class names, library calls, SQL, column types, or code snippets.
- Write in business/feature terms, e.g. "Roles and permissions are now stored in the database so access can be managed per role", not "Added `Role` and `Permission` Prisma models with a join table".
- Keep each bullet to one line. Aim for 3–6 bullets in total. Merge related changes into a single bullet.
- Omit "What's Changed" if nothing existing was modified. Do not add other sections.
- Do not invent changes; everything must be backed by the diff.
- Output only the description in a single Markdown code block so it can be copied. Do not create, push, or modify anything.

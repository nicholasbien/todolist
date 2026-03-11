---
name: write-pr
description: >
  Generate a well-structured PR title and description from the current branch's
  changes. Analyzes commits, diffs, and linked issues to produce a clear summary,
  change breakdown, and test plan. Use when you're ready to open a pull request.
disable-model-invocation: true
user-invocable: true
argument-hint: "[base-branch]"
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# Write PR — Generate Title & Description

You are a PR writing assistant. Your job is to analyze the current branch's
changes and produce a high-quality pull request title and description that helps
reviewers understand **what** changed, **why** it changed, and **how to test** it.

## Usage

- **`/write-pr`** — Compare against `main` (default base branch)
- **`/write-pr develop`** — Compare against a specific base branch

## Step 1: Gather Context

Run these commands to understand the full scope of changes:

```bash
# Determine base branch (argument or default to main)
BASE_BRANCH="${1:-main}"

# Fetch latest base for accurate diff
git fetch origin "$BASE_BRANCH" 2>/dev/null

# All commits on this branch since diverging from base
git log --oneline "origin/$BASE_BRANCH"..HEAD

# Full diff summary (files changed, insertions, deletions)
git diff --stat "origin/$BASE_BRANCH"..HEAD

# Full diff for content analysis
git diff "origin/$BASE_BRANCH"..HEAD
```

Also check for:
- **Linked issues**: Look at commit messages for references like `#123`, `fixes #456`
- **Branch name**: Often contains ticket/issue references (e.g., `feature/PROJ-123-add-auth`)
- **CLAUDE.md / AGENTS.md**: Check for PR conventions or templates
- **`.github/pull_request_body.md`**: Use as a template if it exists

## Step 2: Analyze the Changes

Categorize every change into one of:

| Category | Description |
|----------|-------------|
| **New Feature** | Wholly new functionality that didn't exist before |
| **Enhancement** | Improvement to existing functionality |
| **Bug Fix** | Corrects incorrect behavior |
| **Refactor** | Code restructuring without behavior change |
| **Test** | New or updated tests |
| **Docs** | Documentation changes |
| **Chore** | Build, CI, config, dependency updates |

For each file changed, understand:
- What was the **intent** of the change (why, not just what)
- Does it introduce new dependencies or APIs?
- Are there breaking changes?
- Are there security implications?

## Step 3: Write the PR Title

Rules for a good title:
- **Under 70 characters**
- **Start with a verb**: Add, Fix, Update, Refactor, Remove, Implement
- **Be specific**: "Add JWT auth to /api/users endpoint" not "Update auth"
- **Match the primary change category**: Use "Fix" for bug fixes, "Add" for new features, etc.
- **No period at the end**
- **No ticket numbers in the title** (put those in the description)

Examples:
- `Add offline sync for todo items via service worker`
- `Fix race condition in session claiming logic`
- `Refactor MCP server to use typed tool handlers`

## Step 4: Write the PR Description

Use this structure:

```markdown
## Summary

<2-4 bullet points describing the high-level changes and WHY they were made.
Focus on the motivation and outcome, not implementation details.>

## Changes

<Group changes by area/component. Use sub-headers if touching multiple systems.>

### <Area 1> (e.g., Backend, Frontend, MCP Server)
- Specific change with brief explanation
- Another change

### <Area 2>
- Changes here

## Breaking Changes

<List any breaking changes. If none, omit this section entirely.>

## Test Plan

- [ ] <Specific, actionable testing step>
- [ ] <Another testing step>
- [ ] <Edge case to verify>
```

### Description Guidelines

- **Summary**: Lead with the "why". What problem does this solve? What does it enable?
- **Changes**: Be specific about what changed in each file/area. Mention new functions,
  modified APIs, added config, etc. Reviewers should know what to look for.
- **Breaking Changes**: Only include if there are actual breaking changes. Don't include
  a "None" section — just omit it.
- **Test Plan**: Write steps that someone unfamiliar with the code can follow. Include:
  - Manual testing steps
  - Which test suites to run (`npm test`, `pytest`, etc.)
  - Edge cases worth verifying
  - Any setup required (env vars, test data, etc.)

## Step 5: Create the PR

Use `gh pr create` with the generated title and description:

```bash
gh pr create --title "<title>" --body "$(cat <<'EOF'
<description body>

<session-link>
EOF
)"
```

If the user just wants the title/description without creating the PR, output them
in a clear format they can copy.

## Rules

- **Read every diff** — don't summarize changes you haven't actually looked at
- **Never fabricate changes** — only describe what's actually in the diff
- **Be honest about scope** — if the PR is large, say so and suggest splitting if appropriate
- **Match the repo's style** — if prior PRs use a certain format, follow it
- **Include the session link** — append the Claude Code session URL at the bottom
- **Don't over-describe trivial changes** — "Fix typo in README" doesn't need a 10-line description
- **Flag concerns** — if you notice potential issues (missing tests, security concerns, large scope), mention them in the description or as comments to the author

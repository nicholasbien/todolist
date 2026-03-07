---
name: review-pr
description: Check review comments on the current branch's PR and address valid ones. Run automatically after pushing a PR, or manually anytime.
user-invocable: true
---

# Review PR Comments

Check for review comments on the current branch's pull request and address valid ones.

## Instructions

1. **Find the PR** for the current branch:
   ```
   gh pr view --json number,title,url
   ```
   If no PR exists, say so and stop.

2. **Fetch review comments**:
   ```
   gh api repos/{owner}/{repo}/pulls/{number}/comments
   ```
   Also check general PR comments (non-inline):
   ```
   gh api repos/{owner}/{repo}/issues/{number}/comments
   ```

3. **For each comment**, analyze whether it's:
   - **Valid and actionable** — a real bug, missing edge case, or clear improvement
   - **Nitpick or style preference** — optional, low value
   - **Already addressed** — fixed in a subsequent commit
   - **Invalid** — based on a misunderstanding of the code

4. **Address valid comments**:
   - Read the relevant file(s) to understand the context
   - Implement the fix
   - Do NOT over-engineer — make the minimum change that addresses the concern

5. **Commit and push** all fixes in a single commit with a message like:
   ```
   Fix review comments: <brief summary of changes>
   ```

6. **Report back** with a summary:
   - Which comments were addressed and how
   - Which were skipped and why (already fixed, nitpick, invalid)

## Important

- Do NOT blindly apply every suggestion — evaluate each one critically
- If a comment conflicts with existing architecture decisions, explain why you're skipping it
- Group related fixes into one commit, not one commit per comment
- If there are no comments, just say "No review comments found" and stop

# Credential incident response

Use this runbook when a real `.env` file or credential is committed. Removing
the file in a later commit is containment only; it does not invalidate a secret
or remove it from Git history, forks, caches, or existing clones.

## 1. Rotate before rewriting history

Revoke and replace every exposed credential with its provider. For the July
2026 incident this includes the server bearer token and every configured
provider key. Redeploy the application with the replacement values and verify:

- the old server token receives `401` from an authenticated API route;
- every old provider key is disabled at its provider;
- the app starts and refreshes successfully with the replacements.

Do not place replacement values in Git, issue comments, CI logs, or chat.

## 2. Preserve local configuration and stop tracking it

The repository ignores `.env`. Keep the local file outside Git and confirm that
`bash scripts/check-no-tracked-env.sh` passes before committing containment.

## 3. Rewrite a reviewed mirror

Coordinate a maintenance window because every collaborator and deployment must
replace its clone after the force-push. Make a protected backup mirror, then use
`git filter-repo` or an equivalent reviewed tool to remove `.env` from every
branch and tag. A typical command in the disposable rewrite clone is:

```bash
git filter-repo --path .env --invert-paths --force
```

Review the rewritten refs before force-pushing. Do not mix functional code
changes into the history-rewrite operation.

## 4. Verify the purge

- `git log --all -- .env` returns no commits.
- `git rev-list --objects --all` contains no `.env` object path.
- A fresh public clone cannot retrieve the file from any branch or tag.
- GitHub's secret alerts are resolved only after rotation and purge evidence is
  recorded.
- The full-history Gitleaks workflow passes.

## 5. Recover collaborators and deployments

Ask collaborators to delete and freshly clone the repository. Recreate release
tags or deployment references from the rewritten history, then verify the
container health endpoint and authenticated API behavior with rotated secrets.

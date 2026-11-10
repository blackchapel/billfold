# Billfold – Instructions for Claude

Standing instructions from the owner. Whenever the owner gives a new
"always do this" instruction, add it to this file in the same session.

## Branching model
- `main`: production. Only receives PRs from `develop`.
- `develop`: integration branch, auto-deployed to Vercel for the owner's testing.
- `feature/*` (or `claude/*`): short-lived branches cut from `develop`,
  tested locally before opening a PR into `develop`.

Flow: feature -> (local testing) -> develop -> (Vercel preview testing by owner) -> main.

## Merge rules
- Claude MAY merge PRs into `develop` (after local tests pass).
- Claude must NEVER merge a PR into `main`, and must never push to `main`
  directly. Only the owner (blackchapel) merges `develop` -> `main`.
- Claude may open the `develop` -> `main` PR when asked, but must not merge it.
- Never force-push to `main` or `develop`.

## Enforcement
- GitHub branch protection on `main`: PR required, status check
  `Only develop can merge into main` required, no force pushes/deletions.
- Workflow `.github/workflows/enforce-main-source.yml` fails any PR to `main`
  whose head branch is not `develop`.

# MyTube audit remediation status

Date: 2026-07-17

## Outcome

The application release blockers found in the audit are fixed and covered by
unit and production-preview browser tests. Repository-side credential
containment is complete, but the credential incident remains open until the
external keys are rotated and the two historical `.env` commits are purged from
the public repository.

## Completed

- React Query devtools now use a development-only lazy import and do not render
  in the production build.
- Confirmed authentication errors take precedence over loading, auth errors are
  not retried, and the loader has an accessible status label.
- Recent and Oldest subscription sorting now uses preserved `addedAt` values;
  legacy rows without timestamps sort last with stable title ordering.
- Desktop icon controls and the sort selector have explicit accessible names
  and toggle states.
- CSS and Framer Motion honor the user's reduced-motion preference.
- Playwright covers production mobile Add, absent production devtools, stale
  auth recovery, authenticated desktop feed, queue round-trip, and Settings.
- CI records coverage and enforces non-regression floors of 68% statements,
  60% branches, 68% functions, and 70% lines.
- CI installs Chromium, runs browser tests, builds and starts the container,
  checks health plus 401/200 auth behavior, and rejects tracked `.env` files.
- A full-history Gitleaks workflow is present and intentionally remains a gate
  until published history is cleaned.
- The root esbuild advisory is resolved; frontend and server audits report zero
  known vulnerabilities.
- Ineffective mixed static/dynamic imports were removed; the production build
  no longer emits those chunking warnings.
- State ownership, conflict, deletion, backup, and recovery invariants are
  documented in `docs/state-ownership.md`.

## Credential finding status: blocked

Vulnerable path: a real `.env` was tracked on the public default branch and is
still present in two historical commits.

Security invariant: no live credential may be tracked or retrievable from any
public repository ref, and previously exposed credentials must be invalid.

Containment performed:

- `.env` was removed from the Git index while the local file was preserved.
- the tracked-environment guard passes;
- full-history secret scanning and an incident runbook were added.

Required external completion:

1. Revoke and rotate the server token and every configured provider key.
2. Redeploy and prove the old values fail.
3. Follow `docs/credential-incident-response.md` to purge `.env` from all
   branches and tags in a coordinated maintenance window.
4. Confirm a fresh public clone cannot retrieve it and Gitleaks passes.

The original security finding cannot be marked fixed before those four steps.

## Remaining incremental work

- Extract the documented auth/bootstrap, channel-discovery, and Settings seams
  only alongside behavior changes; a broad component rewrite is intentionally
  not part of this remediation patch.
- Run the manual keyboard, screen-reader, 200% zoom, contrast, and focus-order
  passes on the deployed build.
- Capture a throttled production performance trace before setting Core Web
  Vitals budgets.
- Move optional provider credentials fully server-side where deployment needs
  them, and design an opt-in session-only server-token mode without breaking
  existing self-hosted clients.

## Verification

- ESLint: pass, zero warnings.
- TypeScript: pass.
- Vitest: 61 files, 507 tests, pass.
- V8 coverage: 69.67% statements, 62.57% branches, 70.57% functions, and
  71.77% lines; all configured gates pass.
- Playwright Chromium: 3 tests, pass.
- Vite/PWA production build: pass; no mixed-import warnings.
- Frontend dependency audit: zero vulnerabilities.
- Server production dependency audit: zero vulnerabilities.
- Disposable Node runtime: health `200`, unauthenticated sync `401`,
  authenticated sync `200`.
- Shell scripts: syntax pass.
- Workflow YAML: parse pass.
- Docker: unavailable on this workstation; the container smoke test could not
  be executed locally and will run on GitHub's Linux runner.

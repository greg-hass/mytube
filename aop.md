# Agent Operating Principles (AOP)

**Mandatory at all times.** Work is not complete until all applicable
requirements are satisfied.

These principles are the canonical source for every project that
references them. Updated in one place, inherited everywhere.

---

## The Nine Principles

1. **Proof Before Change** — understand and validate the current state
   before modifying anything.

2. **Evidence Over Assumption** — base decisions on verifiable facts,
   not inference, guesswork, or speculation.

3. **Independent Review** — escalate to the `advisor` model for
   significant, high-risk, or uncertain changes. Your first read of a
   problem isn't always right; a stronger reviewer catches what you miss.

4. **Every Change Has a Test** — back every change with a test that
   proves the intended outcome. If you broke something, prove the test
   catches it.

5. **Test Before Deployment** — all relevant tests must pass before
   implementation is considered complete or changes are deployed.
   `./scripts/check.sh` is the canonical validation gate for this repo.

6. **Verify After Change** — confirm the change achieved its objective
   and introduced no regressions. Re-check after every modification.
   **Boot the service and verify it starts before declaring done.**

7. **Documentation Reflects Reality** — update all affected docs to
   reflect the current state. Documentation that lies is worse than no
   documentation.

8. **Zero Errors** — resolve all errors before considering work done.
   Errors are failures, not warnings.

9. **Zero Warnings** — investigate and resolve all warnings unless
   explicitly approved. Warnings today are errors tomorrow.

---

## Enforcement

These are not aspirations. They are binding. When working on a project
that references this file, treat the principles as defaults unless
explicitly overridden for that specific project.

Operational specifics — exact CLI commands, diagnostics tools, advisor
invocation patterns — live in the project's own `AGENTS.md`. AOP is the
umbrella; project docs are the raincoat.

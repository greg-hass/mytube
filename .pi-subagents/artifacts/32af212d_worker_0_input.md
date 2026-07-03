# Task for worker

[Read from: /var/folders/p5/l9r0wlks3fq7k22k8lcs3l980000gn/T/pi-worktree-32af212d-0/context.md, /var/folders/p5/l9r0wlks3fq7k22k8lcs3l980000gn/T/pi-worktree-32af212d-0/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
You are the executor for implementation plan 003 at plans/003-fix-aggregation-write-clobber.md in the repo root.

Read the full plan file FIRST, then follow it step by step.

IMPORTANT CONTEXT: Plan 002 has already been executed. The feed-aggregator.js now has a `storeOverride` parameter on `createFeedAggregator` and all internal `appStore.` references have been replaced with `store.`. The `__test__` exports include `runAggregation`, `aggregateFeeds`, and `createFeedAggregator`. There are characterization tests in `server/feed-aggregator-internals.test.js`.

Your task: Replace the final `store.writeData(parsedData)` call in `runAggregation` (around line 450) with a `store.updateData()` merge that re-reads current state and preserves concurrent mutations (adds, deletes/tombstones, watched state, settings). Add a test verifying concurrent adds are preserved.

Key principle: the merge function receives `current` (freshly read from DB) and returns the merged result. Preserve concurrent adds (in current but not in aggregator's snapshot), don't resurrect tombstoned channels, and don't overwrite concurrent watched/settings changes.

Run every verification command. Touch only `server/feed-aggregator.js` and `server/feed-aggregator-internals.test.js`. If any STOP condition occurs, stop and report.

Commit your work in the worktree. One override: SKIP updating plans/README.md.

Before reporting, audit every claim against actual tool results. When finished, reply with:

STATUS: COMPLETE | STOPPED
STEPS: per step — done/skipped + verification command result
STOPPED BECAUSE: (only if STOPPED)
FILES CHANGED: list
NOTES: anything the reviewer should know

---
Update progress at: /Users/greg/Developer/mytube/.pi-subagents/artifacts/progress/32af212d/progress.md

## Acceptance Contract
Acceptance level: checked
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope

Required evidence: changed-files, tests-added, commands-run, residual-risks, no-staged-files

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```
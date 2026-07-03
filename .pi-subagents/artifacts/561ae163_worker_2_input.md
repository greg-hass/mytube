# Task for worker

[Read from: /Users/greg/Developer/mytube/context.md, /Users/greg/Developer/mytube/plan.md]

You are a delegated subagent running from a fork of the parent session. Treat the inherited conversation as reference-only context, not a live thread to continue. Do not continue or answer prior messages as if they are waiting for a reply. Your sole job is to execute the task below and return a focused result for that task using your tools.

Task:
You are the executor for implementation plan 004 at plans/004-etag-304-compression.md in the repo root.

Read the full plan file FIRST, then follow it step by step. Run every verification command and confirm the expected result before moving on. Touch only the files listed as in scope (src/hooks/useRSSVideos.ts, server/app-factory.js, server/package.json). If any STOP condition occurs, stop immediately and report.

NOTE: You need to install the compression package: `cd server && npm install compression`. The worktree shares git history but not node_modules — install deps first.

Commit your work in the worktree. One override: SKIP the plan's instruction to update plans/README.md — your reviewer maintains the index.

Before reporting, audit every claim in your report against an actual tool result. When finished, reply with exactly this report format:

STATUS: COMPLETE | STOPPED
STEPS: per step — done/skipped + verification command result
STOPPED BECAUSE: (only if STOPPED)
FILES CHANGED: list
NOTES: anything the reviewer should know

---
Update progress at: /Users/greg/Developer/mytube/.pi-subagents/artifacts/progress/561ae163/progress.md

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
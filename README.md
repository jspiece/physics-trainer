# AS Physics Trainer

Static HTML/CSS/JavaScript trainer for Cambridge International AS Physics (9702), Musica Mundi School. Original QP/MS PDFs stay on the student's device. No student accounts or backend.

## Development build v1.2-dev

The stability baseline was merged through PR #1. The explanations, optional timer and session restarts are on `dev/mcq-explanations-timer-restart` for testing before merging to main. See [the audit](docs/AUDIT-2026-10-21.md) and [machine-readable metadata checks](docs/index-audit.json).

The bank still contains 414 entries. All **263 MCQ answer letters were matched to the supplied official mark schemes** on 22 October 2026. Each MCQ has AI-authored teaching commentary based on its QP and MS, with LaTeX equations where useful. One item, `s23_13_mcq_15`, has a wording/key ambiguity and is excluded from new scored sessions, leaving **262 active MCQs**. Original answer letters and old results are preserved. Chapter tags and crops still require review; the nine detailed Paper 2 solutions remain unchanged. See [source review](docs/mcq-source-review.json) and [release notes](docs/DEVELOPMENT-2026-10-22.md). No original PDFs are published.

## Run locally

Download/clone `dev/mcq-explanations-timer-restart`, then from the repository directory:

```sh
python -m http.server 8000
```

Open http://localhost:8000 in Chrome or Edge. Connect the extracted local PDF folder; filenames must match `questions.json`. Other modern browsers can use manual file selection when persistent directory access is unavailable. JavaScript dependencies require internet access. The optional class code is in `config.js`; it is not authentication.

## Checks (Node 22 or newer, no npm install)

```sh
node --test tests/*.test.cjs
node scripts/audit-index.cjs
node --input-type=module --check < app.js
```

The regression suite uses a simulated DOM and PDF.js; it is not a real-browser or real-PDF certification. Follow the audit's manual checklist before merging/deploying.

## Student data

The historical localStorage key `mms_physics_web_v05` and question IDs are preserved. Existing history, favourites, sessions and Paper 2 grades are retained. Progress is browser/origin/device-specific, not synchronised. A local development copy has separate storage from GitHub Pages. Use Export backup to save JSON; restore/import is not implemented yet. Do not clear browser site data to update the trainer. Work in one tab to avoid last-write-wins conflicts.

## Practice controls

- **Timer (optional)** is off by default. It measures active practice time, with Pause/Resume and no deadline. It starts when a pending question is rendered, pauses for feedback or the Paper 2 mark scheme, on mode changes, and while the tab is hidden. Closed-browser time is excluded. Time is checkpointed every 15 seconds and when paused; an abrupt crash can lose the last unsaved segment.
- **Restart session** works in both papers using the current chapter selection. It archives partial results, starts a new session and resets its timer. It preserves favourites, old attempts, history and self-assessments; it does not erase the student's progress.
- Paper 2 now has explicit sessions with fixed chapter selection, no repeated question within one session, and an archive of prior self-assessments when restarted. The global Paper 2 summary still uses the latest grade per question.
- Export backups include both session types and timer preferences. Restore/import is not implemented yet.

No Microsoft 365 migration, authentication changes, or production publication are included.

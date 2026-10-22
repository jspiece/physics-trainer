# Development update — 22 October 2026

This extends the stability baseline already merged through PR #1. The changes are on `dev/mcq-explanations-timer-restart`, prepared for a separate draft PR before production publication.

## MCQ explanations and source verification

- 263 MCQ answer letters were compared with the corresponding official MS tables in the supplied archives. All 263 matched the existing index; **no answer letter was changed**.
- 262 question-specific teaching explanations and one ambiguity note are now present, compared with five explanations previously. They use English and Cambridge AS notation, with LaTeX for calculations where useful. They are AI-authored teaching commentary, not official Cambridge worked solutions or independently certified teacher commentary.
- The inputs were the Paper 1 QP archive and the mark-scheme archive supplied in the user's files. Source filenames, MS page numbers, review date and SHA-256 hashes are recorded in `mcq-source-review.json`. Original PDFs remain outside the repository.
- Question `s23_13_mcq_15` is provisionally excluded from new scored sessions. Its printed wording asks for *net work done on the suitcase*; the key gives C (a constant-speed lift), whereas a literal application of net work = change in kinetic energy gives D (accelerating down a slide). The explanation records the ambiguity rather than inventing a justification or changing the official letter. Old results are retained, and the item remains accessible through existing history.
- Three repeated pairs in variants 11 and 13 of October/November 2025 (Q14, Q18, Q39) share diversity-group tags. They retain distinct exam references.
- Chapter classification and PDF crop accuracy remain separate, provisional review tasks. Checking letters does not certify those fields or the Paper 2 bank.

## Optional elapsed-time timer

The timer is off by default and can be enabled independently of starting a session. It has Pause/Resume and no countdown, automatic submission or score penalty.

It runs only after a pending question has rendered successfully and the workspace is unlocked. It pauses on MCQ feedback, Paper 2 assessment or departure from the Question tab, mode changes, and when the browser tab is hidden. It resumes when eligible unless manually paused. After reloading, stored elapsed time is restored without adding time spent while the browser was closed.

Timing is session-level active time, not a claim of full Cambridge exam simulation. It excludes reading the Paper 2 mark scheme and feedback. Checkpoints occur every 15 seconds and on pauses; an abrupt browser crash can lose the last unsaved active segment. Browser localStorage limitations still apply.

## Restart in both modes

Restart uses the current chapter selection and asks for confirmation when an active session exists. It archives completed responses/assessments from the previous session, resets the session timer, and starts a fresh session. It does not clear global history, favourites, prior grades, seen IDs or answer records.

Paper 2 now has an explicit session with fixed chapters and a list of opened questions. Questions do not repeat within that session; after a restart they can be practised again. Prior grades are retained as session snapshots and can be read using **Paper 2 session history**. The global chapter dashboard still uses the most recent grade per question. An ungraded question may be passed over by generating another, and is retained in opening history. There is no arbitrary 20-question limit for Paper 2.

A restart starts a fresh selection rather than guaranteeing a replay of the exact same question order. Unseen items are prioritised, followed by errors/revision flags and then previously successful items, subject to recent-group diversity.

## Compatibility

The existing localStorage key and question IDs are retained. New fields store structured sessions, their snapshots, clocks and timer preference; old v1.0 data without those fields remains supported. Exports contain the new state too. No original PDFs, student data or authentication credentials are committed.

## Validation

22 Node regression tests pass. The new cases cover timer eligibility, feedback/mark-scheme pauses, manual pause, hidden tabs, restored elapsed time, MCQ and Paper 2 restart, cancellation, archived marks, fixed chapters, uniqueness, metadata and exclusion of the ambiguous question. Syntax and whitespace checks pass. These tests use a simulated DOM and PDF.js.

The supplied original PDFs were read for the explanations and all MS letter matches were checked. Selected pages containing diagrams and graphs were rendered and visually inspected. This is source review, not a real-browser end-to-end certification of every crop. The earlier audit's lack of access to original sources is superseded for this MCQ content task; its other limitations still apply.

The development UI still needs browser/tablet verification with local files before merging. No production deployment is included.

Suggested manual checks:

1. Answer a numerical MCQ, check LaTeX feedback and source note, then reload the page and start another session.
2. Enable the timer, pause/resume, switch tabs and modes, reload, and verify that feedback and hidden time are excluded.
3. Restart an incomplete MCQ session and confirm its previous answers/time in the archive.
4. Record a Paper 2 assessment, restart, answer again and verify that both the old session snapshot and latest global grade remain available.
5. Confirm that the quarantined 2023 Q15 does not appear in a new session and is clearly flagged when opened from old history.

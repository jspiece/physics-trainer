# AS Physics Trainer

Static HTML/CSS/JavaScript trainer for Cambridge International AS Physics (9702), Musica Mundi School. Original QP/MS PDFs stay on the student's device. No student accounts or backend.

## Development build v1.1-dev

The first stability patch is on `dev/stability-audit-2026-10-21`; it is intended for testing before merging to main. See [the audit](docs/AUDIT-2026-10-21.md) and [machine-readable metadata checks](docs/index-audit.json).

**The 414 indexed questions have not been individually verified.** Answers, chapter tags, marks and PDF references remain provisional. Five MCQs include an explanation and nine structured questions include detailed solutions. No new official answers or exam questions were created in this patch.

## Run locally

Download/clone the development branch, then from the repository directory:

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

No Microsoft 365 migration, authentication changes, or production publication are included.

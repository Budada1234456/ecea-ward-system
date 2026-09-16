# A: Rich Text and Word Import

This branch owns the rich-text editor and `.docx` import work described in PR #2.

## Allowed paths

- `src/editor/`
- `src/import/`
- `lib/word-fields.mjs`
- `routes/word-import.mjs`
- `tests/fixtures/synthetic-import.docx`
- `tests/rich-text-word.e2e.spec.js`

Do not modify `src/main.jsx`, `src/styles.css`, `server.mjs`, dependency files, or B's form/schema paths. The final wiring is owned by C after A and B are merged.

## Handoff requirements

- Keep saved HTML independent from editor-only zoom state.
- `.docx` import must produce reviewable candidates before applying changes.
- Preserve existing PDF import behavior.
- After B's schema is merged, rebase this branch and document the field mapping and C integration points in this PR.
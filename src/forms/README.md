# B: Form Fields and Ordering

This branch owns the structured web forms, discipline selection, and person/unit ordering work described in PR #2.

## Allowed paths

- `src/forms/`
- `src/data/disciplines.js`
- `src/schema/table-fields.js`
- `src/utils/reorder.js`
- `tests/forms-ordering.e2e.spec.js`

Do not modify `src/main.jsx`, `src/styles.css`, `server.mjs`, dependency files, or A's editor/import paths. The final wiring is owned by C after A and B are merged.

## Handoff requirements

- Make `src/schema/table-fields.js` the source of truth for field keys, order, labels, and PDF visibility.
- Preserve legacy JSON reads and retain old free-text disciplines as `待确认` until replaced.
- Keep person, unit, and discipline ordering stable after save and reload.
- Submit the schema first and document the data shape and C integration points in this PR.
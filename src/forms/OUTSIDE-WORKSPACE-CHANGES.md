# B: Changes Outside the Assigned Workspace

B's assigned paths are `src/forms/`, `src/schema/`, `src/data/`, and
`src/utils/reorder.js`. The paths below are outside that boundary and appear in the
current working tree. This is a handoff inventory, not a claim that every change in
these files was made by B. Keep existing edits and have the owning contributor
review the integration before merging.

## Application integration (C-owned)

| Path | B-related reason for touching it | Review needed |
| --- | --- | --- |
| `src/main.jsx` | Connect the structured tables, discipline selector, and person/unit editors; normalize loaded and saved data; use schema order for preview/PDF and the first selected discipline for primary-discipline output. | Check legacy data, autosave, completeness, preview, and PDF behavior against other changes in this file. |
| `src/styles.css` | Style the form components, field guidance, responsive editor, and pinned first/action columns of horizontally scrolling tables. | Check desktop and 390/360px layout and other existing styles. |

## Test tooling and source generation

| Path | B-related reason for touching it | Review needed |
| --- | --- | --- |
| `package.json` | Add scripts for the form contract test, discipline dataset test, and discipline generator. | Confirm script names and cross-platform execution. |
| `scripts/generate-disciplines.mjs` | Reproduce the checked-in GB/T 13745-2009 discipline dataset from the supplied PDF. | Check source hash, extraction prerequisites, and generation policy. |
| `playwright.config.js` | Discover form E2E specs and select an available local Chromium/Chrome executable. | Check impact on the shared test suite. |
| `tests/cleanup-e2e.mjs` | Clean up test records and test accounts introduced by form browser coverage. | Check deletion scope and shared test data safety. |
| `tests/e2e.spec.js` | Add discipline-search coverage to the existing application test; skip admin-only tests when the required password is absent. | Check behavior in the shared environment. |

## B test files outside the assigned paths

- `tests/forms-ordering.e2e.spec.js`: schema, legacy data, discipline hierarchy,
  and reorder contract assertions. This is now included by `playwright.config.js`.
- `tests/forms-contract.test.mjs`: focused Node contract tests, including guidance
  coverage and primary-discipline derivation.
- `tests/disciplines.test.mjs`: complete generated discipline dataset checks.
- `tests/forms-ui.e2e.spec.js` and `tests/forms-ui-smoke.mjs`: form persistence,
  field guidance, responsive layout, and ordering browser checks.
- `tests/forms-reorder-interactions.e2e.spec.js`: reorder interaction checks.
- `tests/forms-three-fixes.e2e.spec.js` and `tests/forms-three-fixes-smoke.mjs`:
  targeted field-guidance and pinned-column browser checks. The smoke script
  bypasses a locally blocking Playwright runner hook; it is not a substitute for
  the complete E2E suite.

## Repository ignore rule

No change was made to the out-of-workspace `.gitignore`. Its existing `data/` rule
also matches `src/data/disciplines.js`, even though `src/data/` belongs to B. The
discipline module therefore needs explicit staging, for example:

```powershell
git add -f src/data/disciplines.js
```

The repository owner may later narrow that ignore rule in a separate integration
change. No `server.mjs` or dependency version changes are part of this inventory.

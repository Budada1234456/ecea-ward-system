# B Handoff Log

## 2026-09-15

### Scope review

- Confirmed the working branch is `feature/form-fields` at `b77bbba`.
- Confirmed the original B changes remain in `src/forms/`, `src/schema/`,
  `src/data/`, `src/utils/reorder.js`, plus the documented contract test
  `tests/forms-ordering.e2e.spec.js`. The discipline import additionally adds the
  reproducible generator and focused dataset test under `scripts/` and `tests/`,
  with corresponding `package.json` commands.
- Confirmed `src/main.jsx`, `src/styles.css`, Playwright configuration, dependency
  versions, server code, and A-owned paths remain unchanged by B.
- Compared the B field groups and keys with the current legacy structures in
  `src/main.jsx`. The array/object shapes and canonical field keys align, including
  the `number` to `authorizationNumber` compatibility mapping.

### Pre-handoff corrections

- Corrected the documented GB/T hierarchy example: a 3-digit code is level 1.
- Corrected discipline level text in the selector so hierarchy level is not
  mislabeled as code digit length.
- Made discipline parent validation independent of source record order and added
  strict hierarchy-path validation.
- Prevented an explicitly undefined canonical field from overriding a populated
  legacy alias during record normalization.
- Added drag, up, down, and deletion controls with live ordering announcements to
  the discipline selector, including keyboard focus restoration after a move.
- Added drag ordering and live ordering announcements to the person/unit editor;
  its existing up/down controls continue to use `reorderAndRenumber()`.
- Added regression coverage for unordered source records and invalid hierarchy
  paths.

### Verification

- Verified the supplied 105-page `13745-2009-gbt-cd-300.pdf` as the selectable-text
  GB/T 13745-2009 standard. Its SHA-256 is
  `E6FE7693A8F199F304E91157A5BD5B0BDAF914EBDA275F1A36F7F7FAA8403E53`.
- Extracted every code-bearing row from Table 1 (PDF pages 8-91) with Xpdf
  `pdftotext -table`: 62 level-1, 738 level-2, and 2732 level-3 records, for 3532
  records total. Uncoded cross-references in the name column are not records.
- Added a reproducible generator that rejects a changed source hash, malformed
  counts, duplicate codes, missing parents, changed group-code counts, and changed
  representative code/name pairs before replacing the checked-in dataset.
- Preserved the source's `19030` development-psychology row and its printed
  `19035xx` child codes with an explicit parent override. The PDF page was visually
  reviewed; the mismatch exists in the published table and is not extraction loss.
- Documented rather than concealed the source inconsistency: clause 5.2 declares
  62/676/2382 disciplines, but direct Table 1 enumeration gives 62/738/2732 coded
  rows. The import includes all formal coded rows, including `99` group entries.
- `npm run test:disciplines` validates the complete generated dataset and selected
  first-, second-, third-level, cross-page, `99`, and hierarchy-exception records.
- `node node_modules/vite/bin/vite.js build` passed after the corrections. Vite
  reports the pre-existing large-chunk advisory for the main bundle.
- Prettier validation passed for B-owned source, documentation, and the isolated
  contract test.
- Direct Node contract assertions passed for legacy normalization, stable IDs,
  ordering, pending disciplines, and hierarchy validation.
- The standalone `src/forms/index.js` entry bundled successfully as browser ESM,
  covering component modules that C has not yet imported from `src/main.jsx`.
- `git diff --check` passed.

### Integration completed

- Wired schema-backed structured forms, the official discipline path selector, and
  person/unit editors into `src/main.jsx`.
- Preview and browser-generated PDF output consume schema field order and
  `pdfVisible`; discipline output includes the complete level-one-to-terminal path.
- Verified autosave ordering, mobile list/detail state, focus restoration, 44 by 44
  CSS-pixel controls, 390/360px overflow, and hidden mobile navigation with
  Playwright screenshots and geometry assertions.
- Added `npm run test:forms-contract`; shared Playwright discovery includes the form
  contract and UI acceptance specs.
- `src/data/disciplines.js` remains ignored by the repository-wide `data/` rule and
  must be staged with `git add -f src/data/disciplines.js`.
- Git author identity is not configured locally, so no commit has been created.

## 2026-09-16 final acceptance

- `node --test tests/forms-contract.test.mjs` passed all 4 contract tests.
- `node --test tests/disciplines.test.mjs` validated all 3532 discipline records.
- `node node_modules/vite/bin/vite.js build` passed; only the existing large-chunk
  advisory remains.
- The focused form UI acceptance test passed in 1.3 minutes. It covers all eight
  repeated record groups, stable IDs, refresh restoration, schema-backed economic
  summary fields, ordering, the discipline path, mobile focus, 44 by 44 CSS-pixel
  controls, hidden-navigation geometry, and 390/360px overflow.
- The complete Playwright discovery run reported 14 passed and 2 skipped in 1.3
  minutes. The two administrator portal tests were skipped because
  `TEST_ADMIN_PASSWORD` was intentionally not available in the environment.
- Final screenshots are `test-results/forms-desktop.png` and
  `test-results/forms-mobile.png`; both were visually reviewed.
- Prettier passed for every changed source, test, script, and documentation file;
  `git diff --check` passed.

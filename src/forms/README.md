# B: Form Fields and Ordering

This branch owns the structured web forms, discipline selection, and person/unit ordering work described in PR #2.

## Allowed paths

- `src/forms/`
- `src/schema/`
- `src/data/`
- `src/utils/reorder.js`

Do not modify `src/main.jsx`, `src/styles.css`, `server.mjs`, dependency files, or A's editor/import paths. The final wiring is owned by C after A and B are merged.

Any necessary change outside these paths is recorded in
`src/forms/OUTSIDE-WORKSPACE-CHANGES.md` for review by the owning contributor.

## Handoff requirements

- Make `src/schema/table-fields.js` the source of truth for field keys, order, labels, and PDF visibility.
- Preserve legacy JSON reads and retain old free-text disciplines as `待确认` until replaced.
- Keep person, unit, and discipline ordering stable after save and reload.
- Submit the schema first and document the data shape and C integration points in this PR.

## Implemented contract

The schema is exported from `src/schema/table-fields.js`:

- `FIELD_GROUPS` is the stable group order.
- `tableFields[group]` is the stable field and export order.
- `FIELD_DEFAULTS` and `createDefaultRecord(group)` provide new-record values.
- `wordKey` and `pdfVisible` are stable export metadata and must not be inferred from labels.

The current application JSON uses these groups:

| Group                                                                                                    | Shape                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `awardRecords`, `ipRecords`, `paperRecords`, `applicationUnits`, `economicRecords`, `cooperationRecords` | arrays of records with stable `id`                            |
| `economicSummary`                                                                                        | one object                                                    |
| `people`, `units`                                                                                        | ordered arrays of records with stable `id` and numeric `rank` |

`src/forms/data-contract.js` is pure and has no API dependency. C should call
`normalizeApplicationData()` once after loading an application and before passing
the value to the controlled form components. The save boundary should persist the
normalized value without dropping unrelated legacy keys.

### Discipline value shape

Confirmed selections use:

```js
{
  id: "discipline-4806010",
  code: "4806010",
  name: "煤炭能",
  level: 3,
  parentCode: "48060",
  path: ["480", "48060", "4806010"],
  status: "confirmed"
}
```

Legacy strings are retained without guessed codes:

```js
{
  id: "discipline-legacy-1",
  code: null,
  name: "旧自由文本",
  level: null,
  parentCode: null,
  path: [],
  status: "pending"
}
```

`normalizeDisciplineSelection()` accepts the current two-string format and reads
at most three entries. It does not silently map a legacy name to an official code.
`derivePrimaryDiscipline()` is the only primary-discipline derivation entry point
for later preview and PDF integration.

## Runtime integration

C integration is complete:

1. API data is normalized on load and persisted without dropping unrelated legacy keys.
2. People, units, disciplines, and structured rows preserve stable IDs and ordering.
3. Web forms, preview, and PDF use schema field order and `pdfVisible` metadata.
4. Desktop and 390/360px browser tests cover persistence, responsive state, focus,
   touch-target dimensions, and output ordering.

`src/data/disciplines.js` contains every code-bearing row extracted from Table 1 of
the supplied GB/T 13745-2009 PDF. Rebuild it with `npm run generate:disciplines`
and validate it with `npm run test:disciplines`. The generator verifies the source
SHA-256, row counts, group-code counts, parent references, duplicate codes, and
representative code/name pairs before writing the module.

Clause 5.2 declares 62/676/2382 entries, while direct enumeration of Table 1 gives
62/738/2732 code-bearing rows. The dataset uses the auditable table-row policy and
does not discard entries to force the declared totals. It also preserves the
published `19030`/`19035xx` development-psychology coding exception and represents
the explicit parent relationship in `parentCode` and `path`.

## Verification

Run `npm run test:forms-contract` for the Node contract suite,
`npm run test:disciplines` for the complete GB/T dataset, and
`npx playwright test tests/forms-ui.e2e.spec.js --workers=1` for browser acceptance.

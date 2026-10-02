# NovaDrive CRO Supplier-Risk Console

From an alert to the evidence to a sourcing option in three clicks.

The source of truth is `source/NovaDrive_Supplier_Risk_Model.xlsx` (the mother workbook). Every number the console shows is recomputed by `lib/engine.ts` from the inputs extracted to `/data`. The parity tests check those numbers against the workbook's own values.

## Commands

| Command | What it does |
| --- | --- |
| `npm run extract` | Re-reads both workbooks in `source/` and rewrites `/data/*.json` and `tests/fixtures/workbook-expected.json` |
| `npm test` | Engine parity suite (Vitest) |
| `npm run dev` | Local app at http://localhost:3000 |
| `npm run typecheck` | TypeScript check |
| `npm run e2e` | Playwright demo-path test (uses the installed Chrome) |

## Live supplier search (optional)

The Alternates screen can search current public sources through `app/api/alternates/search/route.ts`. It needs `ANTHROPIC_API_KEY`, which is read on the server only and never sent to the browser (see `.env.example`). Without a key, the route returns "not configured" and the console keeps the curated shortlist. Everything else works offline from the bundled JSON.

## Layout

- `lib/types.ts`: data contracts
- `lib/engine.ts`: pure scoring engine (Scorecard, Concentration, Sensitivity, Alerts, Alternates, Checks)
- `lib/data.ts`: bundled dataset
- `scripts/extract.ts`: workbook to JSON
- `tests/parity.test.ts`: workbook parity and PRD section 11 acceptance tests
- `DECISIONS.md`: judgement calls where the PRD was ambiguous

## Dates

- Case cut-off: 30 Sep 2025. Applies to the network, scores and alerts.
- Market research as-of: 2 Oct 2026. Applies to the alternate suppliers.

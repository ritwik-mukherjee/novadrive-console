# Decisions log

Where the PRD was ambiguous, the option that makes evidence more inspectable for the CRO was chosen. Each entry says what the workbook does, what the app does, and why.

## Data and extraction

1. **Workbook file name.** The supplied file is `NovaDrive_Supplier_Risk_Model_1.xlsx`. It is copied unchanged to `source/NovaDrive_Supplier_Risk_Model.xlsx` (the PRD name), and the organisers' case workbook is copied to `source/`. `npm run extract` regenerates `/data` from these two files.
2. **Inputs only in `/data`; workbook results only in the test fixture.** Computed columns (scores, ranks, exposures, N_eff, zone revenue, alert scores, fitment, sensitivity ranks, checks) are written to `tests/fixtures/workbook-expected.json`. They are used by the parity tests only and are never imported by the app.
3. **Verbatim evidence and event text.** `evidence.json` carries the original evidence wording (`detail`, `locator`) from the case workbook's Relationship Evidence tab, next to the team's verdict and reasoning. `events.json` carries the original event detail and source type from Risk Event Flags. This lets the CRO read the source as well as our interpretation of it.
4. **NovaDrive's own plants are sites.** Harbor Works, Plateau Works and Coastal Works come from Business Context and are stored with `zone: null` (not disclosed). This is what the "Harbor Works" disambiguation needs. Harbor Freight's SITE-242 is also called "Harbor Works".
5. **Action-plan "value protected" is a node reference.** In the workbook these cells are live links to a Scorecard RaR cell (`=Scorecard!AK15`). The extract stores the node ID (`valueNodeId`), and the app recomputes RaR. It is not frozen as a number.
6. **Scenario weights that point at Assumptions inherit the live base.** In the Sensitivity tab, S1 (all weights) and the impact weights of S3 and S4 are formulas that reference Assumptions. They are stored as `null`, meaning "use the current base weight", so the scenarios follow the weight sliders as they do in Excel.

## Engine

7. **Excel's 15-significant-digit comparison.** Excel compares doubles at 15 significant digits. UUGreenPower's fitment is exactly 60 in the workbook (RESERVE), but in IEEE arithmetic it comes out as 59.999…. Every threshold test (bands, quadrant, alert levels, fitment) goes through `xl()` (`toPrecision(15)`). Without this, one of the 28 recommendations would differ from the workbook.
8. **Link-grade confidence points.** The workbook takes the MAXIFS of grade points over all Tier 1–3 supply links (Network rows 5–36). All of them are `include = 1`, so this equals the PRD's "best include-link". CommonSpan (group node) has no supply links; the workbook hard-codes 3. The app derives that 3 from CommonSpan's own ownership evidence (DOC-075, grade A) and says so in the confidence breakdown.
9. **Group node detection.** A scored node with ownership links but no supply links is treated as a group. Its members are the customers of those ownership links (Aster and Boreal), so CommonSpan's exposure = Aster + Boreal, capped at 1. Nothing about the group is hard-coded.
10. **Imputation peer set.** The 75th percentile is taken over all 25 scored rows that have the value, including the CommonSpan group row. This matches the workbook's `PERCENTILE($S$6:$S$30, …)`. Assurance gap is imputed on its raw 0–100 index, which is already a risk score.
11. **Ownership-level and critical-sub-tier N_eff are computed, not copied.** In the workbook these are typed-in judgements.
    - **Ownership level:** Tier-1 allocations are grouped by ultimate owner, using the Ownership links.
    - **Critical sub-tier:** for each Tier-2 input category feeding the component (dies, ceramics, substrates and so on), we trace the Tier-1 allocation to the Tier-2 supplier, compute N_eff, and take the minimum.

    Both reproduce the workbook for all 7 components (parity-tested).
12. **Alert credibility for duplicates and stale items.** The scale says C = 0 for duplicates and stale items. The engine applies this rule rather than relying on the typed 0. De-duplication is computed from the source family (and, if that is blank, from title similarity > 0.85 with an equal effective date). The workbook's de-dup sentence is kept as the explanation.
13. **Alert exposure for unmatched events.** When an event has no primary node, the workbook types E by hand: 0 for wrong-entity, duplicate and stale items, and 1.0 (upper bound) for the unresolved Gulf Arc location. These typed values are kept as `exposureOverride`. When there is a primary node, E is always the node's live revenue share.

## Build

14. **Next.js 16 / Tailwind v4.** These are the latest versions (the PRD says "14+"). Tailwind's default colour palette, shadows and radii are switched off in `globals.css`, so only the section 8 tokens exist.
15. **Parity tolerance.** The full workbook comparison runs at 1e-6, which is tighter than the PRD's ±0.1. The PRD's section 11 table is also tested separately, at ±0.1.
16. **Live search keeps only sourced candidates.** A live candidate is shown only if it cites one valid http(s) page the model read. Entries the model lists from memory, or marks `not read` or `verify`, are dropped, and the Alternates screen shows how many were dropped. This is the same evidence rule the curated shortlist follows. The search has one 135 s deadline across all turns, inside the function's 150 s limit, and retries are off so a failed call isn't billed twice. Effort is set to medium: at low, the model stopped after one or two searches and returned 0–1 sourced candidates. Empty results are not cached.

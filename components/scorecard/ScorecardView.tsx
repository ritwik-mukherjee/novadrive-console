"use client";

import { useMemo, useState } from "react";
import { BandChip, ConfidenceMarker } from "@/components/ui/marks";
import { useDrawer } from "@/lib/drawer";
import { IMPUTABLE_LABELS, type ScoredNode } from "@/lib/engine";
import { fmtNum } from "@/lib/format";
import { passesFilters, useFilters } from "@/lib/store";
import { baseModel, useModel } from "@/lib/weights";
import { BubbleChart } from "./BubbleChart";
import { WeightsPanel } from "./WeightsPanel";

type SortKey = "rank" | "name" | "tier" | "zone" | "V" | "I" | "priority" | "confidence" | "stability";
const CONF_ORDER = { High: 3, Medium: 2, Low: 1 } as const;

export function ScorecardView() {
  const { model, weights, vulnRawSum, impactRawSum, sensitivity, activeScenario, isBase } = useModel();
  const filters = useFilters();
  const openDrawer = useDrawer((s) => s.open);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });

  const stability = useMemo(() => new Map(sensitivity.rows.map((r) => [r.id, r])), [sensitivity]);
  const visible = (n: ScoredNode) => passesFilters(n, filters);

  const rows = useMemo(() => {
    const val = (n: ScoredNode): number | string => {
      switch (sort.key) {
        case "name":
          return n.name;
        case "tier":
          return n.input.tier;
        case "zone":
          return n.input.zone;
        case "V":
          return n.V;
        case "I":
          return n.I;
        case "priority":
          return n.priority;
        case "confidence":
          return CONF_ORDER[n.confidence.label] * 10 + n.confidence.points;
        case "stability":
          return stability.get(n.id)?.top5Count ?? 0;
        default:
          return n.rank;
      }
    };
    return model.scored.filter((n) => passesFilters(n, filters)).sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "string" ? x.localeCompare(y as string) : x - (y as number);
      return c * sort.dir || a.rank - b.rank;
    });
  }, [model, filters, sort, stability]);

  const maxP = Math.max(...model.scored.map((n) => n.priority));
  const header = (key: SortKey, label: string, align: "left" | "right" = "left", defaultDir: 1 | -1 = 1) => (
    <th
      scope="col"
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      className={`border-b hairline py-2 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        className="label hover:text-ink"
        onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : defaultDir }))}
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[230px_1fr]">
      <WeightsPanel
        normalised={weights}
        vulnRawSum={vulnRawSum}
        impactRawSum={impactRawSum}
        activeScenario={activeScenario}
        isBase={isBase}
      />

      <div className="min-w-0 space-y-6">
        <section className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <BubbleChart nodes={model.scored} onSelect={(id) => openDrawer({ kind: "node", id })} dimmed={(n) => !visible(n)} />
          <div className="space-y-3 text-[13px]">
            <p className="serif text-base leading-snug">
              Priority = Impact × Vulnerability ÷ 100. Confidence is a separate axis: it decides whether to act or to verify, and it never changes the score.
            </p>
            <p className="text-muted">
              {activeScenario
                ? `Scenario ${activeScenario} active.`
                : isBase
                  ? "Base weights (team judgement)."
                  : "Custom weights."}{" "}
              Arrows show rank movement against the base case. &ldquo;Top-5&rdquo; counts how many of the five weighting
              scenarios keep a node in the top five.
            </p>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {header("rank", "Rank")}
                {header("name", "Supplier")}
                {header("tier", "Tier")}
                {header("zone", "Zone")}
                {header("V", "V", "right", -1)}
                {header("I", "I", "right", -1)}
                {header("priority", "Priority", "left", -1)}
                <th scope="col" className="label border-b hairline py-2 text-left font-normal">Band</th>
                <th scope="col" className="label border-b hairline py-2 text-left font-normal">Quadrant</th>
                {header("confidence", "Confidence", "left", -1)}
                <th scope="col" className="label border-b hairline py-2 text-left font-normal">Recommended action</th>
                {header("stability", "Top-5", "right", -1)}
                <th scope="col" className="label border-b hairline py-2 text-left font-normal">Missing data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => {
                const delta = (baseModel.byId.get(n.id)?.rank ?? n.rank) - n.rank;
                const st = stability.get(n.id);
                return (
                  <tr
                    key={n.id}
                    tabIndex={0}
                    onClick={() => openDrawer({ kind: "node", id: n.id })}
                    onKeyDown={(e) => e.key === "Enter" && openDrawer({ kind: "node", id: n.id })}
                    className="cursor-pointer border-b hairline align-top hover:bg-paper-2 focus:bg-paper-2"
                  >
                    <td className="num py-2 pr-2">
                      {n.rank}
                      {delta !== 0 && (
                        <span className="ml-1 text-xs text-muted" title={`Base rank ${n.rank + delta}`}>
                          {delta > 0 ? `↑${delta}` : `↓${-delta}`}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div>{n.name.replace(/ Ltd\.$/, "")}</div>
                      <div className="text-xs text-muted">
                        {n.id}
                        {n.kind === "group" ? " · group (owner)" : ""}
                      </div>
                    </td>
                    <td className="num py-2 pr-2">T{n.input.tier}</td>
                    <td className="num py-2 pr-2">{n.input.zone}</td>
                    <td className="num py-2 pr-3 text-right">{fmtNum(n.V)}</td>
                    <td className="num py-2 pr-3 text-right">{fmtNum(n.I)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="num w-9 text-right">{fmtNum(n.priority)}</span>
                        <span className="h-1.5 w-20 bg-paper-2">
                          <span className="block h-1.5 bg-ink" style={{ width: `${(n.priority / maxP) * 100}%` }} />
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <BandChip band={n.band} />
                    </td>
                    <td className="py-2 pr-3 text-muted">{n.quadrant}</td>
                    <td className="py-2 pr-3" title={`${n.confidence.points} of 6 points`}>
                      <ConfidenceMarker label={n.confidence.label} showText />
                    </td>
                    <td className="py-2 pr-3">{n.actionLabel}</td>
                    <td className="num py-2 pr-3 text-right">{st ? `${st.top5Count}/5` : "—"}</td>
                    <td className="py-2 text-xs">
                      {n.imputed.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span
                          className="border border-dashed border-ink px-1"
                          title="Missing: imputed at the peer 75th percentile. Missing is not treated as low risk."
                        >
                          {n.imputed.map((f) => IMPUTABLE_LABELS[f]).join(", ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Showing {rows.length} of {model.scored.length} nodes. Weights used: V = {fmtNum(weights.vuln.financial * 100, 0)}/
            {fmtNum(weights.vuln.operational * 100, 0)}/{fmtNum(weights.vuln.assurance * 100, 0)}/
            {fmtNum(weights.vuln.geographic * 100, 0)} (financial/operational/assurance/geographic) + {weights.overlayPoints} event points; I ={" "}
            {fmtNum(weights.impact.revenue * 100, 0)}/{fmtNum(weights.impact.recovery * 100, 0)}/
            {fmtNum(weights.impact.centrality * 100, 0)} (revenue/recovery/centrality).
          </p>
        </div>
      </div>
    </div>
  );
}

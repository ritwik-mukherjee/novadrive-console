"use client";

import Link from "next/link";
import { BandChip, ConfidenceMarker } from "@/components/ui/marks";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import type { ImputableField, ScoredNode } from "@/lib/engine";
import { entityName, linksTouching } from "@/lib/evidence";
import { fmtNum, fmtPct } from "@/lib/format";
import { PRODUCT_IDS } from "@/lib/types";
import { useModel } from "@/lib/weights";
import { NodeAlerts } from "./NodeAlerts";
import { EvidenceRecordView, LinkEvidence, Section, Waterfall } from "./parts";

export function NodeDrawer({ id }: { id: string }) {
  const { model, weights } = useModel();
  const open = useDrawer((s) => s.open);
  const n = model.byId.get(id);
  if (!n) return <p className="text-muted">Unknown node {id}.</p>;
  const entity = dataset.entities.find((e) => e.id === id);
  const site = dataset.sites.find((s) => s.id === entity?.primaryFacilityId);
  const a = dataset.assumptions;

  // Links: own links, plus ownership links for a group node
  const touching = linksTouching(id);
  const upstream = dataset.links.filter((l) => l.customerId === id && l.supplierTier !== null && l.include);
  const downstream = dataset.links.filter((l) => l.supplierId === id && l.include);
  const members = dataset.links.filter((l) => l.type === "Ownership" && l.supplierId === id).map((l) => l.customerId!);
  // Records cited in the dependency status, e.g. "Confirmed sole (DOC-078)"
  const keyEvidence = [...new Set(n.input.dependencyStatus.match(/(DOC|SHP)-\d+/g) ?? [])];
  const memberLinks = members.flatMap((m) => dataset.links.filter((l) => l.supplierId === m && l.include));

  return (
    <div className="space-y-4 text-[13px]">
      {/* 1. Header */}
      <header className="space-y-1.5">
        <p className="label">
          {n.id} · Tier {n.input.tier}
          {n.kind === "group" ? " · group (owner) node" : ""}
        </p>
        <h2 className="text-xl leading-tight">{n.name}</h2>
        <p className="text-muted">
          {n.input.role}
          <br />
          Zone {n.input.zone} · facility {n.input.facility}
          {site ? ` (${site.name}, ${site.role})` : ""}
        </p>
        <p className="text-muted">Dependency: {n.input.dependencyStatus}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          <span className="num">#{n.rank}</span>
          <BandChip band={n.band} />
          <ConfidenceMarker label={n.confidence.label} showText />
          <span className="text-muted">{n.quadrant}</span>
        </div>
        <p className="border-l-2 border-accent pl-2 font-medium">{n.actionLabel}</p>
        {keyEvidence.length > 0 && (
          <div className="pt-2">
            <p className="label mb-1">Key evidence for the dependency</p>
            <ul className="space-y-2">
              {keyEvidence.map((d) => (
                <EvidenceRecordView key={d} id={d} />
              ))}
            </ul>
          </div>
        )}
      </header>

      {/* 2. Why this score */}
      <Section title="Why this score">
        <p className="mb-2">
          Priority <span className="num font-medium">{fmtNum(n.priority)}</span> = Impact{" "}
          <span className="num">{fmtNum(n.I)}</span> × Vulnerability <span className="num">{fmtNum(n.V)}</span> ÷ 100
        </p>
        <div className="space-y-3">
          <Waterfall
            totalLabel="Impact"
            total={n.I}
            items={[
              { label: `Revenue ×${fmtNum(weights.impact.revenue * 100, 0)}%`, value: n.iContrib.revenue, note: `${fmtPct(n.share, 1)} of revenue` },
              { label: `Recovery ×${fmtNum(weights.impact.recovery * 100, 0)}%`, value: n.iContrib.recovery, note: `${n.input.ttrWeeks} wks of ${a.ttrCap} cap` },
              { label: `Centrality ×${fmtNum(weights.impact.centrality * 100, 0)}%`, value: n.iContrib.centrality, note: `${n.input.downstreamT1} of ${a.centralityMax} Tier-1s` },
            ]}
          />
          <Waterfall
            totalLabel="Vulnerability"
            total={n.V}
            cap={n.V >= 100 ? "Capped at 100." : undefined}
            items={[
              { label: `Financial ×${fmtNum(weights.vuln.financial * 100, 0)}%`, value: n.vContrib.financial },
              { label: `Operational ×${fmtNum(weights.vuln.operational * 100, 0)}%`, value: n.vContrib.operational },
              { label: `Assurance ×${fmtNum(weights.vuln.assurance * 100, 0)}%`, value: n.vContrib.assurance },
              { label: `Geography ×${fmtNum(weights.vuln.geographic * 100, 0)}%`, value: n.vContrib.geographic },
              { label: "Event overlay", value: n.vContrib.overlay, note: n.pillars.overlay ? "Independently confirmed entity-level event (EV-003)" : "No confirmed entity-level event" },
            ]}
          />
        </div>
        <IndicatorTable n={n} />
      </Section>

      {/* 3. Exposure */}
      <Section title="Exposure">
        <table className="w-full text-[12.5px]">
          <tbody>
            {PRODUCT_IDS.map((p) => {
              const prod = dataset.products.find((x) => x.id === p)!;
              return (
                <tr key={p}>
                  <td className="py-0.5 text-muted">
                    {p} {prod.name}
                  </td>
                  <td className="num text-right">{fmtPct(n.exposure[p], 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
          <dt className="text-muted">Revenue exposed</dt>
          <dd className="num text-right">
            USD {fmtNum(n.revenueExposed, 1)}m / yr ({fmtPct(n.share, 1)})
          </dd>
          <dt className="text-muted">Weekly</dt>
          <dd className="num text-right">USD {fmtNum(n.weekly, 1)}m</dd>
          <dt className="text-muted">Revenue-at-risk over {n.input.ttrWeeks} wks</dt>
          <dd className="num text-right font-medium">USD {fmtNum(n.rar, 0)}m</dd>
        </dl>
        <p className="mt-1 text-xs text-muted">
          Time-to-recover basis: {n.input.ttrBasis}. Gross revenue, no inventory buffer disclosed: an upper bound for sizing, not a forecast.
        </p>
      </Section>

      {/* 4. Confidence */}
      <Section title="Confidence (separate from risk)">
        <table className="w-full text-[12.5px]">
          <tbody>
            <tr>
              <td className="py-0.5 text-muted">Link evidence grade</td>
              <td className="text-xs">{n.confidence.linkSource}</td>
              <td className="num text-right">{n.confidence.linkPts}/3</td>
            </tr>
            <tr>
              <td className="py-0.5 text-muted">Data completeness</td>
              <td className="text-xs">{n.confidence.indicatorsAvailable} of 8 indicators</td>
              <td className="num text-right">{n.confidence.dataPts}/2</td>
            </tr>
            <tr>
              <td className="py-0.5 text-muted">Dependency certainty</td>
              <td className="text-xs">{n.input.tier === 1 ? "Tier-1 allocation disclosed" : n.input.dependencyStatus}</td>
              <td className="num text-right">{n.confidence.dependencyPts}/1</td>
            </tr>
            <tr className="border-t hairline">
              <td className="py-0.5 font-medium">Confidence</td>
              <td>
                <ConfidenceMarker label={n.confidence.label} showText />
              </td>
              <td className="num text-right font-medium">{n.confidence.points}/6</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted">Confidence decides act vs verify; it does not change the score.</p>
      </Section>

      {/* 5. Evidence */}
      <Section title={`Evidence (${touching.length} links)`}>
        <div className="divide-y divide-rule">
          {touching.map((l) => (
            <LinkEvidence key={l.id} link={l} defaultOpen={touching.length <= 2} />
          ))}
        </div>
      </Section>

      {/* 6. Paths */}
      <Section title="Paths">
        <div className="grid grid-cols-2 gap-3 text-[12.5px]">
          <div>
            <p className="text-xs text-muted">Upstream suppliers</p>
            <PathList ids={upstream.map((l) => l.supplierId)} onOpen={(x) => open({ kind: "node", id: x })} />
          </div>
          <div>
            <p className="text-xs text-muted">{n.kind === "group" ? "Owns" : "Downstream customers"}</p>
            <PathList
              ids={n.kind === "group" ? members : downstream.map((l) => l.customerId ?? "")}
              onOpen={(x) => open({ kind: "node", id: x })}
              products={n.kind === "group" ? memberLinks.flatMap((l) => PRODUCT_IDS.filter((p) => l.productFlags[p])) : undefined}
            />
          </div>
        </div>
      </Section>

      {/* 7. Alerts */}
      <Section title="Alerts touching this node">
        <NodeAlerts nodeId={n.id} />
      </Section>

      {/* 8. Alternates */}
      <div className="border-t hairline pt-3">
        <Link href={`/alternates?node=${n.id}`} className="inline-block border border-accent px-3 py-1.5 text-accent hover:bg-accent hover:text-paper">
          Find alternates →
        </Link>
      </div>
    </div>
  );
}

function PathList({ ids, onOpen, products }: { ids: string[]; onOpen: (id: string) => void; products?: string[] }) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return <p className="text-muted">None mapped</p>;
  return (
    <ul className="space-y-0.5">
      {unique.map((id) =>
        id === "NOVADRIVE" ? (
          <li key={id}>NovaDrive (Tier-1 award)</li>
        ) : (
          <li key={id}>
            <button className="text-left underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => onOpen(id)}>
              {entityName(id).replace(/ Ltd\.$/, "")}
            </button>
          </li>
        ),
      )}
      {products && <li className="text-muted">→ {[...new Set(products)].join(", ")}</li>}
    </ul>
  );
}

function IndicatorTable({ n }: { n: ScoredNode }) {
  const imputed = (f: ImputableField) => n.imputed.includes(f);
  const row = (label: string, raw: number | null, score: number | null, field?: ImputableField, unit = "") => {
    const isImp = field ? imputed(field) : false;
    return (
      <tr key={label}>
        <td className="py-0.5 text-muted">{label}</td>
        <td className="num text-right">{raw === null ? "missing" : `${fmtNum(raw, 2).replace(/\.?0+$/, "")}${unit}`}</td>
        <td className="num pl-3 text-right">
          {score === null ? (
            "—"
          ) : isImp ? (
            <span
              className="border border-dashed border-ink px-1"
              title="Missing — imputed at peer 75th percentile; missing ≠ low risk."
            >
              {fmtNum(score)} imputed
            </span>
          ) : (
            fmtNum(score)
          )}
        </td>
      </tr>
    );
  };
  return (
    <table className="mt-3 w-full text-[12.5px]">
      <thead>
        <tr>
          <th className="label text-left font-normal">Indicator</th>
          <th className="label text-right font-normal">Raw</th>
          <th className="label text-right font-normal">Risk 0-100</th>
        </tr>
      </thead>
      <tbody>
        {row("Net debt / EBITDA", n.raw.netDebtEbitda, n.scores.leverageUsed, "netDebtEbitda", "x")}
        {row("Current ratio", n.raw.currentRatio, n.scores.liquidityUsed, "currentRatio", "x")}
        {row("OTD 3-month", n.raw.otd3m, n.scores.otdLevel, undefined, "%")}
        {row("OTD change", n.raw.otdDelta, n.scores.otdTrend, undefined, " pp")}
        {row("Assurance gap", n.raw.assuranceGap, n.scores.assuranceUsed, "assuranceGap")}
        {row("Physical hazard", n.raw.physicalHazard, n.raw.physicalHazard)}
        {row("Logistics friction", n.raw.logisticsFriction, n.raw.logisticsFriction)}
        {row("Infrastructure", n.raw.infrastructure, n.raw.infrastructure)}
      </tbody>
    </table>
  );
}


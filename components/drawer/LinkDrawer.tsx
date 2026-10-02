"use client";

import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { entityName, linkById } from "@/lib/evidence";
import { fmtNum } from "@/lib/format";
import { PRODUCT_IDS } from "@/lib/types";
import { useModel } from "@/lib/weights";
import { EvidenceRecordView, Section } from "./parts";

export function LinkDrawer({ id }: { id: string }) {
  const { model } = useModel();
  const open = useDrawer((s) => s.open);
  const l = linkById.get(id);
  if (!l) return <p className="text-muted">Unknown link {id}.</p>;

  // Revenue flowing: Tier-1 = allocation × product revenue; upstream = customer's exposed revenue
  let flowing = 0;
  if (l.include && l.supplierTier === 1) {
    flowing = PRODUCT_IDS.reduce((s, p) => s + (l.allocation ?? 0) * l.productFlags[p] * (dataset.products.find((x) => x.id === p)?.revenue ?? 0), 0);
  } else if (l.include && l.customerId) flowing = model.byId.get(l.customerId)?.revenueExposed ?? 0;

  const party = (eid: string | null) =>
    eid && model.byId.has(eid) ? (
      <button className="text-left underline decoration-rule underline-offset-2 hover:decoration-ink" onClick={() => open({ kind: "node", id: eid })}>
        {entityName(eid)}
      </button>
    ) : (
      <span>{entityName(eid)}</span>
    );

  return (
    <div className="space-y-4 text-[13px]">
      <header className="space-y-1">
        <p className="label">
          {l.id} · {l.type}
        </p>
        <h2 className="text-xl leading-tight">{l.input}</h2>
        <p>
          {party(l.supplierId)} <span className="text-muted">→</span> {party(l.customerId)}
        </p>
        <p className={l.status === "Rejected" ? "font-medium text-critical" : "text-muted"}>
          {l.status}
          {l.grade ? ` · evidence grade ${l.grade}` : ""} · {l.sourceFamilyCount} independent source famil{l.sourceFamilyCount === 1 ? "y" : "ies"}
        </p>
      </header>

      <Section title="Link facts">
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-[12.5px]">
          <dt className="text-muted">Products</dt>
          <dd>{l.products || "—"}</dd>
          <dt className="text-muted">Allocation</dt>
          <dd className="num">{l.allocation !== null ? `${fmtNum(l.allocation * 100, 0)}% (planning share)` : "not disclosed"}</dd>
          <dt className="text-muted">Supplier site</dt>
          <dd>
            {l.siteId ?? "—"} · zone {l.zone ?? "—"}
          </dd>
          <dt className="text-muted">In exposure maths</dt>
          <dd>{l.include ? "Yes" : "No (context, hypothesis or rejected)"}</dd>
          <dt className="text-muted">Revenue flowing</dt>
          <dd className="num">{flowing > 0 ? `USD ${fmtNum(flowing, 0)}m / yr` : "—"}</dd>
        </dl>
        {l.notes && <p className="mt-2 border-l-2 border-accent pl-2">{l.notes}</p>}
      </Section>

      <Section title={`Evidence (${l.evidence.length})`}>
        <ul className="space-y-2">
          {l.evidence.map((e) => (
            <EvidenceRecordView key={e.id} id={e.id} corroborating={e.corroborating} />
          ))}
        </ul>
      </Section>
    </div>
  );
}


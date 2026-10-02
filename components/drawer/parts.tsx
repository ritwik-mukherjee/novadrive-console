"use client";

import { useState } from "react";
import { TONE_COLOR, evidenceById, isShipment, verdictTone } from "@/lib/evidence";
import { fmtDate, fmtNum } from "@/lib/format";
import type { Link } from "@/lib/types";

export function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="border-t hairline pt-3">
      <h3 className="label mb-2">{title}</h3>
      {children}
    </section>
  );
}

export interface WaterfallItem {
  label: string;
  value: number;
  note?: string;
}

/** Horizontal waterfall on a 0-100 scale: each contribution starts where the previous ended. */
export function Waterfall({ items, total, totalLabel, cap }: { items: WaterfallItem[]; total: number; totalLabel: string; cap?: string }) {
  const starts = items.map((_, i) => items.slice(0, i).reduce((s, x) => s + x.value, 0));
  return (
    <div className="space-y-1 text-[12.5px]">
      {items.map((it, i) => {
        const start = starts[i];
        return (
          <div key={it.label} className="grid grid-cols-[132px_1fr_42px] items-center gap-2" title={it.note}>
            <span className="truncate text-muted">{it.label}</span>
            <span className="relative h-3 bg-paper-2">
              <span
                className="absolute top-0 h-3 bg-ink/70"
                style={{ left: `${Math.min(100, start)}%`, width: `${Math.max(0, Math.min(100 - start, it.value))}%` }}
              />
            </span>
            <span className="num text-right">{it.value === 0 ? "0" : `+${fmtNum(it.value)}`}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[132px_1fr_42px] items-center gap-2 border-t hairline pt-1">
        <span className="font-medium">{totalLabel}</span>
        <span className="relative h-3 bg-paper-2">
          <span className="absolute left-0 top-0 h-3 bg-accent" style={{ width: `${Math.min(100, total)}%` }} />
        </span>
        <span className="num text-right font-medium">{fmtNum(total)}</span>
      </div>
      {cap && <p className="text-xs text-muted">{cap}</p>}
    </div>
  );
}

export function EvidenceRecordView({ id, corroborating }: { id: string; corroborating?: boolean }) {
  const [open, setOpen] = useState(false);
  const e = evidenceById.get(id);
  if (!e) return <li className="text-xs text-muted">{id}: not in the evidence ledger</li>;
  const tone = verdictTone(e.verdict);
  return (
    <li className="border-l-2 pl-2" style={{ borderColor: TONE_COLOR[tone] }}>
      <button className="w-full text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="num font-medium">{e.id}</span>
        <span className="ml-2" style={{ color: TONE_COLOR[tone] }}>
          {e.verdict}
        </span>
        <span className="ml-2 text-xs text-muted">
          {fmtDate(e.date)} · {e.sourceFamily}
        </span>
        <span className="block text-xs text-muted">{e.title}</span>
        {(isShipment(e) || corroborating) && (
          <span className="block text-xs text-high">Shipment record: corroborates the relationship; it is not a purchase share.</span>
        )}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 text-xs">
          <p>
            <span className="label">Our reasoning </span>
            {e.reasoning}
          </p>
          {e.detail && (
            <blockquote className="border-l hairline pl-2 text-muted">
              <span className="label">Source text </span>
              {e.detail}
            </blockquote>
          )}
          <p className="text-muted">
            {e.type} · record status: {e.recordStatus} · used for: {e.usedFor}
            {e.locator ? ` · ${e.locator}` : ""}
          </p>
        </div>
      )}
    </li>
  );
}

export function LinkEvidence({ link, defaultOpen = false }: { link: Link; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="py-1.5">
      <button className="flex w-full items-baseline justify-between gap-2 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span className="num font-medium">{link.id}</span> <span>{link.supplierName.replace(/ Ltd\.$/, "")}</span>
          <span className="text-muted"> → {link.customerName?.replace(/ Ltd\.$/, "") ?? "—"}</span>
          <span className="block text-xs text-muted">
            {link.input} · {link.siteId ?? "—"} · {link.zone ?? "—"}
          </span>
        </span>
        <span className="shrink-0 text-xs">
          {link.status}
          {link.grade ? ` · ${link.grade}` : ""}
          <span className="ml-1 text-muted">{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-2">
          {link.evidence.map((ev) => (
            <EvidenceRecordView key={ev.id} id={ev.id} corroborating={ev.corroborating} />
          ))}
          {link.notes && <li className="text-xs text-muted">Note: {link.notes}</li>}
        </ul>
      )}
    </div>
  );
}

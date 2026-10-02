"use client";

import { useMemo, useState } from "react";
import { EvidenceRecordView } from "@/components/drawer/parts";
import { dataset } from "@/lib/data";
import { useDrawer } from "@/lib/drawer";
import { TONE_COLOR, verdictTone, type VerdictTone } from "@/lib/evidence";
import { fmtDate } from "@/lib/format";
import { TRAPS } from "@/lib/traps";
import type { EvidenceRecord } from "@/lib/types";

type Group = "none" | "family" | "link";
const TONES: { id: VerdictTone; label: string }[] = [
  { id: "accept", label: "Accepted" },
  { id: "corroborate", label: "Corroborating" },
  { id: "partial", label: "Partial / hypothesis" },
  { id: "reject", label: "Rejected" },
];

/** Entities a record concerns: via the links that cite it. */
function entitiesFor(e: EvidenceRecord): string[] {
  const ids = new Set<string>();
  for (const l of dataset.links) {
    if (!l.evidence.some((x) => x.id === e.id)) continue;
    ids.add(l.supplierName.replace(/ Ltd\.$/, ""));
    if (l.customerName && l.customerId !== "NOVADRIVE") ids.add(l.customerName.replace(/ Ltd\.$/, ""));
  }
  return [...ids];
}

export function EvidenceView() {
  const open = useDrawer((s) => s.open);
  const [q, setQ] = useState("");
  const [tone, setTone] = useState<VerdictTone | "all">("all");
  const [type, setType] = useState("all");
  const [entity, setEntity] = useState("all");
  const [group, setGroup] = useState<Group>("none");

  const rows = useMemo(
    () =>
      dataset.evidence.map((e) => ({
        e,
        tone: verdictTone(e.verdict),
        entities: entitiesFor(e),
        links: dataset.links.filter((l) => l.evidence.some((x) => x.id === e.id)).map((l) => l.id),
      })),
    [],
  );
  const types = [...new Set(dataset.evidence.map((e) => e.type))].sort();
  const entities = [...new Set(rows.flatMap((r) => r.entities))].sort();
  const filtered = rows.filter((r) => {
    if (tone !== "all" && r.tone !== tone) return false;
    if (type !== "all" && r.e.type !== type) return false;
    if (entity !== "all" && !r.entities.includes(entity)) return false;
    if (q) {
      const hay = `${r.e.id} ${r.e.title} ${r.e.reasoning} ${r.e.detail ?? ""} ${r.e.sourceFamily}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });
  const families = new Set(dataset.evidence.map((e) => e.sourceFamily)).size;

  const groups: [string, typeof filtered][] =
    group === "none"
      ? [["", filtered]]
      : group === "family"
        ? [...groupBy(filtered, (r) => [r.e.sourceFamily.replace(/-\d+$/, "").replace(/^FAM-DOC$/, "Single-record families")])]
        : [...groupBy(filtered, (r) => (r.links.length ? r.links : ["Not tied to a link"]))];

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section>
        <p className="mb-3 text-[13px] text-muted">
          {dataset.evidence.length} records, {families} distinct source families. Each source family is counted once; shipments corroborate a relationship
          but never set a share.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-4 text-xs">
          <label className="flex flex-col gap-0.5">
            <span className="label">Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, name, text…" className="border-b hairline bg-transparent py-1" />
          </label>
          <Sel label="Verdict" value={tone} onChange={(v) => setTone(v as VerdictTone | "all")} options={[["all", "All"], ...TONES.map((t) => [t.id, t.label] as [string, string])]} />
          <Sel label="Type" value={type} onChange={setType} options={[["all", "All types"], ...types.map((t) => [t, t] as [string, string])]} />
          <Sel label="Entity" value={entity} onChange={setEntity} options={[["all", "All entities"], ...entities.map((t) => [t, t] as [string, string])]} />
          <Sel
            label="Group by"
            value={group}
            onChange={(v) => setGroup(v as Group)}
            options={[
              ["none", "No grouping"],
              ["family", "Source family (independence)"],
              ["link", "Network link"],
            ]}
          />
          <span className="text-muted">{filtered.length} shown</span>
        </div>

        {groups.map(([g, list]) => (
          <div key={g || "all"} className="mb-4">
            {g && (
              <h3 className="label mb-1 border-b hairline pb-1">
                {group === "link" && g.startsWith("L") ? (
                  <button className="underline" onClick={() => open({ kind: "link", id: g })}>
                    {g}
                  </button>
                ) : (
                  g
                )}{" "}
                <span className="text-muted">({list.length})</span>
              </h3>
            )}
            <table className="w-full border-collapse text-[12.5px]">
              <tbody>
                {list.map((r) => (
                  <Row key={`${g}-${r.e.id}`} r={r} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <aside className="space-y-3">
        <h2 className="serif text-lg">Traps we caught</h2>
        {TRAPS.map((t) => (
          <div key={t.title} className="border-l-2 border-critical pl-2 text-[12.5px]">
            <p className="font-medium">{t.title}</p>
            <p className="text-muted">{t.finding}</p>
            <p className="mt-0.5 flex flex-wrap gap-2 text-xs">
              {t.evidence.map((id) => (
                <a key={id} href={`#ev-${id}`} className="underline">
                  {id}
                </a>
              ))}
              {t.events.map((id) => (
                <button key={id} className="underline" onClick={() => open({ kind: "event", id })}>
                  {id}
                </button>
              ))}
            </p>
          </div>
        ))}
      </aside>
    </div>
  );
}

function Row({ r }: { r: { e: EvidenceRecord; tone: VerdictTone; entities: string[]; links: string[] } }) {
  const [openRow, setOpen] = useState(false);
  return (
    <>
      <tr id={`ev-${r.e.id}`} className="cursor-pointer border-b hairline align-top hover:bg-paper-2" onClick={() => setOpen((o) => !o)}>
        <td className="num w-24 py-1.5 pr-2 font-medium">{r.e.id}</td>
        <td className="w-24 py-1.5 pr-2 text-muted">{fmtDate(r.e.date)}</td>
        <td className="py-1.5 pr-2">
          {r.e.title}
          <span className="block text-xs text-muted">
            {r.e.type} · {r.e.sourceFamily}
            {r.links.length ? ` · ${r.links.join(", ")}` : ""}
          </span>
        </td>
        <td className="w-48 py-1.5" style={{ color: TONE_COLOR[r.tone] }}>
          {r.e.verdict}
        </td>
      </tr>
      {openRow && (
        <tr className="border-b hairline bg-paper-2">
          <td colSpan={4} className="px-2 py-2">
            <ul>
              <EvidenceRecordView id={r.e.id} />
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

function groupBy<T>(list: T[], keys: (x: T) => string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) for (const k of keys(x)) m.set(k, [...(m.get(k) ?? []), x]);
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="max-w-48 border-b hairline bg-transparent py-1">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

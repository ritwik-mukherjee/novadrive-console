"use client";

import { usePathname } from "next/navigation";
import { QUESTIONS, screenFor } from "@/lib/nav";
import { useFilters, type TierFilter } from "@/lib/store";
import type { ProductId } from "@/lib/types";

interface Props {
  products: { id: ProductId; name: string }[];
  zones: string[];
}

export function Header({ products, zones }: Props) {
  const screen = screenFor(usePathname());
  const { product, zone, tier, setProduct, setZone, setTier } = useFilters();

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b hairline px-8 pb-3 pt-5">
      <div>
        <h1 className="text-2xl">{screen.label}</h1>
        <ol className="mt-1.5 flex items-center gap-4" aria-label="CRO questions this screen answers">
          {QUESTIONS.map((q) => {
            const on = screen.questions.includes(q.id);
            return (
              <li key={q.id} className="flex items-center gap-1.5" title={q.long}>
                <span
                  aria-hidden
                  className={`inline-block h-2 w-2 border ${on ? "border-accent bg-accent" : "border-muted"}`}
                  style={{ borderRadius: "50%" }}
                />
                <span className={`text-xs ${on ? "text-ink" : "text-muted"}`}>
                  {q.short}
                  <span className="sr-only">{on ? " (answered here)" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-end gap-4 text-xs">
        <Filter label="Product">
          <select
            value={product}
            onChange={(e) => setProduct(e.target.value as ProductId | "all")}
            className="border-b hairline bg-transparent py-1 pr-1"
          >
            <option value="all">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} {p.name.split(" ")[0]}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Zone">
          <select value={zone} onChange={(e) => setZone(e.target.value)} className="border-b hairline bg-transparent py-1 pr-1">
            <option value="all">All zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </Filter>
        <Filter label="Tier">
          <select
            value={String(tier)}
            onChange={(e) => setTier((e.target.value === "all" ? "all" : Number(e.target.value)) as TierFilter)}
            className="border-b hairline bg-transparent py-1 pr-1"
          >
            <option value="all">All tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
          </select>
        </Filter>
      </div>
    </header>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

import { dataset } from "./data";
import type { EvidenceRecord, Link } from "./types";

export const evidenceById = new Map(dataset.evidence.map((e) => [e.id, e]));
export const linkById = new Map(dataset.links.map((l) => [l.id, l]));

export type VerdictTone = "accept" | "partial" | "corroborate" | "reject";

export function verdictTone(verdict: string): VerdictTone {
  const v = verdict.toLowerCase();
  if (v.startsWith("reject")) return "reject";
  if (v.startsWith("corroborating")) return "corroborate";
  if (v.startsWith("partial") || v.startsWith("hypothesis")) return "partial";
  return "accept";
}

export const TONE_COLOR: Record<VerdictTone, string> = {
  accept: "var(--color-accent)",
  partial: "var(--color-high)",
  corroborate: "var(--color-muted)",
  reject: "var(--color-critical)",
};

export const isShipment = (e: EvidenceRecord) => e.type.toLowerCase().startsWith("shipment");

/** Links touching an entity, as supplier or customer. */
export function linksTouching(entityId: string): Link[] {
  return dataset.links.filter((l) => l.supplierId === entityId || l.customerId === entityId);
}

export function entityName(id: string | null): string {
  if (!id) return "—";
  if (id === "NOVADRIVE") return "NovaDrive Technologies";
  return (
    dataset.entities.find((e) => e.id === id)?.legalName ??
    dataset.links.find((l) => l.supplierId === id)?.supplierName ??
    dataset.products.find((p) => p.id === id)?.name ??
    id
  );
}

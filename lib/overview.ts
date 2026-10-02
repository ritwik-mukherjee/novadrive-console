/** Computed headline facts for the Overview cockpit (nothing hard-coded). */
import type { FeedItem } from "./alertFeed";
import type { Model } from "./engine";
import { resolver } from "./matcher";
import { PRODUCT_IDS, type Dataset } from "./types";

export function placeName(zone: string): string | null {
  return resolver.places.find((p) => p.zone === zone)?.name ?? null;
}

export function headline(model: Model, feed: FeedItem[], data: Dataset) {
  const total = data.assumptions.totalRevenue;
  const zoneAlerts = (z: string) =>
    feed.filter((f) => f.match.zone === z && f.match.kind === "zone" && (f.alert.level === "HIGH" || f.alert.level === "MEDIUM"));
  const ranked = [...model.zones].sort(
    (a, b) => b.confirmedRevenue - a.confirmedRevenue || zoneAlerts(b.zone).length - zoneAlerts(a.zone).length || (b.hazard ?? 0) - (a.hazard ?? 0),
  );
  const top = ranked[0];
  const alert = zoneAlerts(top.zone)[0] ?? null;
  const fullZones = model.zones.filter((z) => z.confirmedRevenue >= total - 1e-6).map((z) => z.zone);
  return {
    zone: top.zone,
    place: placeName(top.zone),
    share: top.confirmedRevenue / total,
    weekly: top.confirmedRevenue / 52,
    alert,
    otherFullZones: fullZones.filter((z) => z !== top.zone),
  };
}

export function kpis(model: Model, feed: FeedItem[], data: Dataset) {
  const crit = model.scored.filter((n) => n.band === "Critical");
  let critRevenue = 0;
  for (const p of PRODUCT_IDS) {
    const maxE = Math.max(0, ...crit.map((n) => n.exposure[p]));
    critRevenue += maxE * (data.products.find((x) => x.id === p)?.revenue ?? 0);
  }
  const conf = (l: string) => model.scored.filter((n) => n.confidence.label === l).length;
  const power = model.components.filter((c) => c.component.startsWith("M"));
  const m10 = power[0];
  return {
    criticalRevenue: critRevenue,
    criticalShare: critRevenue / data.assumptions.totalRevenue,
    criticalCount: crit.length,
    highAlerts: feed.filter((f) => f.alert.level === "HIGH").length,
    confidence: { High: conf("High"), Medium: conf("Medium"), Low: conf("Low") },
    power: { component: m10.component, apparent: m10.nEffTier1, real: m10.binding },
  };
}

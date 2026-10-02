/**
 * "Traps we caught": the planted name collisions and stale records.
 * The descriptions are team findings; every one cites the records that prove it,
 * and the shipment trap is computed from dates.
 */
import { dataset } from "./data";

export interface Trap {
  title: string;
  finding: string;
  evidence: string[];
  events: string[];
}

const qualDate = dataset.evidence.find((e) => e.id === "DOC-002")?.date ?? "2025-06-12";
const earlyShipments = dataset.evidence.filter((e) => e.type.startsWith("Shipment") && e.verdict.startsWith("Corroborating – shipment") && e.date < qualDate);

export const TRAPS: Trap[] = [
  {
    title: "Ion Peak Trading ≠ IonPeak Semiconductor",
    finding: "A broker with registry REG-NO-4128 in Harbor District, unrelated to our sole die supplier. A keyword match would raise a false insolvency alert on the most critical Tier-2.",
    evidence: ["DOC-077"],
    events: ["EV-004"],
  },
  {
    title: "Delta Consumer Plastics ≠ Delta Capacitor Works",
    finding: "A 2024 packaging trial that never became a supply award; its shipments go to an unrelated customer.",
    evidence: ["DOC-084", "SHP-00438"],
    events: ["EV-009"],
  },
  {
    title: "Jade HQ (SITE-901) is not the plant",
    finding: "Jade's headquarters in Z07 does not manufacture; substrates come from SITE-081 in East Delta (Z01).",
    evidence: ["DOC-076"],
    events: ["EV-007"],
  },
  {
    title: "IonPeak SITE-900 is not a backup",
    finding: "The Western Ridge pilot line uses a different process and is not qualified for NovaDrive dies, so it does not reduce the East Delta concentration.",
    evidence: ["DOC-077"],
    events: [],
  },
  {
    title: "Expired 2022 Delta housing award",
    finding: "Delta's housing pilot ended on 31 Dec 2023. It is not a current H10 link; the current Delta award is C20 only.",
    evidence: ["DOC-080"],
    events: [],
  },
  {
    title: "EV-002 is a duplicate of EV-001",
    finding: "Same source family (WX-0923): a trade wire republishing the authority bulletin. Counting it twice would double the signal.",
    evidence: [],
    events: ["EV-001", "EV-002"],
  },
  {
    title: "Shipments pre-date serial approval",
    finding: `${earlyShipments.length} Tier-1 manifests are dated before serial approval on ${qualDate} (DOC-002): likely pre-series lots. They prove a relationship exists, never a share.`,
    evidence: earlyShipments.map((e) => e.id),
    events: [],
  },
];

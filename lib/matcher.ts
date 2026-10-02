/**
 * Deterministic, explainable event-to-network matcher (PRD section 7).
 * Free text in -> mentions -> resolved entities/sites/zones -> S, C, M, primary node.
 * No fuzzy auto-accept: ambiguous mentions return candidates for the user to pick.
 */
import resolverJson from "@/data/resolver.json";
import type { Model, ScoredNode } from "./engine";
import { PRODUCT_IDS, type Dataset, type Site } from "./types";

interface Resolver {
  aliases: Record<string, string[]>;
  registry: { number: string; entityId: string; evidence: string }[];
  places: { name: string; zone: string | null }[];
  negativeRules: { mention: string; notEntity: string; evidence: string; text: string }[];
  siteNotes: Record<string, { evidence: string; text: string }>;
  facilityRoleWords: { hq: string[]; pilot: string[] };
}
export const resolver = resolverJson as unknown as Resolver;

// ---------------------------------------------------------------------------
// Tokenising and dictionary
// ---------------------------------------------------------------------------

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9&-]+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);

type EntryKind = "registry" | "site" | "legal" | "facility" | "place" | "alias" | "zone";
const KIND_RANK: Record<EntryKind, number> = { registry: 7, site: 6, legal: 5, facility: 4, place: 3, alias: 2, zone: 1 };

interface Entry {
  phrase: string;
  tokens: string[];
  kind: EntryKind;
  entityIds: string[];
  siteIds: string[];
  zone: string | null;
}

export interface Mention {
  text: string;
  kind: EntryKind;
  entityIds: string[];
  siteIds: string[];
  zone: string | null;
  negated: boolean;
  start: number;
}

function buildDictionary(data: Dataset): Entry[] {
  const map = new Map<string, Entry>();
  const add = (phrase: string, kind: EntryKind, e: Partial<Entry>) => {
    const tokens = tokenize(phrase);
    if (tokens.length === 0) return;
    const key = `${kind}|${tokens.join(" ")}`;
    const cur = map.get(key) ?? { phrase, tokens, kind, entityIds: [], siteIds: [], zone: e.zone ?? null };
    for (const id of e.entityIds ?? []) if (!cur.entityIds.includes(id)) cur.entityIds.push(id);
    for (const id of e.siteIds ?? []) if (!cur.siteIds.includes(id)) cur.siteIds.push(id);
    map.set(key, cur);
  };
  for (const r of resolver.registry) add(r.number, "registry", { entityIds: [r.entityId] });
  for (const s of data.sites) {
    if (s.id.startsWith("SITE-")) add(s.id, "site", { entityIds: [s.entityId], siteIds: [s.id], zone: s.zone });
    add(s.name, "facility", { entityIds: [s.entityId], siteIds: [s.id], zone: s.zone });
  }
  for (const e of data.entities) {
    add(e.legalName, "legal", { entityIds: [e.id] });
    add(e.legalName.replace(/ Ltd\.?$/, ""), "legal", { entityIds: [e.id] });
  }
  for (const [id, names] of Object.entries(resolver.aliases)) for (const n of names) add(n, "alias", { entityIds: [id] });
  for (const p of resolver.places) add(p.name, "place", { zone: p.zone });
  for (const z of new Set(data.entities.map((e) => e.facilityZone))) add(z, "zone", { zone: z });
  return [...map.values()];
}

const NEGATORS = new Set(["not", "no", "never", "without", "unrelated", "≠"]);

/** Greedy longest-match scan. Higher-precision kinds win ties of equal length. */
export function findMentions(text: string, data: Dataset): Mention[] {
  const dict = buildDictionary(data);
  const tokens = tokenize(text);
  const out: Mention[] = [];
  let i = 0;
  while (i < tokens.length) {
    let best: Entry | null = null;
    for (const e of dict) {
      if (e.tokens.length > tokens.length - i) continue;
      if (!e.tokens.every((t, k) => tokens[i + k] === t)) continue;
      if (!best || e.tokens.length > best.tokens.length || (e.tokens.length === best.tokens.length && KIND_RANK[e.kind] > KIND_RANK[best.kind])) best = e;
    }
    if (!best) {
      i++;
      continue;
    }
    // merge same-span entries of other kinds is unnecessary: legal/alias spans differ in practice
    const window = tokens.slice(Math.max(0, i - 3), i);
    out.push({
      text: best.phrase,
      kind: best.kind,
      entityIds: [...best.entityIds],
      siteIds: [...best.siteIds],
      zone: best.zone,
      negated: window.some((t) => NEGATORS.has(t)),
      start: i,
    });
    i += best.tokens.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Severity and credibility (rule-based, from the case scales)
// ---------------------------------------------------------------------------

const SEVERITY_RULES: { s: number; label: string; words: string[] }[] = [
  {
    s: 1.0,
    label: "confirmed disruption",
    words: ["fire", "explosion", "shutdown", "shut down", "halted", "halts", "outage", "damaged", "damage", "destroyed", "strike", "stoppage", "flooded", "flooding", "collapse", "closed", "closure", "power failure", "recall"],
  },
  {
    s: 0.7,
    label: "credible precursor",
    words: ["watch", "warning", "typhoon", "cyclone", "storm", "flood", "covenant", "financing", "financial pressure", "delayed payments", "downgrade", "layoffs", "layoff", "insolvency", "restructuring", "bankruptcy", "allegation", "investigation", "sanction", "protest"],
  },
  { s: 0.4, label: "logistics delay", words: ["congestion", "delay", "delays", "backlog", "port", "terminal", "shipping", "customs"] },
  { s: 0.1, label: "administrative", words: ["relocation", "relocates", "moves", "head office", "headquarters", "address", "rename", "rebrand", "appoints"] },
];

function sentenceHits(text: string, word: string): boolean {
  // a hit counts only if the sentence does not negate it before the word
  const sentences = text.toLowerCase().split(/(?<=[.!?;])\s+/);
  const w = word.toLowerCase();
  return sentences.some((s) => {
    const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`);
    const m = re.exec(s);
    if (!m) return false;
    const before = s.slice(0, m.index).split(/\s+/);
    return !before.some((t) => NEGATORS.has(t.replace(/[^a-z≠]/g, "")));
  });
}

export function classifySeverity(text: string): { s: number; label: string; words: string[] } {
  for (const rule of SEVERITY_RULES) {
    const words = rule.words.filter((w) => sentenceHits(text, w));
    if (words.length) return { s: rule.s, label: rule.label, words };
  }
  return { s: 0.7, label: "unclassified – treated as a credible precursor until verified", words: [] };
}

export function classifyCredibility(text: string, sourceType: string | null): { c: number; label: string } {
  const st = (sourceType ?? "").toLowerCase();
  if (/authority|official|regulator|government/.test(st)) return { c: 1.0, label: "issuing authority" };
  if (/\b(authority|regulator|ministry|agency|meteorological)\b/i.test(text) && /\bissues?\b/i.test(text))
    return { c: 1.0, label: "issuing authority" };
  return { c: 0.8, label: "single independent report" };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export interface MatchOption {
  key: string; // entity id or site id
  label: string;
  match: MatchCore;
}

export interface MatchCore {
  kind: "entity" | "zone" | "own-plant" | "wrong-entity" | "unresolved" | "non-production-zone";
  M: number;
  primaryNode: string | null;
  matchedNodes: string[];
  exposureOverride: number | null;
  zone: string | null;
  siteId: string | null;
  resolution: string; // one-sentence explanation (step 3)
  networkMatch: string; // one-sentence explanation (step 4)
  evidence: string[];
}

export interface MatchResult extends MatchCore {
  S: number;
  severityLabel: string;
  severityWords: string[];
  C: number;
  credibilityLabel: string;
  mentions: Mention[];
  ambiguous: { mention: string; options: MatchOption[] } | null;
  chosen: string | null;
}

export interface MatchInput {
  title: string;
  text: string;
  sourceType: string | null;
  severityOverride?: number | null;
  choice?: string | null;
}

const familyOf = (id: string, data: Dataset): string => {
  const own = data.links.find((l) => l.type === "Ownership" && l.customerId === id);
  return own ? own.supplierId : id;
};

/** Primary node among matches: largest revenue share, then confidence, then priority. */
export function pickPrimary(ids: string[], model: Model): ScoredNode | null {
  const ns = ids.map((id) => model.byId.get(id)).filter((n): n is ScoredNode => Boolean(n));
  ns.sort((a, b) => b.share - a.share || b.confidence.points - a.confidence.points || b.priority - a.priority);
  return ns[0] ?? null;
}

export function ownPlantShare(site: Site, data: Dataset): number {
  let rev = 0;
  for (const p of data.products) {
    for (const part of p.footprint.split(";")) {
      const m = part.trim().match(/^(.*?)\s*\((\d+)%\)$/);
      if (m && m[1].trim() === site.name) rev += (p.revenue * Number(m[2])) / 100;
    }
  }
  return rev / data.assumptions.totalRevenue;
}

function roleFromText(text: string): "hq" | "pilot" | null {
  for (const role of ["pilot", "hq"] as const) if (resolver.facilityRoleWords[role].some((w) => sentenceHits(text, w))) return role;
  return null;
}

const shortName = (n: string) => n.replace(/ Ltd\.?$/, "");

/** Resolve one entity (optionally a specific site) to a network match. */
function resolveEntity(entityId: string, siteId: string | null, text: string, data: Dataset, model: Model): MatchCore {
  const entity = data.entities.find((e) => e.id === entityId);
  const name = entity ? shortName(entity.legalName) : entityId;
  const neg = resolver.negativeRules.filter((r) => text.toLowerCase().includes(r.mention.toLowerCase()) && r.notEntity !== entityId);
  const negText = neg.map((r) => ` ${r.text} (${r.evidence})`).join("");

  // NovaDrive's own plant
  const site = siteId ? data.sites.find((s) => s.id === siteId) : undefined;
  if (site?.role === "own-plant") {
    const share = ownPlantShare(site, data);
    return {
      kind: "own-plant",
      M: 1.0,
      primaryNode: null,
      matchedNodes: [],
      exposureOverride: share,
      zone: null,
      siteId: site.id,
      resolution: `"${site.name}" is NovaDrive's own plant (Business Context footprint); its zone is not disclosed.`,
      networkMatch: `Own production, not a supplier: ${Math.round(share * 100)}% of revenue is built there. Route to operations.`,
      evidence: [],
    };
  }

  const scored = model.byId.get(entityId);
  if (!scored) {
    // Context entity (owner / logistics) that touches a scored node?
    const ctx = data.links.find((l) => l.supplierId === entityId && (l.type === "Ownership" || l.type === "Logistics") && l.customerId && model.byId.has(l.customerId));
    if (ctx) {
      const cust = model.byId.get(ctx.customerId!)!;
      const note = site ? resolver.siteNotes[site.id] : undefined;
      return {
        kind: "entity",
        M: 0.2,
        primaryNode: cust.id,
        matchedNodes: [cust.id],
        exposureOverride: null,
        zone: site?.zone ?? entity?.facilityZone ?? null,
        siteId: site?.id ?? entity?.primaryFacilityId ?? null,
        resolution: `Right network, non-production facility: ${name} is a ${ctx.type.toLowerCase()} context node (${ctx.id}: ${ctx.input}).${note ? ` ${note.text}` : ""}`,
        networkMatch: `Touches ${shortName(cust.name)} through ${ctx.id}; no production site is named.`,
        evidence: [...ctx.evidence.map((e) => e.id), ...(note ? [note.evidence] : [])],
      };
    }
    const rule = resolver.negativeRules.find((r) => r.mention.toLowerCase() === (entity?.legalName ?? "").toLowerCase().replace(/ ltd\.?$/, ""));
    const rejected = data.links.find((l) => l.supplierId === entityId && l.status === "Rejected");
    return {
      kind: "wrong-entity",
      M: 0,
      primaryNode: null,
      matchedNodes: [],
      exposureOverride: 0,
      zone: entity?.facilityZone ?? null,
      siteId: site?.id ?? null,
      resolution: `Resolved to ${name} (${entityId}), which is not a NovaDrive supplier.${rule ? ` ${rule.text} (${rule.evidence})` : negText}`,
      networkMatch: rejected ? `No mapped link: ${rejected.id} was rejected (${rejected.notes})` : "No relationship evidence links it to any NovaDrive node.",
      evidence: [...(rule ? [rule.evidence] : neg.map((r) => r.evidence)), ...(rejected ? rejected.evidence.map((e) => e.id) : [])],
    };
  }

  // Scored supplier: which facility?
  let target = site;
  let how = site ? `facility ${site.id} named` : "entity named, no facility";
  if (!target) {
    const role = roleFromText(text);
    if (role) {
      target = data.sites.find((s) => s.entityId === entityId && s.role === role);
      if (target) how = `"${role === "hq" ? "headquarters" : "pilot line"}" wording → ${target.id}`;
    }
  }
  if (!target) target = data.sites.find((s) => s.id === entity?.primaryFacilityId);
  const production = target?.role === "production";
  const note = target ? resolver.siteNotes[target.id] : undefined;
  return {
    kind: "entity",
    M: production ? 1.0 : 0.2,
    primaryNode: scored.id,
    matchedNodes: [scored.id],
    exposureOverride: null,
    zone: target?.zone ?? scored.input.zone,
    siteId: target?.id ?? null,
    resolution: production
      ? `Exact entity ${name} (${scored.id}); ${how}; ${target?.id} is its production site in ${target?.zone}.${negText}`
      : `Right entity ${name}, but ${target?.id} is a ${target?.role === "pilot" ? "research/pilot" : "headquarters"} site, not production (${how}).${note ? ` ${note.text} (${note.evidence})` : ""}`,
    networkMatch: `${shortName(scored.name)}: Tier-${scored.input.tier}, ${scored.band}, ${Math.round(scored.share * 100)}% of revenue depends on it.`,
    evidence: [...new Set([...neg.map((r) => r.evidence), ...(note ? [note.evidence] : [])])],
  };
}

function resolveZone(zone: string, via: string, data: Dataset, model: Model): MatchCore {
  const inZone = model.scored.filter((n) => n.input.zone === zone && n.kind !== "group");
  if (inZone.length === 0) {
    const sites = data.sites.filter((s) => s.zone === zone).map((s) => `${s.name} (${s.role})`);
    return {
      kind: "non-production-zone",
      M: 0.2,
      primaryNode: null,
      matchedNodes: [],
      exposureOverride: 0,
      zone,
      siteId: null,
      resolution: `${via} maps to ${zone}.`,
      networkMatch: `${zone} holds no mapped production node, only ${sites.join(", ") || "no sites"}.`,
      evidence: [],
    };
  }
  const primary = pickPrimary(inZone.map((n) => n.id), model)!;
  return {
    kind: "zone",
    M: 0.8,
    primaryNode: primary.id,
    matchedNodes: inZone.map((n) => n.id),
    exposureOverride: null,
    zone,
    siteId: null,
    resolution: `${via} maps to ${zone}. Production sites there: ${inZone.map((n) => `${n.input.facility} ${shortName(n.name)}`).join(", ")}.`,
    networkMatch: `Zone-level match to ${inZone.length} mapped nodes; primary ${shortName(primary.name)} (${Math.round(primary.share * 100)}% of revenue, ${primary.confidence.label} confidence).`,
    evidence: [],
  };
}

function unresolved(place: string | null): MatchCore {
  return {
    kind: "unresolved",
    M: 0.3,
    primaryNode: null,
    matchedNodes: [],
    exposureOverride: 1.0,
    zone: null,
    siteId: null,
    resolution: place
      ? `"${place}" is not mapped to any zone or site in the case data.`
      : "No supplier, facility or mapped place was recognised in the text.",
    networkMatch: "Location not mapped — unknown is not irrelevant. Exposure taken at its upper bound (100%) until the lanes are known.",
    evidence: [],
  };
}

export function matchEvent(input: MatchInput, data: Dataset, model: Model): MatchResult {
  const text = `${input.title}. ${input.text}`;
  const mentions = findMentions(text, data);
  const sev = classifySeverity(text);
  const cred = classifyCredibility(text, input.sourceType);
  const S = input.severityOverride ?? sev.s;
  const base = {
    S,
    severityLabel: input.severityOverride ? "set by user" : sev.label,
    severityWords: input.severityOverride ? [] : sev.words,
    C: cred.c,
    credibilityLabel: cred.label,
    mentions,
    chosen: input.choice ?? null,
  };

  const live = mentions.filter((m) => !m.negated);
  const entityMentions = live.filter((m) => m.entityIds.length > 0);
  const exact = entityMentions.filter((m) => m.kind === "registry" || m.kind === "site" || m.kind === "legal" || (m.kind === "facility" && m.entityIds.length === 1));
  const exactEntities = new Set(exact.flatMap((m) => m.entityIds));

  // Registry number is decisive
  const reg = exact.find((m) => m.kind === "registry");
  if (reg) return { ...base, ...resolveEntity(reg.entityIds[0], null, text, data, model), ambiguous: null };

  // Candidate groups: each mention gives a candidate set; resolve or flag ambiguity
  type Cand = { entityId: string; siteId: string | null };
  const resolved: Cand[] = [];
  let ambiguity: { mention: string; cands: Cand[] } | null = null;
  for (const m of entityMentions) {
    let cands: Cand[] = m.siteIds.length
      ? m.siteIds.map((s, k) => ({ entityId: data.sites.find((x) => x.id === s)?.entityId ?? m.entityIds[k], siteId: s }))
      : m.entityIds.map((e) => ({ entityId: e, siteId: null }));
    // Subsumed by an exact mention elsewhere in the text
    const sub = cands.filter((c) => exactEntities.has(c.entityId));
    if (sub.length) cands = sub;
    // One ownership family (e.g. Jade Holdings + Jade Printed Circuits): keep the scored network member
    if (cands.length > 1 && new Set(cands.map((c) => familyOf(c.entityId, data))).size === 1) {
      const scored = cands.filter((c) => model.byId.has(c.entityId));
      if (scored.length) cands = scored.slice(0, 1);
    }
    const uniq = cands.filter((c, k) => cands.findIndex((x) => x.entityId === c.entityId && x.siteId === c.siteId) === k);
    if (uniq.length === 1) resolved.push(uniq[0]);
    else if (!ambiguity) ambiguity = { mention: m.text, cands: uniq };
  }

  if (ambiguity) {
    const options: MatchOption[] = ambiguity.cands.map((c) => {
      const key = c.siteId ?? c.entityId;
      const site = c.siteId ? data.sites.find((s) => s.id === c.siteId) : undefined;
      const entity = data.entities.find((e) => e.id === c.entityId);
      const label =
        site?.role === "own-plant"
          ? `NovaDrive's own ${site.name} plant`
          : `${entity ? shortName(entity.legalName) : c.entityId}${site ? ` – ${site.id} ${site.name}` : ""}`;
      return { key, label, match: resolveEntity(c.entityId, c.siteId, text, data, model) };
    });
    const picked = input.choice ? options.find((o) => o.key === input.choice) : undefined;
    if (picked) {
      return {
        ...base,
        ...picked.match,
        resolution: `"${ambiguity.mention}" was ambiguous; you chose ${picked.label}. ${picked.match.resolution}`,
        ambiguous: { mention: ambiguity.mention, options },
      };
    }
    // Default: flag all candidates, keep the most severe as the provisional match
    const worst = [...options].sort((a, b) => b.match.M * (b.match.exposureOverride ?? model.byId.get(b.match.primaryNode ?? "")?.share ?? 0) - a.match.M * (a.match.exposureOverride ?? model.byId.get(a.match.primaryNode ?? "")?.share ?? 0))[0];
    return {
      ...base,
      ...worst.match,
      resolution: `AMBIGUOUS: "${ambiguity.mention}" matches ${options.length} entities (${options.map((o) => o.label).join("; ")}). Not guessing — all are flagged until you choose.`,
      networkMatch: `Provisionally scored on the most exposed reading: ${worst.label}.`,
      ambiguous: { mention: ambiguity.mention, options },
    };
  }

  if (resolved.length > 0) {
    const cores = resolved.map((c) => resolveEntity(c.entityId, c.siteId, text, data, model));
    // Prefer matches that touch the network, then the strongest match
    cores.sort((a, b) => b.M - a.M || (model.byId.get(b.primaryNode ?? "")?.share ?? 0) - (model.byId.get(a.primaryNode ?? "")?.share ?? 0));
    const main = cores[0];
    const others = cores.slice(1).flatMap((c) => c.matchedNodes);
    return { ...base, ...main, matchedNodes: [...new Set([...main.matchedNodes, ...others])], ambiguous: null };
  }

  // Geography: zone code or mapped place
  const geo = live.filter((m) => m.kind === "place" || m.kind === "zone");
  const mapped = geo.find((m) => m.zone);
  if (mapped) return { ...base, ...resolveZone(mapped.zone!, mapped.kind === "zone" ? `Zone code ${mapped.zone}` : `"${mapped.text}"`, data, model), ambiguous: null };
  const unmapped = geo.find((m) => !m.zone);
  return { ...base, ...unresolved(unmapped?.text ?? null), ambiguous: null };
}

/** Revenue at stake for a match (USD m / yr): primary node exposure, or the override share. */
export function revenueAtStake(m: MatchCore, model: Model, data: Dataset): number {
  if (m.exposureOverride !== null) return m.exposureOverride * data.assumptions.totalRevenue;
  const n = model.byId.get(m.primaryNode ?? "");
  return n ? n.revenueExposed : 0;
}

export function productsHit(m: MatchCore, model: Model): string[] {
  const n = model.byId.get(m.primaryNode ?? "");
  return n ? PRODUCT_IDS.filter((p) => n.exposure[p] > 0) : [];
}

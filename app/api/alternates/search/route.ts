/**
 * Live alternate-supplier search (PRD 6.7 / step 8).
 * Server-only: ANTHROPIC_API_KEY never reaches the client. Without a key the
 * route answers 503 { configured: false } and the UI keeps the curated list.
 */
import Anthropic from "@anthropic-ai/sdk";
import { componentsForNode, isVerifiedSource, nodesForAlternate } from "@/lib/alternates";
import { dataset } from "@/lib/data";
import { buildModel } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 150;

const MODEL = "claude-opus-5-5";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

// Best-effort, per-instance cache and rate limit (serverless instances do not share memory).
const cache = new Map<string, { at: number; body: unknown }>();
const hits = new Map<string, number[]>();

const CRITERIA = ["technical", "application", "footprint", "scale", "presence", "qual_ease"] as const;
const score = { type: "integer", enum: [1, 2, 3, 4, 5] };

const submitTool = {
  name: "submit_candidates",
  description:
    "Submit the final list of alternate-supplier candidates found with web search. Call this exactly once, after searching, with 3 to 6 candidates (fewer only if no source page could be found), each backed by a page you read.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["legal_entity", "hq", "product_line", "footprint", "evidence_sentence", "url", "page_date", "scores", "reasons"],
          properties: {
            legal_entity: { type: "string", description: "Registered company name" },
            hq: { type: "string", description: "Headquarters city, country" },
            product_line: { type: "string", description: "The specific product line relevant to the component" },
            footprint: { type: "string", description: "Manufacturing countries/sites, or 'not stated'" },
            evidence_sentence: { type: "string", description: "One sentence from the source showing the capability" },
            url: { type: "string", description: "URL of the source page actually read" },
            page_date: { type: "string", description: "Publication date YYYY-MM-DD, or 'accessed YYYY-MM-DD' if undated" },
            scores: {
              type: "object",
              additionalProperties: false,
              required: [...CRITERIA],
              properties: Object.fromEntries(CRITERIA.map((c) => [c, score])),
            },
            reasons: {
              type: "object",
              additionalProperties: false,
              required: [...CRITERIA],
              properties: Object.fromEntries(CRITERIA.map((c) => [c, { type: "string" }])),
            },
          },
        },
      },
    },
  },
} as const;

interface RawCandidate {
  legal_entity: string;
  hq: string;
  product_line: string;
  footprint: string;
  evidence_sentence: string;
  url: string;
  page_date: string;
  scores: Record<(typeof CRITERIA)[number], number>;
  reasons: Record<(typeof CRITERIA)[number], string>;
}

function buildPrompt(nodeId: string) {
  const model = buildModel(dataset);
  const node = model.byId.get(nodeId)!;
  const comps = componentsForNode(nodeId, dataset);
  const curated = dataset.alternates.filter((a) => nodesForAlternate(a, dataset, model).includes(nodeId));
  const today = dataset.assumptions.dates.researchAsOf;
  const compText = comps
    .map(
      (c) =>
        `- ${c.id} ${c.name}: ${c.application}. Products: ${c.products.join(", ")}. Use case: ${c.useCase}. Screening criteria: ${c.screeningCriteria} Qualification lead time ~${c.leadTimeWeeks} weeks.`,
    )
    .join("\n");
  return `You are a sourcing analyst for an industrial power-electronics manufacturer. Today is ${today}.

A supplier in our network has been flagged: ${node.name} (Tier-${node.input.tier}, ${node.input.role}). We need real, currently operating companies that could replace it or second-source what it supplies.

What it supplies, and the screening criteria:
${compText}

Use web search to find 3 to 6 candidates. Rules:
- Search for each candidate's own product page or a dated press release, so that every candidate has a source you read. Major, well-known manufacturers are fine as long as you cite such a page for them.
- Use current public sources only: manufacturer product pages, dated press releases or filings. Record the exact URL you read and its date (or "accessed ${today}" if undated).
- Quote the evidence sentence from that page. Leave out a company only if you could not find any page for it; if fewer than 3 can be sourced, submit those.
- Exclude ${node.name} itself and any company whose product would depend on the same failed node (for example a module maker that buys the same dies or substrates). Our network names are fictional, so judge independence from public footprint and supply-chain information.
- Prefer candidates not already on our curated list: ${curated.map((a) => a.candidate.split(" – ")[0]).join("; ") || "none"}.
- Score each candidate 1-5 on: technical capability match, application relevance, footprint & independence from the failed node, scale/capacity, industry presence & quality systems, qualification ease (5 = easiest). Give a one-line reason per score.
- Do not screen financial or geopolitical risk; that is done separately.

When you have finished searching, call submit_candidates once with the results.`;
}

export async function POST(req: Request) {
  let nodeId: string;
  try {
    ({ nodeId } = (await req.json()) as { nodeId: string });
  } catch {
    return Response.json({ error: "Body must be JSON: { nodeId }" }, { status: 400 });
  }
  if (!dataset.nodes.some((n) => n.id === nodeId)) return Response.json({ error: `Unknown node ${nodeId}` }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        configured: false,
        message: "Live search is not configured on this deployment (ANTHROPIC_API_KEY is not set). Showing the curated shortlist.",
      },
      { status: 503 },
    );
  }

  const cached = cache.get(nodeId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return Response.json({ ...(cached.body as object), cached: true });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const recent = (hits.get(ip) ?? []).filter((t) => Date.now() - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    return Response.json({ error: "Rate limit: try again in a few minutes." }, { status: 429 });
  }
  hits.set(ip, [...recent, Date.now()]);

  // One deadline across all turns, kept inside maxDuration so the function returns a clean 504 instead of being killed.
  const deadline = Date.now() + 135_000;
  const client = new Anthropic({ maxRetries: 0 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: buildPrompt(nodeId) }];

  try {
    for (let turn = 0; turn < 4; turn++) {
      const remaining = deadline - Date.now();
      if (remaining < 10_000) break;
      const response = await client.beta.messages.create(
        {
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, submitTool],
        tool_choice: { type: "auto" },
        messages,
        },
        { timeout: remaining },
      );

      if (response.stop_reason === "refusal") {
        return Response.json({ error: "The model declined this search." }, { status: 502 });
      }
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const call = response.content.find(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_candidates",
      );
      if (!call) {
        if (turn < 3 && response.stop_reason === "end_turn") {
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: "Please call submit_candidates now with the candidates you found." });
          continue;
        }
        return Response.json({ error: "No structured result returned." }, { status: 502 });
      }
      const input = call.input as { candidates?: RawCandidate[] };
      const all = input.candidates ?? [];
      const candidates = all.filter((c) => isVerifiedSource(c.url, c.page_date));
      const body = {
        configured: true,
        nodeId,
        model: response.model,
        searchedAt: new Date().toISOString(),
        dropped: all.length - candidates.length,
        candidates: candidates.map((c, i) => ({
          id: `live-${nodeId}-${i + 1}`,
          nodeId,
          legalEntity: c.legal_entity,
          hq: c.hq,
          productLine: c.product_line,
          footprint: c.footprint,
          evidence: c.evidence_sentence,
          url: c.url,
          pageDate: c.page_date,
          scores: {
            technical: c.scores.technical,
            application: c.scores.application,
            footprint: c.scores.footprint,
            scale: c.scores.scale,
            presence: c.scores.presence,
            qualEase: c.scores.qual_ease,
          },
          reasons: {
            technical: c.reasons.technical,
            application: c.reasons.application,
            footprint: c.reasons.footprint,
            scale: c.reasons.scale,
            presence: c.reasons.presence,
            qualEase: c.reasons.qual_ease,
          },
        })),
      };
      if (candidates.length) cache.set(nodeId, { at: Date.now(), body });
      return Response.json({ ...body, cached: false });
    }
    return Response.json({ error: "Search did not finish in time." }, { status: 504 });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: "API key rejected." }, { status: 502 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "Upstream rate limit; try again shortly." }, { status: 429 });
    if (error instanceof Anthropic.APIConnectionTimeoutError) return Response.json({ error: "Search timed out." }, { status: 504 });
    if (error instanceof Anthropic.APIError) return Response.json({ error: `Upstream error ${error.status ?? ""}` }, { status: 502 });
    return Response.json({ error: "Unexpected error during search." }, { status: 500 });
  }
}

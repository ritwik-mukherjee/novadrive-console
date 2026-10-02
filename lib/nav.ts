// Screens and the CRO question(s) each one answers (header tracker).
export type Question = "where" | "sure" | "do";

export const QUESTIONS: { id: Question; short: string; long: string }[] = [
  { id: "where", short: "Where", long: "Where are our most material supplier-network vulnerabilities?" },
  { id: "sure", short: "How sure", long: "How confident are we in that assessment?" },
  { id: "do", short: "What to do", long: "What practical sourcing options do we have when a supplier becomes a concern?" },
];

export interface Screen {
  href: string;
  label: string;
  questions: Question[];
}

export const SCREENS: Screen[] = [
  { href: "/", label: "Overview", questions: ["where"] },
  { href: "/network", label: "Network", questions: ["where"] },
  { href: "/scorecard", label: "Scorecard", questions: ["where", "sure"] },
  { href: "/concentration", label: "Concentration", questions: ["where"] },
  { href: "/alerts", label: "Alerts", questions: ["where", "do"] },
  { href: "/alternates", label: "Alternates", questions: ["do"] },
  { href: "/evidence", label: "Evidence", questions: ["sure"] },
  { href: "/methodology", label: "Methodology", questions: ["sure"] },
];

export function screenFor(pathname: string): Screen {
  return (
    SCREENS.filter((s) => (s.href === "/" ? pathname === "/" : pathname.startsWith(s.href))).sort(
      (a, b) => b.href.length - a.href.length,
    )[0] ?? SCREENS[0]
  );
}

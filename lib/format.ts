const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025-09-30" -> "30 Sep 2025" (no timezone drift). */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const fmtNum = (x: number, dp = 1) =>
  x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtPct = (x: number, dp = 0) => `${fmtNum(x * 100, dp)}%`;

/** USD m with thousands separator. */
export const fmtUsdM = (x: number, dp = 0) => `USD ${fmtNum(x, dp)}m`;

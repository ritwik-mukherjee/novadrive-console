import type { FeedEvent } from "./alertFeed";

export interface Preset {
  key: string;
  label: string;
  expect: string; // what the demo should show
  event: Omit<FeedEvent, "id" | "simulated">;
}

const DAY = "2025-09-30"; // case cut-off; freshness compares published vs effective only

export const PRESETS: Preset[] = [
  {
    key: "fire",
    label: "Fire at Cobalt Works (SITE-032)",
    expect: "Exact entity + production site → HIGH, 100% of revenue",
    event: {
      title: "Fire at Cobalt Works (SITE-032)",
      text: "A fire broke out overnight at Cobalt Works (SITE-032). SMT lines are shut down pending a safety inspection.",
      published: DAY,
      effective: DAY,
      sourceFamily: "SIM-FIRE-032",
      sourceType: "Report",
    },
  },
  {
    key: "typhoon",
    label: "Typhoon warning for Z04",
    expect: "Zone match → Cobalt, Grove, Lumen, Rill, Xenon",
    event: {
      title: "Typhoon warning for Z04",
      text: "The regional weather authority issues a typhoon warning for Z04; landfall is expected within 48 hours.",
      published: DAY,
      effective: DAY,
      sourceFamily: "SIM-WX-Z04",
      sourceType: "Authority bulletin",
    },
  },
  {
    key: "pilot",
    label: "IonPeak Western Ridge pilot line outage",
    expect: "Right entity, non-production site SITE-900 → low score with explanation",
    event: {
      title: "IonPeak Western Ridge pilot line outage",
      text: "IonPeak Semiconductor reports an outage at its Western Ridge pilot line after a power failure.",
      published: DAY,
      effective: DAY,
      sourceFamily: "SIM-IONPEAK-900",
      sourceType: "Report",
    },
  },
  {
    key: "harbor",
    label: "Harbor Works strike",
    expect: "Disambiguation: NovaDrive's own Harbor Works plant vs Harbor Freight SITE-242",
    event: {
      title: "Harbor Works strike",
      text: "Workers at Harbor Works begin an indefinite strike.",
      published: DAY,
      effective: DAY,
      sourceFamily: "SIM-HARBOR-STRIKE",
      sourceType: "Report",
    },
  },
  {
    key: "delta",
    label: "Delta announces layoffs",
    expect: "Ambiguous entity → asks: Delta Capacitor Works or Delta Consumer Plastics?",
    event: {
      title: "Delta announces layoffs",
      text: "Delta announces layoffs of 15% of its workforce.",
      published: DAY,
      effective: DAY,
      sourceFamily: "SIM-DELTA-LAYOFFS",
      sourceType: "Report",
    },
  },
];

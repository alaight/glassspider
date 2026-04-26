import type { Source } from "@/lib/types";

function parseCadence(cadence: string | null) {
  if (!cadence || cadence === "manual") {
    return null;
  }

  const match = cadence.match(/^(\d+)(h|d|w)$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit as keyof typeof multipliers];
}

export function isSourceDue(source: Source, runType: "crawl" | "scrape", now = new Date()) {
  const cadence = parseCadence(runType === "crawl" ? source.crawl_frequency : source.scrape_frequency);

  if (!cadence || source.status !== "active") {
    return false;
  }

  const lastRun = runType === "crawl" ? source.last_crawled_at : source.last_scraped_at;

  if (!lastRun) {
    return true;
  }

  return now.getTime() - new Date(lastRun).getTime() >= cadence;
}

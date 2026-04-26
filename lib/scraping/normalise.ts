import * as cheerio from "cheerio";

function extractMoney(text: string) {
  const match = text.match(/£\s?([\d,]+(?:\.\d{2})?)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function extractDate(text: string) {
  const match = text.match(/\b(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})\b/);

  if (!match) {
    return null;
  }

  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function estimateRenewalDate(startDate: string | null, endDate: string | null) {
  if (endDate) {
    return endDate;
  }

  if (!startDate) {
    return null;
  }

  const parsed = new Date(startDate);
  parsed.setFullYear(parsed.getFullYear() + 4);
  return parsed.toISOString().slice(0, 10);
}

function classifySector(text: string) {
  const lower = text.toLowerCase();

  if (lower.match(/\brail|railway|track|network rail\b/)) {
    return "rail";
  }

  if (lower.match(/\bhighway|road|carriageway|footway|traffic\b/)) {
    return "highways";
  }

  if (lower.match(/\bbridge|structure|inspection|principal inspection\b/)) {
    return "structures";
  }

  if (lower.match(/\bdrainage|culvert|flood\b/)) {
    return "drainage";
  }

  if (lower.match(/\bcivil|infrastructure|construction|maintenance\b/)) {
    return "civil infrastructure";
  }

  return "unclassified";
}

function relevanceScore(text: string) {
  const sector = classifySector(text);
  return sector === "unclassified" ? 25 : 75;
}

export function normaliseRecordFromHtml(sourceUrl: string, html: string) {
  const $ = cheerio.load(html);
  const title = $("h1").first().text().trim() || $("title").text().trim() || "Untitled notice";
  const rawText = $("body").text().replace(/\s+/g, " ").trim();
  const value = extractMoney(rawText);
  const date = extractDate(rawText);
  const sector = classifySector(`${title} ${rawText}`);

  return {
    raw: {
      source_url: sourceUrl,
      raw_title: title,
      raw_text: rawText.slice(0, 100000),
      raw_metadata: {
        extracted_by: "html-normaliser-v1",
      },
      content_hash: null,
      extraction_status: sector === "unclassified" ? "needs_review" : "pending",
    },
    bid: {
      source_url: sourceUrl,
      title,
      description: rawText.slice(0, 4000),
      sector_primary: sector,
      relevance_score: relevanceScore(`${title} ${rawText}`),
      contract_value_awarded: value,
      currency: value ? "GBP" : null,
      published_date: date,
      estimated_renewal_date: estimateRenewalDate(null, null),
      review_status: sector === "unclassified" ? "needs_review" : "pending",
      ai_summary: null,
    },
  };
}

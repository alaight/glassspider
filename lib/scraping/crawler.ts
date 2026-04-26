import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyUrl, matchedRuleLabel, normaliseUrl, shouldVisitUrl } from "@/lib/scraping/url-rules";
import type { Source, SourceRule } from "@/lib/types";

const MAX_PAGES_PER_MANUAL_RUN = 25;

type CrawlResult = {
  pagesVisited: number;
  urlsDiscovered: number;
};

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function crawlSource({
  supabase,
  source,
  rules,
  runId,
}: {
  supabase: SupabaseClient;
  source: Source;
  rules: SourceRule[];
  runId: string;
}): Promise<CrawlResult> {
  const queue = [...source.entry_urls];
  const visited = new Set<string>();
  const discovered = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_PAGES_PER_MANUAL_RUN) {
    const nextUrl = queue.shift();

    if (!nextUrl || visited.has(nextUrl) || !shouldVisitUrl(nextUrl, rules)) {
      continue;
    }

    visited.add(nextUrl);

    try {
      const response = await fetch(nextUrl, {
        headers: {
          "user-agent": "GlassspiderBot/0.1 (+https://laightworks.com)",
        },
      });
      const html = await response.text();
      const hash = await sha256(html);
      const $ = cheerio.load(html);

      await supabase.from("glassspider_discovered_urls").upsert(
        {
          source_id: source.id,
          run_id: runId,
          url: nextUrl,
          url_type: classifyUrl(nextUrl, rules),
          status: response.ok ? "queued" : "failed",
          http_status: response.status,
          content_hash: hash,
          matched_rule: matchedRuleLabel(nextUrl, rules),
          last_seen_at: new Date().toISOString(),
          last_crawled_at: new Date().toISOString(),
        },
        { onConflict: "source_id,url" },
      );

      $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        const normalised = href ? normaliseUrl(href, source.base_url) : null;

        if (!normalised || visited.has(normalised) || discovered.has(normalised)) {
          return;
        }

        if (!normalised.startsWith(source.base_url) || !shouldVisitUrl(normalised, rules)) {
          return;
        }

        discovered.add(normalised);
        queue.push(normalised);
      });
    } catch (error) {
      await supabase.from("glassspider_discovered_urls").upsert(
        {
          source_id: source.id,
          run_id: runId,
          url: nextUrl,
          url_type: classifyUrl(nextUrl, rules),
          status: "failed",
          error_message: error instanceof Error ? error.message : "Crawl failed.",
          matched_rule: matchedRuleLabel(nextUrl, rules),
          last_seen_at: new Date().toISOString(),
          last_crawled_at: new Date().toISOString(),
        },
        { onConflict: "source_id,url" },
      );
    }
  }

  return {
    pagesVisited: visited.size,
    urlsDiscovered: discovered.size,
  };
}

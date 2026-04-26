import type { SupabaseClient } from "@supabase/supabase-js";

import { normaliseRecordFromHtml } from "@/lib/scraping/normalise";
import type { DiscoveredUrl, Source } from "@/lib/types";

const MAX_RECORDS_PER_MANUAL_RUN = 20;

type ScrapeResult = {
  recordsExtracted: number;
  recordsUpdated: number;
};

export async function scrapeSource({
  supabase,
  source,
  runId,
}: {
  supabase: SupabaseClient;
  source: Source;
  runId: string;
}): Promise<ScrapeResult> {
  const { data: urls, error } = await supabase
    .from("glassspider_discovered_urls")
    .select("*")
    .eq("source_id", source.id)
    .in("url_type", ["detail", "award", "unknown"])
    .neq("status", "ignored")
    .order("last_seen_at", { ascending: false })
    .limit(MAX_RECORDS_PER_MANUAL_RUN);

  if (error) {
    throw new Error(error.message);
  }

  let recordsExtracted = 0;
  let recordsUpdated = 0;

  for (const url of (urls ?? []) as DiscoveredUrl[]) {
    try {
      const response = await fetch(url.url, {
        headers: {
          "user-agent": "GlassspiderBot/0.1 (+https://laightworks.com)",
        },
      });
      const html = await response.text();
      const normalised = normaliseRecordFromHtml(url.url, html);

      const { data: rawRecord, error: rawError } = await supabase
        .from("glassspider_raw_records")
        .insert({
          ...normalised.raw,
          source_id: source.id,
          discovered_url_id: url.id,
          run_id: runId,
        })
        .select("id")
        .single();

      if (rawError) {
        throw new Error(rawError.message);
      }

      const { error: bidError } = await supabase.from("glassspider_bid_records").upsert(
        {
          ...normalised.bid,
          source_id: source.id,
          raw_record_id: rawRecord.id,
        },
        { onConflict: "source_url" },
      );

      if (bidError) {
        throw new Error(bidError.message);
      }

      await supabase
        .from("glassspider_discovered_urls")
        .update({ status: "scraped", http_status: response.status })
        .eq("id", url.id);

      recordsExtracted += 1;
      recordsUpdated += 1;
    } catch (scrapeError) {
      await supabase
        .from("glassspider_discovered_urls")
        .update({
          status: "failed",
          error_message: scrapeError instanceof Error ? scrapeError.message : "Scrape failed.",
        })
        .eq("id", url.id);
    }
  }

  return { recordsExtracted, recordsUpdated };
}

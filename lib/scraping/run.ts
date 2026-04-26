import type { SupabaseClient } from "@supabase/supabase-js";

import { crawlSource } from "@/lib/scraping/crawler";
import { scrapeSource } from "@/lib/scraping/scraper";
import type { RunType, Source, SourceRule } from "@/lib/types";

export async function runSourcePipeline({
  supabase,
  source,
  rules,
  runType,
  triggeredBy,
}: {
  supabase: SupabaseClient;
  source: Source;
  rules: SourceRule[];
  runType: RunType;
  triggeredBy?: string;
}) {
  const { data: run, error: runError } = await supabase
    .from("glassspider_runs")
    .insert({
      source_id: source.id,
      run_type: runType,
      status: "running",
      triggered_by: triggeredBy ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (runError) {
    throw new Error(runError.message);
  }

  try {
    const crawlResult =
      runType === "crawl" || runType === "scrape"
        ? await crawlSource({ supabase, source, rules, runId: run.id })
        : { pagesVisited: 0, urlsDiscovered: 0 };

    const scrapeResult =
      runType === "scrape"
        ? await scrapeSource({ supabase, source, runId: run.id })
        : { recordsExtracted: 0, recordsUpdated: 0 };

    await supabase
      .from("glassspider_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        pages_visited: crawlResult.pagesVisited,
        urls_discovered: crawlResult.urlsDiscovered,
        records_extracted: scrapeResult.recordsExtracted,
        records_updated: scrapeResult.recordsUpdated,
      })
      .eq("id", run.id);

    await supabase
      .from("glassspider_sources")
      .update({
        last_crawled_at:
          runType === "crawl" || runType === "scrape" ? new Date().toISOString() : source.last_crawled_at,
        last_scraped_at: runType === "scrape" ? new Date().toISOString() : source.last_scraped_at,
      })
      .eq("id", source.id);

    return {
      id: run.id,
      status: "succeeded" as const,
      ...crawlResult,
      ...scrapeResult,
    };
  } catch (error) {
    await supabase
      .from("glassspider_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : "Pipeline failed.",
      })
      .eq("id", run.id);

    throw error;
  }
}

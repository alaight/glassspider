import { NextResponse } from "next/server";

import { listSourceRules, listSources } from "@/lib/db";
import { runSourcePipeline } from "@/lib/scraping/run";
import { isSourceDue } from "@/lib/scraping/schedule";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedSecret = process.env.GLASSSPIDER_CRON_SECRET;
  const providedSecret = request.headers.get("x-glassspider-cron-secret");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized scheduled run." }, { status: 401 });
  }

  const service = createSupabaseServiceClient();

  if (!service) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for scheduled runs." },
      { status: 500 },
    );
  }

  const sources = await listSources(service);

  if (sources.error) {
    return NextResponse.json({ error: sources.error }, { status: 500 });
  }

  const results = [];

  for (const source of sources.data) {
    const runType = isSourceDue(source, "scrape") ? "scrape" : isSourceDue(source, "crawl") ? "crawl" : null;

    if (!runType) {
      continue;
    }

    const rules = await listSourceRules(service, source.id);

    if (rules.error) {
      results.push({ source: source.slug, status: "failed", error: rules.error });
      continue;
    }

    try {
      const result = await runSourcePipeline({
        supabase: service,
        source,
        rules: rules.data,
        runType,
      });

      await service
        .from("glassspider_sources")
        .update({
          last_crawled_at: new Date().toISOString(),
          last_scraped_at: runType === "scrape" ? new Date().toISOString() : source.last_scraped_at,
        })
        .eq("id", source.id);

      results.push({ source: source.slug, ...result });
    } catch (error) {
      results.push({
        source: source.slug,
        status: "failed",
        error: error instanceof Error ? error.message : "Scheduled run failed.",
      });
    }
  }

  return NextResponse.json({ results });
}

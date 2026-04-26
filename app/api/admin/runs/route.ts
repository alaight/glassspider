import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminAccess } from "@/lib/auth";
import { getSource, listSourceRules } from "@/lib/db";
import { runSourcePipeline } from "@/lib/scraping/run";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const runRequestSchema = z.object({
  sourceId: z.string().uuid(),
  runType: z.enum(["crawl", "scrape", "classify"]),
});

export async function POST(request: Request) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return NextResponse.json({ error: access.message ?? "Admin access required." }, { status: 403 });
  }

  const parsed = runRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid run request." }, { status: 400 });
  }

  const service = createSupabaseServiceClient();

  if (!service) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is required for pipeline runs." },
      { status: 500 },
    );
  }

  const [source, rules] = await Promise.all([
    getSource(service, parsed.data.sourceId),
    listSourceRules(service, parsed.data.sourceId),
  ]);

  if (!source.data) {
    return NextResponse.json({ error: source.error ?? "Source not found." }, { status: 404 });
  }

  if (rules.error) {
    return NextResponse.json({ error: rules.error }, { status: 500 });
  }

  const result = await runSourcePipeline({
    supabase: service,
    source: source.data,
    rules: rules.data,
    runType: parsed.data.runType,
    triggeredBy: access.userId,
  });

  return NextResponse.json(result);
}

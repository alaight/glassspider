import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminAccess } from "@/lib/auth";
import { enqueueJob } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const runRequestSchema = z.object({
  sourceId: z.string().uuid(),
  runType: z.enum(["crawl", "scrape", "classify"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  scheduledAt: z.string().datetime().optional(),
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

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const result = await enqueueJob(supabase, {
    type: parsed.data.runType,
    sourceId: parsed.data.sourceId,
    payload: parsed.data.payload ?? {},
    scheduledAt: parsed.data.scheduledAt,
    createdBy: access.userId,
  });

  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? "Job could not be queued." }, { status: 500 });
  }

  return NextResponse.json({
    jobId: result.data.id,
    status: result.data.status,
    type: result.data.type,
    sourceId: result.data.source_id,
  });
}

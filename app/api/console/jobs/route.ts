import { NextResponse } from "next/server";

import { getProductAccess } from "@/lib/auth";
import { ADMIN_ROLES } from "@/lib/product";
import { listRuns } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getProductAccess();

  if (access.status !== "granted" || !access.role || !ADMIN_ROLES.includes(access.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const [jobs, runs] = await Promise.all([listJobs(supabase), listRuns(supabase)]);

  return NextResponse.json({
    jobs,
    runs,
    fetchedAt: new Date().toISOString(),
  });
}

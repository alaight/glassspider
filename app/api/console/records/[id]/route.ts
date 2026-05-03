import { NextResponse } from "next/server";

import { getProductAccess } from "@/lib/auth";
import { getRecordWorkspace } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const access = await getProductAccess();

  if (access.status !== "granted") {
    return NextResponse.json({ error: access.message ?? "Access denied." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const workspace = await getRecordWorkspace(supabase, id);

  if (workspace.error) {
    return NextResponse.json({ error: workspace.error }, { status: 500 });
  }

  if (!workspace.data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(workspace.data);
}

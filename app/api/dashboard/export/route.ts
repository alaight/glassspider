import { NextResponse } from "next/server";

import { requireProductAccess } from "@/lib/auth";
import { listBidRecords } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function csvValue(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return NextResponse.json({ error: access.message ?? "Access denied." }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const records = await listBidRecords(supabase);

  if (records.error) {
    return NextResponse.json({ error: records.error }, { status: 500 });
  }

  const headers = [
    "title",
    "buyer_name",
    "supplier_name",
    "sector_primary",
    "contract_value_awarded",
    "estimated_renewal_date",
    "source_url",
  ];
  const rows = records.data.map((record) => headers.map((header) => csvValue(record[header as keyof typeof record])).join(","));
  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=glassspider-records.csv",
    },
  });
}

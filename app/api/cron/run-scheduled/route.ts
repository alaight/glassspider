import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Scheduled scraping is owned by the Fly worker. This Vercel route does not execute or enqueue scraping jobs.",
    },
    { status: 410 },
  );
}

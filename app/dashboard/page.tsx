import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { StatusCard } from "@/components/status-card";
import { requireProductAccess } from "@/lib/auth";
import { listBidRecords } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const records = await listBidRecords(supabase);
  const upcoming = records.data.filter((record) => record.estimated_renewal_date);
  const review = records.data.filter((record) => record.review_status === "needs_review");

  return (
    <Shell
      eyebrow="Viewer"
      title="Bid intelligence dashboard"
      description="Search normalised public procurement data, track historical winners, and prepare for likely renewal windows."
      navItems={[
        { href: "/dashboard/search", label: "Search" },
        { href: "/dashboard/renewals", label: "Renewals" },
      ]}
    >
      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard title="Records" value={records.data.length} caption="Canonical bid records" />
        <StatusCard title="Renewal dates" value={upcoming.length} caption="Records with estimated renewal dates" />
        <StatusCard title="Needs review" value={review.length} caption="Low-confidence records" />
      </div>

      {records.error ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          {records.error}
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Latest records</h2>
        <div className="mt-5 space-y-3">
          {records.data.slice(0, 8).map((record) => (
            <Link key={record.id} href={`/dashboard/records/${record.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
              <h3 className="font-semibold text-slate-950">{record.title}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {record.buyer_name ?? "Unknown buyer"} · {record.sector_primary ?? "Unclassified"} · renewal{" "}
                {record.estimated_renewal_date ?? "unknown"}
              </p>
            </Link>
          ))}
          {records.data.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
              No bid records yet. Admin users can run a source scrape after migrations and configuration are ready.
            </p>
          ) : null}
        </div>
      </section>
    </Shell>
  );
}

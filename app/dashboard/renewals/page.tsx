import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireProductAccess } from "@/lib/auth";
import { listBidRecords } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function bucketFor(dateValue: string | null) {
  if (!dateValue) {
    return "Unknown";
  }

  const now = new Date();
  const date = new Date(dateValue);
  const months = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();

  if (months <= 3) return "Next 3 months";
  if (months <= 6) return "Next 6 months";
  if (months <= 12) return "Next 12 months";
  if (months <= 24) return "Next 24 months";
  return "Later";
}

export default async function RenewalsPage() {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const records = await listBidRecords(supabase);
  const buckets = ["Next 3 months", "Next 6 months", "Next 12 months", "Next 24 months", "Later", "Unknown"];

  return (
    <Shell
      eyebrow="Viewer"
      title="Renewal pipeline"
      description="Contracts grouped by estimated renewal date so bid preparation can start ahead of expiry."
      navItems={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/search", label: "Search" },
      ]}
    >
      <div className="space-y-5">
        {buckets.map((bucket) => {
          const bucketRecords = records.data.filter((record) => bucketFor(record.estimated_renewal_date) === bucket);

          return (
            <section key={bucket} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-950">
                {bucket} <span className="text-slate-400">({bucketRecords.length})</span>
              </h2>
              <div className="mt-4 space-y-3">
                {bucketRecords.map((record) => (
                  <Link key={record.id} href={`/dashboard/records/${record.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                    <h3 className="font-semibold text-slate-950">{record.title}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {record.buyer_name ?? "Unknown buyer"} · {record.estimated_renewal_date ?? "no renewal estimate"}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}

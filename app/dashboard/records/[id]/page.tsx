import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireProductAccess } from "@/lib/auth";
import { getBidRecord } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RecordPageProps = {
  params: Promise<{ id: string }>;
};

export default async function RecordPage({ params }: RecordPageProps) {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const { id } = await params;
  const record = await getBidRecord(supabase, id);

  if (!record.data) {
    return (
      <Shell title="Record not found" eyebrow="Viewer" navItems={[{ href: "/dashboard/search", label: "Search" }]}>
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
          The record could not be loaded. {record.error}
        </p>
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow="Bid record"
      title={record.data.title}
      description={record.data.buyer_name ?? "No buyer recorded yet."}
      navItems={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/search", label: "Search" },
        { href: "/dashboard/renewals", label: "Renewals" },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Opportunity summary</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {[
              ["Supplier", record.data.supplier_name ?? "Unknown"],
              ["Sector", record.data.sector_primary ?? "Unclassified"],
              ["Region", record.data.region ?? "Unknown"],
              ["Award value", record.data.contract_value_awarded ? `£${record.data.contract_value_awarded.toLocaleString()}` : "Unknown"],
              ["Award date", record.data.award_date ?? "Unknown"],
              ["Start date", record.data.start_date ?? "Unknown"],
              ["End date", record.data.end_date ?? "Unknown"],
              ["Renewal estimate", record.data.estimated_renewal_date ?? "Unknown"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <dt className="text-sm font-medium text-slate-500">{label}</dt>
                <dd className="mt-1 font-semibold text-slate-950">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Source</h2>
          <a href={record.data.source_url} target="_blank" rel="noreferrer" className="mt-4 block break-all text-sm text-teal-700">
            {record.data.source_url}
          </a>
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Review status: <strong>{record.data.review_status}</strong>
          </p>
        </aside>
      </div>
    </Shell>
  );
}

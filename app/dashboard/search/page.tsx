import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireProductAccess } from "@/lib/auth";
import { listBidRecords } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; sector?: string }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const params = await searchParams;
  const records = await listBidRecords(supabase);
  const query = params.q?.toLowerCase().trim() ?? "";
  const sector = params.sector?.toLowerCase().trim() ?? "";
  const filtered = records.data.filter((record) => {
    const haystack = `${record.title} ${record.buyer_name ?? ""} ${record.supplier_name ?? ""}`.toLowerCase();
    const sectorMatch = !sector || record.sector_primary?.toLowerCase() === sector;
    return (!query || haystack.includes(query)) && sectorMatch;
  });

  return (
    <Shell
      eyebrow="Viewer"
      title="Search records"
      description="The MVP starts with Postgres-backed filtering. Elasticsearch/OpenSearch can be added later if fuzzy search or scale requires it."
      navItems={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/renewals", label: "Renewals" },
      ]}
    >
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_220px_auto]">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search title, buyer, supplier"
          className="rounded-xl border border-slate-300 px-3 py-2"
        />
        <input
          name="sector"
          defaultValue={params.sector ?? ""}
          placeholder="Sector"
          className="rounded-xl border border-slate-300 px-3 py-2"
        />
        <button className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white">
          Search
        </button>
      </form>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{filtered.length} records</h2>
          <a
            href="/api/dashboard/export"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Export CSV
          </a>
        </div>
        {records.error ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{records.error}</p>
        ) : null}
        <div className="mt-5 space-y-3">
          {filtered.map((record) => (
            <Link key={record.id} href={`/dashboard/records/${record.id}`} className="block rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
              <h3 className="font-semibold text-slate-950">{record.title}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {record.supplier_name ?? "No supplier recorded"} · {record.contract_value_awarded ? `£${record.contract_value_awarded.toLocaleString()}` : "value unknown"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}

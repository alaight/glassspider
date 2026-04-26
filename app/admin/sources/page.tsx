import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { createSource, seedBidStatsSource } from "@/app/admin/actions";
import { requireAdminAccess } from "@/lib/auth";
import { listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const sources = await listSources(supabase);

  return (
    <Shell
      eyebrow="Admin"
      title="Sources"
      description="Manage configurable procurement sources. The MVP keeps source rules central so new sites do not become one-off code paths."
      navItems={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/runs", label: "Runs" },
        { href: "/admin/url-map", label: "URL map" },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Configured sources</h2>
          {sources.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{sources.error}</p>
          ) : null}
          <div className="mt-5 space-y-3">
            {sources.data.map((source) => (
              <Link
                key={source.id}
                href={`/admin/sources/${source.id}`}
                className="block rounded-2xl border border-slate-200 p-4 transition hover:border-teal-300 hover:bg-teal-50/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950">{source.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{source.base_url}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {source.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-500">
                  {source.entry_urls.length} entry URL{source.entry_urls.length === 1 ? "" : "s"}
                </p>
              </Link>
            ))}
            {sources.data.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">
                No sources yet. Add BidStats or another first target after reviewing its access terms.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Add source</h2>
              <p className="mt-1 text-sm text-slate-500">Seed BidStats or add another public source manually.</p>
            </div>
            <form action={seedBidStatsSource}>
              <button className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800">
                Seed BidStats
              </button>
            </form>
          </div>
          <form action={createSource} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Name
              <input name="name" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Slug
              <input name="slug" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Base URL
              <input name="base_url" type="url" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Entry URLs
              <textarea
                name="entry_urls"
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="One URL per line"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Status
              <select name="status" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Compliance notes
              <textarea name="compliance_notes" rows={3} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <button className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              Save source
            </button>
          </form>
        </section>
      </div>
    </Shell>
  );
}

import { startSourceRun } from "@/app/admin/actions";
import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireAdminAccess } from "@/lib/auth";
import { listRuns, listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return <AccessPanel access={access} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <AccessPanel access={{ status: "configuration_required" }} />;
  }

  const [sources, runs] = await Promise.all([listSources(supabase), listRuns(supabase)]);

  return (
    <Shell
      eyebrow="Admin"
      title="Runs"
      description="Trigger manual crawl/scrape runs and inspect operational history before automation is enabled."
      navItems={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/sources", label: "Sources" },
        { href: "/admin/url-map", label: "URL map" },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Start manual run</h2>
          <form action={startSourceRun} className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Source
              <select name="source_id" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                {sources.data.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Run type
              <select name="run_type" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="crawl">Crawl and map URLs</option>
                <option value="scrape">Crawl, scrape, and normalise</option>
                <option value="classify">Classification only</option>
              </select>
            </label>
            <button
              className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={sources.data.length === 0}
            >
              Run now
            </button>
            {sources.data.length === 0 ? (
              <p className="text-sm text-slate-500">Add a source before starting a run.</p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Run history</h2>
          {runs.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{runs.error}</p>
          ) : null}
          <div className="mt-5 space-y-3">
            {runs.data.map((run) => (
              <article key={run.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {run.run_type} / {run.status}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">{new Date(run.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">{run.pages_visited} pages</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{run.urls_discovered} URLs</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{run.records_extracted} records</span>
                  </div>
                </div>
                {run.error_message ? <p className="mt-3 text-sm text-red-700">{run.error_message}</p> : null}
              </article>
            ))}
            {runs.data.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No runs yet.</p>
            ) : null}
          </div>
        </section>
      </div>
    </Shell>
  );
}

import { retryFailedJob, startSourceRun } from "@/app/admin/actions";
import { AccessPanel } from "@/components/access-panel";
import { Shell } from "@/components/shell";
import { requireAdminAccess } from "@/lib/auth";
import { listRuns, listSources } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
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

  const [sources, runs, jobs] = await Promise.all([listSources(supabase), listRuns(supabase), listJobs(supabase)]);

  return (
    <Shell
      eyebrow="Admin"
      title="Runs"
      description="Queue independent crawl, scrape, and classify jobs. The Fly worker executes jobs; Vercel only creates and displays them."
      navItems={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/sources", label: "Sources" },
        { href: "/admin/url-map", label: "URL map" },
      ]}
    >
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Queue manual job</h2>
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
              Job type
              <select name="run_type" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="crawl">Crawl: discover URLs only</option>
                <option value="scrape">Scrape: selected/filter URLs only</option>
                <option value="classify">Classify: selected/filter records only</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Crawl max pages
              <input name="max_pages" type="number" defaultValue={25} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Scrape filter</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  URL status
                  <select name="url_status" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                    <option value="queued">Queued</option>
                    <option value="new">New</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  URL type
                  <select name="url_type" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                    <option value="detail">Detail</option>
                    <option value="award">Award</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Classify review status
              <select name="review_status" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="pending">Pending</option>
                <option value="needs_review">Needs review</option>
              </select>
            </label>
            <button
              className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={sources.data.length === 0}
            >
              Queue job
            </button>
            {sources.data.length === 0 ? (
              <p className="text-sm text-slate-500">Add a source before starting a run.</p>
            ) : null}
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Job queue</h2>
          {jobs.error ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{jobs.error}</p>
          ) : null}
          <div className="mt-5 space-y-3">
            {jobs.data.map((job) => (
              <article key={job.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-950">
                      {job.type} / {job.status}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Attempts {job.attempt_count}/{job.max_attempts} · scheduled{" "}
                      {new Date(job.scheduled_at).toLocaleString()}
                    </p>
                    {job.locked_by ? <p className="mt-1 text-xs text-slate-400">Locked by {job.locked_by}</p> : null}
                  </div>
                  {job.status === "failed" ? (
                    <form action={retryFailedJob}>
                      <input type="hidden" name="job_id" value={job.id} />
                      <button className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
                        Retry
                      </button>
                    </form>
                  ) : null}
                </div>
                {job.last_error ? <p className="mt-3 text-sm text-red-700">{job.last_error}</p> : null}
                <pre className="mt-3 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-white">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </article>
            ))}
            {jobs.data.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">No jobs queued yet.</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Run telemetry</h2>
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
    </Shell>
  );
}

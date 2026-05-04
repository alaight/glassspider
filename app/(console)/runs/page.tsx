import { startSourceRun } from "@/app/actions/console";
import { AccessPanel } from "@/components/access-panel";
import { RunsJobsMonitor } from "@/components/runs/runs-jobs-monitor";
import { Panel } from "@/components/ui/panel";
import { ConsoleButton } from "@/components/ui/button-group";
import { requireAdminAccess } from "@/lib/auth";
import { listRuns, listSources } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RunsConsolePage() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return (
      <div className="p-6">
        <AccessPanel access={access} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="p-6">
        <AccessPanel access={{ status: "configuration_required" }} />
      </div>
    );
  }

  const [sources, jobs, runs] = await Promise.all([listSources(supabase), listJobs(supabase), listRuns(supabase)]);

  return (
    <div className="space-y-4 p-4">
      <Panel title="Runs / jobs" eyebrow="Start work & watch failures">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            This panel <strong className="font-semibold text-slate-900">enqueues backend jobs</strong> (crawl, extract/scrape, classify) executed by workers. The
            right-hand timeline lists jobs/runs plus payload and result excerpts—ideal for diagnosing why a crawl never produced URLs or extract failed midway.
          </p>
          <div>
            <p className="font-semibold text-slate-900">Order of operations</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 [&>li]:text-slate-700">
              <li>Crawl discovers URLs → inspect them in URL map.</li>
              <li>Extract pulls structured fields → surfaced under Data and per-record inspectors.</li>
              <li>Classify assigns review/metadata using the backlog filters exposed in the form.</li>
            </ul>
          </div>
          <p className="text-[var(--muted)]">
            Workers poll Postgres; timestamps refresh about every five seconds—navigate elsewhere and back if a job finished without an obvious flash.
          </p>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr]">
        <Panel title="Queue job">
          <form action={startSourceRun} className="space-y-3 text-xs">
            <label className="block font-medium">
              Source
              <select name="source_id" required className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                {sources.data.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block font-medium">
              Job type
              <select name="run_type" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                <option value="crawl">Crawl • discover URLs</option>
                <option value="scrape">Extract • hydrate records</option>
                <option value="classify">Classify • labelling</option>
              </select>
            </label>

            <label className="block font-medium">
              Crawl max pages
              <input name="max_pages" defaultValue={25} type="number" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
            </label>

            <div className="rounded border border-dashed border-[var(--panel-border)] bg-slate-50 p-3">
              <p className="text-[var(--muted)]">Scrape filter</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label>
                  Status
                  <select name="url_status" defaultValue="queued" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                    <option value="queued">queued</option>
                    <option value="new">new</option>
                    <option value="failed">failed</option>
                  </select>
                </label>
                <label>
                  URL type
                  <select name="url_type" defaultValue="detail" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                    <option value="detail">detail</option>
                    <option value="award">award</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
              </div>
            </div>

            <label className="block font-medium">
              Classifier review filter
              <select name="review_status" defaultValue="pending" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
                <option value="pending">pending</option>
                <option value="needs_review">needs_review</option>
              </select>
            </label>

            <ConsoleButton variant="primary" type="submit" className="w-full" disabled={sources.data.length === 0}>
              Enqueue job
            </ConsoleButton>

            {sources.data.length === 0 ? (
              <p className="text-[11px] text-[var(--muted)]">Add a source first.</p>
            ) : null}
          </form>
          {sources.error ? <p className="mt-3 text-[11px] text-amber-900">{sources.error}</p> : null}
          {jobs.error ? <p className="mt-3 text-[11px] text-amber-900">{jobs.error}</p> : null}
          {runs.error ? <p className="mt-3 text-[11px] text-amber-900">{runs.error}</p> : null}
        </Panel>

        <RunsJobsMonitor initialJobs={jobs.data} initialRuns={runs.data} />
      </div>
    </div>
  );
}

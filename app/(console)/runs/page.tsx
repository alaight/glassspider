import { AccessPanel } from "@/components/access-panel";
import { RunJobForm } from "@/components/runs/run-job-form";
import { RunsJobsMonitor } from "@/components/runs/runs-jobs-monitor";
import { Panel } from "@/components/ui/panel";
import { requireAdminAccess } from "@/lib/auth";
import { listRuns, listSources } from "@/lib/db";
import { listJobs } from "@/lib/jobs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RunsConsolePageProps = {
  searchParams: Promise<{ source?: string; run_type?: string }>;
};

export default async function RunsConsolePage({ searchParams }: RunsConsolePageProps) {
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

  const [sources, jobs, runs, params] = await Promise.all([listSources(supabase), listJobs(supabase), listRuns(supabase), searchParams]);
  const defaultSourceId = sources.data.some((source) => source.id === params.source) ? params.source : sources.data[0]?.id;
  const defaultRunType = params.run_type === "crawl" || params.run_type === "classify" ? params.run_type : "scrape";

  return (
    <div className="space-y-4 p-4">
      <Panel title="Run extraction" eyebrow="Run">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            Start extraction jobs and monitor completion. Each run feeds records into Results.
          </p>
          <div>
            <p className="font-semibold text-slate-900">Workflow reminders</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 [&>li]:text-slate-700">
              <li>Crawl discovers URLs for crawl-based sources → inspect in Scope.</li>
              <li>Extract pulls structured fields → surfaced under Results and per-record inspectors.</li>
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
          <RunJobForm sources={sources.data} defaultSourceId={defaultSourceId} defaultRunType={defaultRunType} />
          {sources.error ? <p className="mt-3 text-[11px] text-amber-900">{sources.error}</p> : null}
          {jobs.error ? <p className="mt-3 text-[11px] text-amber-900">{jobs.error}</p> : null}
          {runs.error ? <p className="mt-3 text-[11px] text-amber-900">{runs.error}</p> : null}
        </Panel>

        <RunsJobsMonitor initialJobs={jobs.data} initialRuns={runs.data} />
      </div>
    </div>
  );
}

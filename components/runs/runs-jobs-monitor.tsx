"use client";

import { useEffect, useState, useTransition } from "react";

import { retryFailedJob } from "@/app/actions/console";
import { ButtonGroup, ConsoleButton } from "@/components/ui/button-group";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, inferJobTone } from "@/components/ui/status-badge";
import type { PipelineJob, PipelineRun } from "@/lib/types";

type Snapshot = {
  jobs: PipelineJob[];
  runs: PipelineRun[];
  fetchedAt?: string;
  error?: string;
};

export function RunsJobsMonitor({ initialJobs, initialRuns }: { initialJobs: PipelineJob[]; initialRuns: PipelineRun[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ jobs: initialJobs, runs: initialRuns });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, startRefresh] = useTransition();
  const [retryPending, startRetry] = useTransition();

  useEffect(() => {
    setSnapshot({ jobs: initialJobs, runs: initialRuns });
  }, [initialJobs, initialRuns]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch("/api/console/jobs");
        const payload = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setSnapshot((prev) => ({
            ...prev,
            error: payload?.error ?? "Unable to refresh jobs.",
          }));
          return;
        }

        setSnapshot({
          jobs: payload.jobs?.data ?? [],
          runs: payload.runs?.data ?? [],
          fetchedAt: payload.fetchedAt,
          error: payload.jobs?.error ?? payload.runs?.error,
        });
      } catch (error) {
        if (!cancelled) {
          setSnapshot((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Refresh failed.",
          }));
        }
      }
    };

    void poll();
    const id = setInterval(() => {
      startRefresh(() => void poll());
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [startRefresh]);

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Job queue"
        eyebrow="Live"
        actions={
          <span className="text-[10px] uppercase text-[var(--muted)]">
            {snapshot.fetchedAt ? `Updated ${new Date(snapshot.fetchedAt).toLocaleTimeString()}` : "Polling every 5s"}
          </span>
        }
      >
        {snapshot.error ? <p className="mb-3 text-xs text-amber-800">{snapshot.error}</p> : null}
        <div className="space-y-2">
          {snapshot.jobs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No jobs yet.</p>
          ) : (
            snapshot.jobs.map((job) => {
              const open = expanded === job.id;

              return (
                <div key={job.id} className="rounded border border-[var(--panel-border)] bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={inferJobTone(job.status)}>{job.status}</StatusBadge>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{job.type}</span>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{job.id}</p>
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        Scheduled {new Date(job.scheduled_at).toLocaleString()}
                        {job.started_at ? ` · Started ${new Date(job.started_at).toLocaleString()}` : null}
                        {job.completed_at ? ` · Finished ${new Date(job.completed_at).toLocaleString()}` : null}
                      </p>
                      {job.locked_by ? <p className="text-[10px] text-[var(--muted)]">Worker {job.locked_by}</p> : null}
                    </div>
                    <ButtonGroup>
                      <ConsoleButton variant="ghost" type="button" onClick={() => setExpanded(open ? null : job.id)}>
                        {open ? "Hide detail" : "Expand"}
                      </ConsoleButton>
                      {job.status === "failed" ? (
                        <ConsoleButton
                          variant="danger"
                          type="button"
                          disabled={retryPending}
                          onClick={() =>
                            startRetry(async () => {
                              try {
                                await retryFailedJob(job.id);
                              } catch (error) {
                                window.alert(error instanceof Error ? error.message : "Retry failed.");
                              }
                            })
                          }
                        >
                          Retry
                        </ConsoleButton>
                      ) : null}
                    </ButtonGroup>
                  </div>
                  {job.last_error ? <p className="border-t border-dashed border-red-100 px-3 py-2 text-xs text-red-700">{job.last_error}</p> : null}
                  {open ? (
                    <div className="space-y-2 border-t border-[var(--panel-border)] bg-slate-50 p-3 font-mono text-[10px] text-slate-800">
                      <div>
                        <p className="mb-1 text-[var(--muted)]">Payload</p>
                        <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2">{JSON.stringify(job.payload, null, 2)}</pre>
                      </div>
                      <div>
                        <p className="mb-1 text-[var(--muted)]">Result / telemetry</p>
                        <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2">{JSON.stringify(job.result ?? {}, null, 2)}</pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Panel>

      <Panel title="Run telemetry" eyebrow={`${snapshot.runs.length} recent`}>
        <div className="space-y-2">
          {snapshot.runs.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No runs logged yet.</p>
          ) : (
            snapshot.runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded border border-[var(--panel-border)] bg-white p-3 text-xs">
                <div>
                  <StatusBadge tone="neutral">{run.run_type}</StatusBadge>
                  <StatusBadge tone="neutral">{run.status}</StatusBadge>
                  <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">{run.id}</p>
                  <p className="text-[var(--muted)]">{new Date(run.created_at).toLocaleString()}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="rounded bg-slate-100 px-2 py-1">{run.pages_visited} pages</span>
                  <span className="rounded bg-slate-100 px-2 py-1">{run.urls_discovered} URLs</span>
                  <span className="rounded bg-slate-100 px-2 py-1">{run.records_extracted} extracted</span>
                  <span className="rounded bg-slate-100 px-2 py-1">{run.records_updated} updated</span>
                </div>
                {run.error_message ? <p className="w-full text-[11px] text-red-700">{run.error_message}</p> : null}
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

import Link from "next/link";

import { AccessPanel } from "@/components/access-panel";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireProductAccess } from "@/lib/auth";
import { getRecordWorkspace } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RecordDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function RecordWorkspacePage({ params }: RecordDetailProps) {
  const access = await requireProductAccess();

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

  const { id } = await params;
  const workspace = await getRecordWorkspace(supabase, id);

  if (workspace.error) {
    return (
      <div className="p-6">
        <Panel title="Record failed to load">{workspace.error}</Panel>
      </div>
    );
  }

  if (!workspace.data) {
    return (
      <div className="p-6">
        <Panel title="Not found">
          Unknown record id · <Link href="/data">Browse workspace</Link>
        </Panel>
      </div>
    );
  }

  const { record, raw, classifications } = workspace.data;

  const awardStartEnd = [record.award_date, record.start_date, record.end_date].filter(Boolean).join(" · ") || "—";

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-4">
        <Link href="/data" className="text-xs text-[var(--accent)] underline">
          ← Workspace
        </Link>
      </div>

      <Panel title={record.title} eyebrow={`Record · ${record.review_status}`}>
        <div className="grid gap-3 text-xs lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-[var(--muted)]">Parties</p>
            <p>
              Organisation: <span className="font-semibold">{record.buyer_name ?? "Unknown"}</span>
            </p>
            <p>
              Counterparty: <span className="font-semibold">{record.supplier_name ?? "Unknown"}</span>
            </p>
            <p>
              Category: <span className="font-semibold">{record.sector_primary ?? "Uncategorised"}</span>
            </p>
          </div>
          <div className="space-y-2 font-mono text-[11px]">
            <p>
              Published: {record.published_date ?? "—"}
              <br />
              Award · start · end:
              <br />
              {awardStartEnd}
            </p>
            <p>Value: {[record.currency, record.contract_value_awarded].filter(Boolean).join(" ") || "unknown"}</p>
            <p>{record.estimated_renewal_date ? `Renewal heuristic: ${record.estimated_renewal_date}` : ""}</p>
          </div>
          <div className="space-y-3">
            {record.description ? <p className="rounded border border-slate-200 bg-slate-50 p-2">{record.description}</p> : null}
            {record.ai_summary ? <p className="rounded border border-dashed border-teal-200 bg-teal-50/40 p-2">{record.ai_summary}</p> : null}
            <a className="block break-all text-[var(--accent)] underline-offset-2 hover:underline" href={record.source_url} target="_blank" rel="noreferrer">
              {record.source_url}
            </a>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
        <Panel title="Structured extraction">
          <pre className="max-h-[480px] overflow-auto rounded bg-slate-950 p-3 text-[11px] text-emerald-100">
            {JSON.stringify(record, null, 2)}
          </pre>
        </Panel>

        <Panel title="Raw capture">
          {raw?.raw_text ? (
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded border border-[var(--panel-border)] bg-white p-3 text-[11px]">
              {raw.raw_text.slice(0, 50_000)}
              {raw.raw_text.length > 50_000 ? "…truncated…" : ""}
            </pre>
          ) : (
            <p className="text-xs text-[var(--muted)]">No raw artefact persisted for this canonical row.</p>
          )}
        </Panel>
      </div>

      <Panel title={`Classifiers (${classifications.length})`}>
        {classifications.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Nothing labelled yet.</p>
        ) : (
          <ul className="space-y-3 text-xs">
            {classifications.map((classification) => (
              <li key={classification.id} className="rounded border border-[var(--panel-border)] bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="active">{classification.classifier}</StatusBadge>
                  {classification.prompt_version ? <span className="text-[var(--muted)]">{classification.prompt_version}</span> : null}
                  <StatusBadge tone="neutral">{classification.review_status}</StatusBadge>
                </div>
                <p className="mt-2 text-[var(--muted)]">{classification.labels.join(", ") || "(no labels)"}</p>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
                  {JSON.stringify(classification.output ?? {}, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

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
  const extracted = record.extracted ?? {};
  const productPage = typeof extracted.product_page_url === "string" ? extracted.product_page_url : record.primary_url;
  const productName = typeof extracted.product_name === "string" ? extracted.product_name : record.title;
  const linkedDocuments = Array.isArray(extracted.documents) ? extracted.documents.length : 0;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-4">
        <Link href="/data" className="text-xs text-[var(--accent)] underline">
          ← Results
        </Link>
      </div>

      <Panel title={record.title} eyebrow={`Record · ${record.record_type} · ${record.review_status}`}>
        <div className="grid gap-3 text-xs lg:grid-cols-3">
          <div className="space-y-2">
            <p className="text-[var(--muted)]">Product metadata</p>
            <p>
              Product: <span className="font-semibold">{productName ?? "Unknown"}</span>
            </p>
            <p>
              Category: <span className="font-semibold">{record.category ?? "Uncategorised"}</span>
            </p>
            <p>
              Group key: <span className="font-semibold">{typeof extracted.product_group_key === "string" ? extracted.product_group_key : "—"}</span>
            </p>
          </div>
          <div className="space-y-2 font-mono text-[11px]">
            <p>
              Source URL:
              <br />
              <span className="break-all">{record.source_url}</span>
            </p>
            <p>
              Published: {record.published_date ?? "—"}
            </p>
            <p>Linked documents: {linkedDocuments}</p>
          </div>
          <div className="space-y-3">
            {record.summary ? <p className="rounded border border-slate-200 bg-slate-50 p-2">{record.summary}</p> : null}
            <a className="block break-all text-[var(--accent)] underline-offset-2 hover:underline" href={record.source_url} target="_blank" rel="noreferrer">
              {record.source_url}
            </a>
            {productPage ? (
              <a className="block break-all text-[var(--accent)] underline-offset-2 hover:underline" href={productPage} target="_blank" rel="noreferrer">
                {productPage}
              </a>
            ) : null}
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

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ConsoleButton } from "@/components/ui/button-group";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Classification, RawRecord } from "@/lib/types";

type ApiPayload = {
  record: Record<string, unknown>;
  raw: RawRecord | null;
  classifications: Classification[];
};

export function RecordInspector({ recordId }: { recordId: string }) {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      void (async () => {
        setPending(true);
        setError(null);

        try {
          const response = await fetch(`/api/console/records/${recordId}`, { cache: "no-store" });
          const payload = await response.json();

          if (cancelled) {
            return;
          }

          if (!response.ok) {
            throw new Error(payload?.error ?? "Unable to fetch record.");
          }

          setData(payload as ApiPayload);
        } catch (err) {
          if (!cancelled) {
            setData(null);
            setError(err instanceof Error ? err.message : "Unexpected error.");
          }
        } finally {
          if (!cancelled) {
            setPending(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
    };
  }, [recordId, reloadKey]);

  const retry = () => {
    setReloadKey((key) => key + 1);
  };

  if (pending) {
    return (
      <div className="animate-pulse space-y-3 py-2">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-24 w-full rounded bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 text-xs">
        <p className="rounded border border-red-200 bg-red-50 p-2 text-red-800">{error}</p>
        <ConsoleButton variant="secondary" type="button" onClick={() => retry()}>
          Try again
        </ConsoleButton>
      </div>
    );
  }

  if (!data) {
    return <p className="text-xs text-[var(--muted)]">Nothing loaded.</p>;
  }

  const record = data.record as {
    title: string;
    source_url?: string;
    buyer_name?: string | null;
    supplier_name?: string | null;
    sector_primary?: string | null;
    review_status?: string;
    relevance_score?: number | null;
  };

  const rawPreview = data.raw?.raw_text ? `${data.raw.raw_text.slice(0, 4000)}${data.raw.raw_text.length > 4000 ? "…" : ""}` : "";

  return (
    <div className="space-y-3 text-xs">
      <Panel eyebrow="Record" title={record.title} padded>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {record.review_status ? <StatusBadge tone="neutral">{record.review_status}</StatusBadge> : null}
            {record.sector_primary ? <StatusBadge tone="neutral">{record.sector_primary}</StatusBadge> : null}
          </div>
          {record.buyer_name ? (
            <p>
              <span className="text-[var(--muted)]">Organisation</span>
              <br />
              <span className="font-medium">{record.buyer_name}</span>
            </p>
          ) : null}
          {record.supplier_name ? (
            <p>
              <span className="text-[var(--muted)]">Counterparty</span>
              <br />
              <span className="font-medium">{record.supplier_name}</span>
            </p>
          ) : null}
          {record.source_url ? (
            <a className="block break-all text-[var(--accent)] underline-offset-2 hover:underline" href={record.source_url} target="_blank" rel="noreferrer">
              {record.source_url}
            </a>
          ) : null}
          <Link className="inline-block rounded border border-[var(--panel-border)] px-3 py-1 text-[11px] font-semibold" href={`/records/${recordId}`}>
            Open full page →
          </Link>
        </div>
      </Panel>

      <Panel eyebrow="Raw capture" title="Captured text">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-[var(--panel-border)] bg-slate-50 p-2 text-[11px]">
          {data.raw?.raw_text ? rawPreview : "No raw text linked to this row yet."}
        </pre>
      </Panel>

      <Panel eyebrow={`${data.classifications.length} classifier(s)`} title="Labels & model output">
        {data.classifications.length === 0 ? (
          <p className="text-[var(--muted)]">No classifier output yet—queue a classify job if your pipeline uses it.</p>
        ) : (
          <ul className="space-y-2">
            {data.classifications.map((cls) => (
              <li key={cls.id} className="rounded border border-[var(--panel-border)] bg-white p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="active">{cls.classifier}</StatusBadge>
                  {cls.prompt_version ? <span className="text-[10px] text-[var(--muted)]">v{cls.prompt_version}</span> : null}
                  {cls.confidence != null ? (
                    <span className="text-[10px]">{typeof cls.confidence === "number" ? cls.confidence.toFixed(2) : String(cls.confidence)}</span>
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">{cls.labels.join(", ") || "(no labels)"}</p>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-[10px] text-emerald-100">
                  {JSON.stringify(cls.output ?? {}, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel eyebrow="Structured" title="Normalised fields (JSON)">
        <pre className="max-h-64 overflow-auto rounded border border-[var(--panel-border)] bg-white p-2 text-[10px]">
          {JSON.stringify(data.record, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}

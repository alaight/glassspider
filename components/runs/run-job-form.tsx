"use client";

import { useMemo, useState } from "react";

import { startSourceRun } from "@/app/actions/console";
import { ConsoleButton } from "@/components/ui/button-group";
import type { Source } from "@/lib/types";

type RunJobFormProps = {
  sources: Source[];
  defaultSourceId?: string;
  defaultRunType: "crawl" | "scrape" | "classify";
};

function isDeclaredApiSource(source: Source | null) {
  if (!source) return false;
  if (source.fetch_mode === "declared_api") return true;
  const config = source.fetch_config;
  const declaredApi = config?.declared_api;
  if (declaredApi && typeof declaredApi === "object" && typeof declaredApi.endpoint === "string" && declaredApi.endpoint.trim()) {
    return true;
  }
  const legacyApi = config?.api;
  return !!(legacyApi && typeof legacyApi === "object" && typeof legacyApi.endpoint === "string" && legacyApi.endpoint.trim());
}

export function RunJobForm({ sources, defaultSourceId, defaultRunType }: RunJobFormProps) {
  const [sourceId, setSourceId] = useState(defaultSourceId ?? sources[0]?.id ?? "");
  const [runType, setRunType] = useState<"crawl" | "scrape" | "classify">(defaultRunType);
  const selectedSource = useMemo(() => sources.find((source) => source.id === sourceId) ?? null, [sourceId, sources]);
  const declaredApi = useMemo(() => {
    if (!selectedSource) return null;
    const configured = selectedSource.fetch_config?.declared_api;
    if (configured && typeof configured === "object" && !Array.isArray(configured)) return configured;
    const legacy = selectedSource.fetch_config?.api;
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) return legacy;
    return null;
  }, [selectedSource]);
  const declaredApiMapping =
    declaredApi && typeof (declaredApi as Record<string, unknown>).field_mapping === "object"
      ? ((declaredApi as Record<string, unknown>).field_mapping as Record<string, unknown>)
      : {};
  const mapping =
    selectedSource?.extraction_mapping && typeof selectedSource.extraction_mapping === "object"
      ? selectedSource.extraction_mapping
      : declaredApiMapping;
  const mappingSummary = Object.keys(mapping ?? {}).slice(0, 8);
  const estimatedRecords =
    selectedSource?.discovery_metadata && typeof selectedSource.discovery_metadata === "object"
      ? (selectedSource.discovery_metadata.estimated_records as number | string | undefined)
      : undefined;
  const isApiSource = isDeclaredApiSource(selectedSource);
  const showApiPanel = runType === "scrape" && isApiSource;
  const showCrawlSettings = runType === "crawl";
  const showScrapeFilter = runType === "scrape" && !isApiSource;
  const showClassifierSettings = runType === "classify";

  return (
    <form action={startSourceRun} className="space-y-3 text-xs">
      <label className="block font-medium">
        Source
        <select
          name="source_id"
          required
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5"
        >
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block font-medium">
        Job type
        <select
          name="run_type"
          value={runType}
          onChange={(event) => setRunType(event.target.value as "crawl" | "scrape" | "classify")}
          className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5"
        >
          <option value="crawl">Crawl • discover URLs</option>
          <option value="scrape">Extract • hydrate records</option>
          <option value="classify">Classify • labelling</option>
        </select>
      </label>

      {showApiPanel ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <p className="font-semibold text-emerald-900">Direct API extraction</p>
          <p className="mt-1 text-[11px] text-emerald-900">
            This source uses a configured API endpoint, so no URL map or URL type filter is required.
          </p>
          <div className="mt-2 space-y-1 text-[11px] text-emerald-900">
            <p>
              Endpoint: <span className="font-mono">{typeof declaredApi?.endpoint === "string" ? declaredApi.endpoint : "Not configured"}</span>
            </p>
            <p>Method: {typeof declaredApi?.method === "string" ? declaredApi.method : "GET"}</p>
            <p>Estimated records: {estimatedRecords != null ? String(estimatedRecords) : "n/a"}</p>
            <p>Mapping: {mappingSummary.length > 0 ? mappingSummary.join(", ") : "No mapping configured yet."}</p>
          </div>
        </div>
      ) : null}

      {showCrawlSettings ? (
        <label className="block font-medium">
          Crawl max pages
          <input name="max_pages" defaultValue={25} type="number" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
        </label>
      ) : null}

      {showScrapeFilter ? (
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
      ) : null}

      {showClassifierSettings ? (
        <label className="block font-medium">
          Classifier review filter
          <select name="review_status" defaultValue="pending" className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5">
            <option value="pending">pending</option>
            <option value="needs_review">needs_review</option>
          </select>
        </label>
      ) : null}

      <ConsoleButton variant="primary" type="submit" className="w-full" disabled={sources.length === 0}>
        Enqueue job
      </ConsoleButton>

      {sources.length === 0 ? <p className="text-[11px] text-[var(--muted)]">Add a source first.</p> : null}
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { ButtonGroup, ConsoleButton } from "@/components/ui/button-group";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type ExploreResponse = {
  ok?: boolean;
  mode: "static_html" | "rendered_html" | "discovered_api" | "declared_api";
  requestedUrl: string;
  resolvedUrl: string;
  statusCode: number;
  title: string | null;
  links: Array<{ href: string; absoluteUrl: string; label: string }>;
  grouped: Array<{ pattern: string; items: Array<{ href: string; absoluteUrl: string; label: string }> }>;
  sanitisedHtml: string;
  initialLinks?: Array<{ href: string; absoluteUrl: string; label: string }>;
  renderedLinks?: Array<{ href: string; absoluteUrl: string; label: string }>;
  diagnostics?: {
    workerConnectionStatus?: string;
    workerEndpoint?: string;
    renderedConfigSent?: Record<string, unknown>;
    buttonsDetected?: string[];
    contentType?: string | null;
    detectedRequests?: Array<Record<string, unknown>>;
    jsonEndpoints?: Array<Record<string, unknown>>;
    endpointCandidates?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
    renderedTextPreview?: string;
    renderedHtmlLength?: number;
    warnings?: string[];
    staticBaseline?: {
      resolvedUrl: string;
      statusCode: number;
      title: string | null;
      linksCount: number;
    } | null;
  };
};

export function ExploreWorkspace() {
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [mode, setMode] = useState<"static_html" | "rendered_html" | "discovered_api" | "declared_api">("static_html");
  const defaultRenderedPreset = `{
  "steps": [
    {
      "type": "wait_for_timeout",
      "milliseconds": 2000
    },
    {
      "type": "click",
      "selector": "button:has-text('Apply filters')",
      "timeout_ms": 8000,
      "optional": true
    },
    {
      "type": "wait_for_timeout",
      "milliseconds": 5000
    }
  ],
  "capture_buttons": true,
  "capture_network": true,
  "capture_anchors": true,
  "wait_until": "domcontentloaded"
}`;
  const [sourceConfigJson, setSourceConfigJson] = useState(defaultRenderedPreset);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExploreResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const previewSrcDoc = result?.sanitisedHtml ?? "";
  const grouping = useMemo(() => result?.grouped ?? [], [result?.grouped]);

  const handleFetch = useCallback(() => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        let sourceConfig: Record<string, unknown> | undefined;
        if (sourceConfigJson.trim()) {
          const parsed = JSON.parse(sourceConfigJson) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            setError("Source config must be a JSON object.");
            return;
          }
          sourceConfig = parsed as Record<string, unknown>;
        }

        const response = await fetch("/api/explore/fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, mode, sourceConfig }),
        });
        const payload = await response.json();

        if (!response.ok || payload?.ok === false) {
          const stage = payload?.workerPayload?.stage ?? payload?.stage;
          const elapsedMs = payload?.workerPayload?.elapsed_ms ?? payload?.elapsed_ms ?? payload?.workerPayload?.partial?.elapsed_ms;
          const details = [stage ? `stage=${stage}` : null, elapsedMs ? `elapsed=${elapsedMs}ms` : null].filter(Boolean).join(" · ");
          setError(`${payload?.error ?? "Request failed."}${details ? ` (${details})` : ""}`);
          setResult(null);
          return;
        }

        setResult(payload as ExploreResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
        setResult(null);
      }
    });
  }, [mode, sourceConfigJson, url]);

  const applyBayerPreset = useCallback(() => {
    setMode("rendered_html");
    setSourceConfigJson(defaultRenderedPreset);
  }, [defaultRenderedPreset]);

  const saveCandidateAsDeclaredApi = useCallback(
    (candidate: Record<string, unknown>) => {
      const endpoint = String(candidate.endpoint_url ?? "");
      const method = String(candidate.method ?? "GET").toUpperCase();
      const suggestedMappingRaw = candidate.suggested_mapping;
      const suggestedMapping =
        suggestedMappingRaw && typeof suggestedMappingRaw === "object" && !Array.isArray(suggestedMappingRaw)
          ? (suggestedMappingRaw as Record<string, unknown>)
          : {};
      const prefillConfig = {
        declared_api: {
          endpoint,
          method,
          record_selector: String(suggestedMapping.record_selector ?? "$[*]"),
          field_mapping:
            suggestedMapping.fields && typeof suggestedMapping.fields === "object" && !Array.isArray(suggestedMapping.fields)
              ? suggestedMapping.fields
              : {},
          url_fields:
            suggestedMapping.url_fields && typeof suggestedMapping.url_fields === "object" && !Array.isArray(suggestedMapping.url_fields)
              ? suggestedMapping.url_fields
              : {},
        },
      };

      const params = new URLSearchParams({
        prefillUrl: result?.resolvedUrl ?? url,
        prefillFetchMode: "declared_api",
        prefillFetchConfig: JSON.stringify(prefillConfig, null, 2),
      });
      router.push(`/sources?${params.toString()}`);
    },
    [result?.resolvedUrl, router, url],
  );

  function suggestPattern(kind: "listing" | "detail") {
    if (!result?.resolvedUrl) {
      return "";
    }

    try {
      const target = new URL(result.resolvedUrl);
      const trimmed = target.pathname.replace(/\/+$/, "");

      if (kind === "listing") {
        const parts = trimmed.split("/").filter(Boolean);
        const prefix = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : trimmed || "/";
        return `^${prefix}/.+`;
      }

      return `^${trimmed}(?:/)?$`;
    } catch {
      return ".+";
    }
  }

  function pushSourceDraft() {
    const target = result?.resolvedUrl ?? url;
    const params = new URLSearchParams({ prefillUrl: target });

    if (result?.title) {
      params.set("prefillTitle", result.title);
    }

    router.push(`/sources?${params.toString()}`);
  }

  function pushRule(kind: "listing" | "detail") {
    const pattern = suggestPattern(kind);
    const params = new URLSearchParams({
      suggestRuleType: kind === "listing" ? "listing" : "detail",
      suggestPattern: pattern,
    });

    router.push(`/sources?${params.toString()}`);
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Panel
        eyebrow="Input"
        title="Explore URL"
        actions={
          <ButtonGroup>
            <ConsoleButton variant="secondary" type="button" onClick={applyBayerPreset}>
              Bayer preset
            </ConsoleButton>
            <ConsoleButton variant="primary" type="button" disabled={pending} onClick={() => void handleFetch()}>
              {pending ? "Fetching…" : "Fetch page"}
            </ConsoleButton>
          </ButtonGroup>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[280px] flex-1 text-xs font-medium">
            URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-3 py-2 font-mono text-sm"
              placeholder="https://example.com/path"
              spellCheck={false}
            />
          </label>
          <label className="w-[220px] text-xs font-medium">
            Fetch mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "static_html" | "rendered_html" | "discovered_api" | "declared_api")}
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="static_html">static_html</option>
              <option value="rendered_html">rendered_html (Playwright)</option>
              <option value="discovered_api">discovered_api (capture likely JSON endpoints)</option>
              <option value="declared_api">declared_api (configured API endpoint)</option>
            </select>
          </label>
          <label className="w-full text-xs font-medium">
            Optional source config JSON
            <textarea
              value={sourceConfigJson}
              onChange={(event) => setSourceConfigJson(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-3 py-2 font-mono text-[11px]"
              placeholder='{"rendered":{"wait_until":"networkidle","steps":[{"type":"click","selector":"button:has-text(\"Apply filters\")"},{"type":"wait_for_selector","selector":".product-card"}]}}'
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
        {result ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            {result.mode.toUpperCase()} · Resolved <span className="font-mono">{result.resolvedUrl}</span> · HTTP {result.statusCode}
            {result.title ? (
              <>
                {" "}
                · <span className="text-slate-800">{result.title}</span>
              </>
            ) : null}
          </p>
        ) : null}
        {result ? (
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Initial anchors: {result.initialLinks?.length ?? result.links.length} · Rendered/API anchors: {result.renderedLinks?.length ?? result.links.length} ·
            network requests: {result.diagnostics?.detectedRequests?.length ?? 0}
          </p>
        ) : null}
      </Panel>

      {result ? (
        <Panel
          eyebrow="Actions"
          title="Use this page"
          actions={
            <ButtonGroup>
              <ConsoleButton variant="secondary" type="button" onClick={pushSourceDraft}>
                Save as source
              </ConsoleButton>
              <ConsoleButton variant="secondary" type="button" onClick={() => pushRule("listing")}>
                Mark as listing page
              </ConsoleButton>
              <ConsoleButton variant="secondary" type="button" onClick={() => pushRule("detail")}>
                Mark as detail page
              </ConsoleButton>
            </ButtonGroup>
          }
        >
          <p className="text-xs text-[var(--muted)]">
            Opens <Link href="/sources">Sources</Link> with pre-filled fields or a suggested crawler rule pattern.
          </p>
        </Panel>
      ) : null}

      {result ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel title="Static fetch result" eyebrow="Baseline preview" className="min-h-[420px] overflow-hidden">
            <iframe
              title="Page preview"
              sandbox=""
              srcDoc={previewSrcDoc}
              className="h-[560px] w-full border border-[var(--panel-border)] bg-white"
            />
          </Panel>

          <Panel title="Rendered fetch result" eyebrow={`${result.links.length} rendered anchors`}>
            <div className="flex max-h-[560px] flex-col gap-4 overflow-y-auto pr-1">
              {grouping.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">No http(s) anchor links found.</p>
              ) : (
                grouping.map((group) => (
                  <section key={group.pattern} className="rounded border border-slate-100 bg-slate-50/60">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                      <StatusBadge tone="neutral">{group.pattern}</StatusBadge>
                      <span className="text-[10px] uppercase text-[var(--muted)]">{group.items.length}</span>
                    </header>
                    <ul className="max-h-60 space-y-1 overflow-y-auto p-2 text-xs">
                      {group.items.map((item) => (
                        <li key={item.absoluteUrl} className="break-all">
                          <a className="text-[var(--accent)] underline-offset-2 hover:underline" href={item.absoluteUrl}>
                            {item.label}
                          </a>
                          <div className="font-mono text-[10px] text-[var(--muted)]">{item.absoluteUrl}</div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </Panel>
        </div>
      ) : null}

      {result ? (
        <Panel title="Diagnostics" eyebrow="Worker + rendered telemetry">
          <div className="space-y-3 text-xs">
            <p className="text-[var(--muted)]">
              Worker status: {result.diagnostics?.workerConnectionStatus ?? (result.mode === "static_html" ? "n/a" : "unknown")} · Content type:{" "}
              {result.diagnostics?.contentType ?? "n/a"} · Requests captured: {result.diagnostics?.detectedRequests?.length ?? 0} · JSON endpoint candidates:{" "}
              {(result.diagnostics?.endpointCandidates?.length ?? result.diagnostics?.jsonEndpoints?.length) ?? 0} · Rendered HTML bytes:{" "}
              {result.diagnostics?.renderedHtmlLength ?? 0}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              Guardrails: only use public, unauthenticated endpoints; do not bypass login, paywalls, or anti-bot controls.
            </p>
            {result.diagnostics?.workerEndpoint ? (
              <p className="text-[var(--muted)]">
                Worker endpoint: <span className="font-mono">{result.diagnostics.workerEndpoint}</span>
              </p>
            ) : null}
            {result.diagnostics?.staticBaseline ? (
              <p className="text-[var(--muted)]">
                Static baseline: HTTP {result.diagnostics.staticBaseline.statusCode} · {result.diagnostics.staticBaseline.linksCount} links from{" "}
                <span className="font-mono">{result.diagnostics.staticBaseline.resolvedUrl}</span>
              </p>
            ) : null}
            <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
              <p className="mb-1 font-semibold text-slate-800">Rendered fetch config sent</p>
              <pre className="max-h-52 overflow-auto text-[10px] text-slate-700">
                {JSON.stringify(result.diagnostics?.renderedConfigSent ?? {}, null, 2)}
              </pre>
            </div>
            {result.diagnostics?.buttonsDetected?.length ? (
              <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                <p className="mb-1 font-semibold text-slate-800">Buttons detected</p>
                <pre className="max-h-52 overflow-auto text-[10px] text-slate-700">
                  {JSON.stringify(result.diagnostics.buttonsDetected.slice(0, 120), null, 2)}
                </pre>
              </div>
            ) : null}
            {result.diagnostics?.warnings?.length ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-2">
                <p className="mb-1 font-semibold text-amber-900">Warnings</p>
                <pre className="max-h-52 overflow-auto text-[10px] text-amber-900">
                  {JSON.stringify(result.diagnostics.warnings, null, 2)}
                </pre>
              </div>
            ) : null}
            {(result.diagnostics?.endpointCandidates ?? result.diagnostics?.jsonEndpoints)?.length ? (
              <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                <p className="mb-1 font-semibold text-slate-800">JSON endpoint candidates</p>
                <div className="space-y-2">
                  {(result.diagnostics?.endpointCandidates ?? result.diagnostics?.jsonEndpoints ?? []).slice(0, 8).map((candidate, index) => {
                    const endpointUrl = String(candidate.endpoint_url ?? candidate.url ?? "");
                    const confidence = String(candidate.confidence ?? "unknown");
                    const score = candidate.confidence_score;
                    const profile = candidate.structure_profile;
                    const mapping = candidate.suggested_mapping;
                    return (
                      <div key={`${endpointUrl}-${index}`} className="rounded border border-slate-200 bg-white p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="break-all font-mono text-[10px] text-slate-800">{endpointUrl}</p>
                          <span className="text-[10px] uppercase text-[var(--muted)]">
                            {confidence}
                            {typeof score === "number" ? ` (${score})` : ""}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--muted)]">
                          Method {String(candidate.method ?? "GET")} · HTTP {String(candidate.status ?? "n/a")} · Guess{" "}
                          {String(candidate.record_count_guess ?? "n/a")} records
                        </p>
                        {profile ? (
                          <pre className="mt-1 max-h-32 overflow-auto text-[10px] text-slate-700">{JSON.stringify(profile, null, 2)}</pre>
                        ) : null}
                        {mapping ? (
                          <pre className="mt-1 max-h-32 overflow-auto text-[10px] text-slate-700">{JSON.stringify(mapping, null, 2)}</pre>
                        ) : null}
                        <div className="mt-2">
                          <ConsoleButton variant="secondary" type="button" onClick={() => saveCandidateAsDeclaredApi(candidate)}>
                            Save as declared API source draft
                          </ConsoleButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {result.diagnostics?.detectedRequests?.length ? (
              <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                <p className="mb-1 font-semibold text-slate-800">Captured XHR/fetch requests</p>
                <pre className="max-h-52 overflow-auto text-[10px] text-slate-700">
                  {JSON.stringify(result.diagnostics.detectedRequests.slice(0, 20), null, 2)}
                </pre>
              </div>
            ) : null}
            {result.diagnostics?.renderedTextPreview ? (
              <div className="rounded border border-[var(--panel-border)] bg-white p-2">
                <p className="mb-1 font-semibold text-slate-800">Rendered text preview</p>
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap text-[11px] text-slate-700">{result.diagnostics.renderedTextPreview}</pre>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

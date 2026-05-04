"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { createDeclaredApiSourceDraft } from "@/app/actions/console";
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

type CandidateRecord = Record<string, unknown>;

function getEndpointUrl(candidate: CandidateRecord | null | undefined) {
  return String(candidate?.endpoint_url ?? candidate?.url ?? "");
}

function inferSourceName(result: ExploreResponse | null, candidate: CandidateRecord | null, fallbackUrl: string) {
  if (result?.title && result.title.trim().length >= 3) return result.title.trim();
  const endpointUrl = getEndpointUrl(candidate);
  try {
    const target = new URL(endpointUrl || result?.resolvedUrl || fallbackUrl);
    const host = target.hostname.replace(/^www\./, "");
    return `${host} API source`;
  } catch {
    return "API source draft";
  }
}

export function ExploreWorkspace() {
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [mode, setMode] = useState<"static_html" | "rendered_html" | "discovered_api" | "declared_api">("discovered_api");
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
  const [ignoredCandidateUrls, setIgnoredCandidateUrls] = useState<string[]>([]);
  const [activeCandidateUrl, setActiveCandidateUrl] = useState<string | null>(null);
  const [promotionCandidateUrl, setPromotionCandidateUrl] = useState<string | null>(null);
  const [sourceNameDraft, setSourceNameDraft] = useState("");
  const [sourcePageDraft, setSourcePageDraft] = useState("");
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const [savedDraftSourceId, setSavedDraftSourceId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savingDraft, startSavingDraft] = useTransition();

  const previewSrcDoc = result?.sanitisedHtml ?? "";
  const grouping = useMemo(() => result?.grouped ?? [], [result?.grouped]);
  const endpointCandidates = useMemo(() => {
    const list = result?.diagnostics?.endpointCandidates ?? result?.diagnostics?.jsonEndpoints ?? [];
    return list
      .filter((candidate) => typeof candidate === "object" && candidate !== null)
      .map((candidate) => candidate as Record<string, unknown>)
      .filter((candidate) => {
        const endpointUrl = String(candidate.endpoint_url ?? candidate.url ?? "");
        if (!endpointUrl) return false;
        return !ignoredCandidateUrls.includes(endpointUrl);
      });
  }, [ignoredCandidateUrls, result?.diagnostics?.endpointCandidates, result?.diagnostics?.jsonEndpoints]);
  const bestCandidate = endpointCandidates[0] ?? null;
  const selectedCandidate = endpointCandidates.find((candidate) => String(candidate.endpoint_url ?? candidate.url ?? "") === activeCandidateUrl) ?? bestCandidate;
  const promotionCandidate =
    endpointCandidates.find((candidate) => getEndpointUrl(candidate) === promotionCandidateUrl) ?? null;
  const selectedMappingPreview = useMemo(() => {
    if (!selectedCandidate) return null;
    const suggested = selectedCandidate.suggested_mapping;
    if (!suggested || typeof suggested !== "object" || Array.isArray(suggested)) return null;
    const fieldsRaw = (suggested as Record<string, unknown>).fields;
    const fields = fieldsRaw && typeof fieldsRaw === "object" && !Array.isArray(fieldsRaw) ? (fieldsRaw as Record<string, string>) : {};
    return {
      external_id: fields.external_id ?? null,
      title: fields.title ?? null,
      document_url: fields.document_url ?? fields.source_document_url ?? fields.primary_url ?? null,
      category: fields.category ?? null,
      record_type: fields.record_type ?? fields.document_type ?? null,
      published_date_raw: fields.published_date_raw ?? fields.published_date ?? null,
      image_url: fields.image_url ?? null,
      detail_url: fields.detail_url ?? null,
      raw_json: fields.raw_json ?? "$",
    };
  }, [selectedCandidate]);

  const handleFetch = useCallback(() => {
    setError(null);
    setResult(null);
    setIgnoredCandidateUrls([]);
    setActiveCandidateUrl(null);
    setPromotionCandidateUrl(null);
    setPromotionError(null);
    setSavedDraftSourceId(null);
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
    setUrl("https://cropscience.bayer.co.uk/our-products/document-store");
    setMode("discovered_api");
    setSourceConfigJson(defaultRenderedPreset);
  }, [defaultRenderedPreset]);

  const openUseEndpointModal = useCallback(
    (candidate: CandidateRecord) => {
      setPromotionError(null);
      setSavedDraftSourceId(null);
      setPromotionCandidateUrl(getEndpointUrl(candidate));
      setSourceNameDraft(inferSourceName(result, candidate, url));
      setSourcePageDraft(result?.resolvedUrl ?? url);
    },
    [result, url],
  );

  const closeUseEndpointModal = useCallback(() => {
    setPromotionCandidateUrl(null);
    setPromotionError(null);
  }, []);

  const saveSourceDraftFromCandidate = useCallback(
    (candidate: CandidateRecord) => {
      const endpointUrl = getEndpointUrl(candidate);
      if (!endpointUrl) {
        setPromotionError("Candidate endpoint URL is missing.");
        return;
      }
      startSavingDraft(async () => {
        try {
          setPromotionError(null);
          const mapping = (() => {
            const suggested = candidate.suggested_mapping;
            if (!suggested || typeof suggested !== "object" || Array.isArray(suggested)) return {};
            const fields = (suggested as Record<string, unknown>).fields;
            if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
            return fields as Record<string, string>;
          })();
          const urlFields = (() => {
            const suggested = candidate.suggested_mapping;
            if (!suggested || typeof suggested !== "object" || Array.isArray(suggested)) return {};
            const fields = (suggested as Record<string, unknown>).url_fields;
            if (!fields || typeof fields !== "object" || Array.isArray(fields)) return {};
            return fields as Record<string, Record<string, string>>;
          })();
          const recordSelector = (() => {
            const suggested = candidate.suggested_mapping;
            if (!suggested || typeof suggested !== "object" || Array.isArray(suggested)) return "$[*]";
            return String((suggested as Record<string, unknown>).record_selector ?? "$[*]");
          })();
          const structureProfile =
            candidate.structure_profile && typeof candidate.structure_profile === "object" && !Array.isArray(candidate.structure_profile)
              ? (candidate.structure_profile as Record<string, unknown>)
              : {};
          const confidenceScore = typeof candidate.confidence_score === "number" ? candidate.confidence_score : null;
          const detectedRecordCount = typeof candidate.record_count_guess === "number" ? candidate.record_count_guess : null;
          const method = String(candidate.method ?? "GET").toUpperCase() as "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
          const payload = await createDeclaredApiSourceDraft({
            sourceName: sourceNameDraft || inferSourceName(result, candidate, url),
            sourcePageUrl: sourcePageDraft || result?.resolvedUrl || url,
            endpointUrl,
            method,
            detectedRecordCount,
            candidateConfidence: confidenceScore,
            structureProfile,
            fieldMapping: mapping,
            urlFields,
            recordSelector,
            rawConfig: {
              declared_api: {
                endpoint: endpointUrl,
                method,
                record_selector: recordSelector,
                field_mapping: mapping,
                url_fields: urlFields,
              },
            },
          });
          if (!payload.ok) {
            setPromotionError(payload.error);
            return;
          }
          setSavedDraftSourceId(payload.sourceId);
        } catch (saveError) {
          setPromotionError(saveError instanceof Error ? saveError.message : "Failed to save source draft.");
        }
      });
    },
    [result, sourceNameDraft, sourcePageDraft, startSavingDraft, url],
  );

  function setStrategy(strategy: "quick" | "interactive" | "known_api") {
    if (strategy === "quick") {
      setMode("static_html");
      return;
    }
    if (strategy === "known_api") {
      setMode("declared_api");
      return;
    }
    setMode("discovered_api");
  }

  function ignoreCandidate(candidate: Record<string, unknown>) {
    const endpoint = String(candidate.endpoint_url ?? candidate.url ?? "");
    if (!endpoint) return;
    setIgnoredCandidateUrls((prev) => [...prev, endpoint]);
  }

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
        eyebrow="Discover"
        title="Start with a page URL"
        actions={
          <ButtonGroup>
            <ConsoleButton variant="secondary" type="button" onClick={applyBayerPreset}>
              Load example: Bayer document store
            </ConsoleButton>
            <ConsoleButton variant="primary" type="button" disabled={pending} onClick={() => void handleFetch()}>
              {pending ? "Scanning…" : "Run scan"}
            </ConsoleButton>
          </ButtonGroup>
        }
      >
        <div className="space-y-3">
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

          <div className="grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setStrategy("quick")}
              className={`rounded border p-3 text-left text-xs ${mode === "static_html" ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--panel-border)] bg-white"}`}
            >
              <p className="font-semibold">Quick scan</p>
              <p className={`${mode === "static_html" ? "text-slate-200" : "text-[var(--muted)]"}`}>
                Fetch initial HTML only. Best for simple static pages.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStrategy("interactive")}
              className={`rounded border p-3 text-left text-xs ${mode === "discovered_api" || mode === "rendered_html" ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--panel-border)] bg-white"}`}
            >
              <p className="font-semibold">Interactive scan</p>
              <p className={`${mode === "discovered_api" || mode === "rendered_html" ? "text-slate-200" : "text-[var(--muted)]"}`}>
                Run JavaScript, optional clicks, and detect hidden JSON/API sources.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setStrategy("known_api")}
              className={`rounded border p-3 text-left text-xs ${mode === "declared_api" ? "border-slate-900 bg-slate-900 text-white" : "border-[var(--panel-border)] bg-white"}`}
            >
              <p className="font-semibold">Known API</p>
              <p className={`${mode === "declared_api" ? "text-slate-200" : "text-[var(--muted)]"}`}>
                Use a known JSON/API endpoint directly.
              </p>
            </button>
          </div>

          <details className="rounded border border-dashed border-[var(--panel-border)] bg-slate-50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold text-slate-800">Advanced interaction steps</summary>
            <p className="mt-2 text-[var(--muted)]">
              Use this only when the page needs clicks, waits, filters, or form input before data appears.
            </p>
            <textarea
              value={sourceConfigJson}
              onChange={(event) => setSourceConfigJson(event.target.value)}
              rows={6}
              className="mt-2 w-full rounded border border-[var(--panel-border)] bg-white px-3 py-2 font-mono text-[11px]"
              placeholder='{"rendered":{"wait_until":"networkidle","steps":[{"type":"click","selector":"button:has-text(\"Apply filters\")"},{"type":"wait_for_selector","selector":".product-card"}]}}'
            />
          </details>
        </div>
        {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
        {result ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Scan mode <span className="font-semibold">{result.mode}</span> · Resolved <span className="font-mono">{result.resolvedUrl}</span> · HTTP {result.statusCode}
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
        <Panel eyebrow="Outcome" title={bestCandidate ? "Structured data source found" : "No structured API found yet"}>
          {bestCandidate ? (
            <div className="space-y-3 text-xs">
              <p className="text-slate-700">
                Glassspider detected a JSON endpoint that appears to power this page.
              </p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-[var(--muted)]">Endpoint</p>
                  <p className="break-all font-mono text-[11px]">{String(bestCandidate.endpoint_url ?? bestCandidate.url ?? "—")}</p>
                </div>
                <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-[var(--muted)]">Confidence</p>
                  <p className="font-semibold">
                    {String(bestCandidate.confidence ?? "unknown")}{" "}
                    {typeof bestCandidate.confidence_score === "number" ? `(${bestCandidate.confidence_score})` : ""}
                  </p>
                </div>
                <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-[var(--muted)]">Estimated records</p>
                  <p className="font-semibold">{String(bestCandidate.record_count_guess ?? "n/a")}</p>
                </div>
              </div>
              <ButtonGroup>
                <ConsoleButton variant="primary" type="button" onClick={() => setActiveCandidateUrl(String(bestCandidate.endpoint_url ?? bestCandidate.url ?? ""))}>
                  Preview data
                </ConsoleButton>
                <ConsoleButton variant="secondary" type="button" onClick={() => openUseEndpointModal(bestCandidate)}>
                  Use this data source
                </ConsoleButton>
                <ConsoleButton variant="secondary" type="button" onClick={() => openUseEndpointModal(bestCandidate)}>
                  Save as source draft
                </ConsoleButton>
              </ButtonGroup>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-700">
              {mode === "discovered_api" && (result.diagnostics?.detectedRequests?.length ?? 0) === 0 ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-2">
                  Nothing new was discovered because no interaction was run. Try Interactive scan with click/wait steps to trigger data loading.
                </p>
              ) : null}
              <p>We did not detect a useful JSON/API endpoint during this scan.</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Try Interactive scan if you used Quick scan.</li>
                <li>Add a click step if results appear after pressing a button.</li>
                <li>Add a wait step if content loads slowly.</li>
                <li>If content is visible in the page itself, continue with HTML extraction.</li>
              </ul>
            </div>
          )}
        </Panel>
      ) : null}

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
        <Panel title="Detected data sources" eyebrow={`${endpointCandidates.length} candidate endpoints`}>
          {endpointCandidates.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">No API candidates yet.</p>
          ) : (
            <div className="space-y-3">
              {endpointCandidates.slice(0, 8).map((candidate, index) => {
                const endpointUrl = String(candidate.endpoint_url ?? candidate.url ?? "");
                const confidence = String(candidate.confidence ?? "unknown");
                const score = candidate.confidence_score;
                const profile = candidate.structure_profile as Record<string, unknown> | undefined;
                const guessedFields = profile?.guessed_fields as Record<string, string> | undefined;
                return (
                  <div key={`${endpointUrl}-${index}`} className="rounded border border-[var(--panel-border)] bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-mono text-[11px] text-slate-900">{endpointUrl}</p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          Method {String(candidate.method ?? "GET")} · Content type {String(candidate.content_type ?? "n/a")} · HTTP{" "}
                          {String(candidate.status ?? "n/a")}
                        </p>
                      </div>
                      <StatusBadge tone={confidence === "high" ? "active" : confidence === "medium" ? "neutral" : "bad"}>
                        {confidence}
                        {typeof score === "number" ? ` (${score})` : ""}
                      </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-slate-700">
                      Estimated records: {String(candidate.record_count_guess ?? "n/a")} · Root type:{" "}
                      {String((profile?.root_type as string | undefined) ?? "unknown")}
                    </p>
                    {guessedFields ? (
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        Suggested fields:{" "}
                        {Object.entries(guessedFields)
                          .slice(0, 6)
                          .map(([key, value]) => `${key} ← ${value}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ConsoleButton variant="secondary" type="button" onClick={() => setActiveCandidateUrl(endpointUrl)}>
                        Preview data
                      </ConsoleButton>
                      <ConsoleButton variant="secondary" type="button" onClick={() => openUseEndpointModal(candidate)}>
                        Use this endpoint
                      </ConsoleButton>
                      <ConsoleButton variant="secondary" type="button" onClick={() => openUseEndpointModal(candidate)}>
                        Save as declared API source draft
                      </ConsoleButton>
                      <ConsoleButton variant="ghost" type="button" onClick={() => ignoreCandidate(candidate)}>
                        Ignore
                      </ConsoleButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      ) : null}

      {result && selectedCandidate ? (
        <Panel title="Data preview" eyebrow="JSON structure profiler">
          <div className="space-y-3 text-xs">
            <p className="text-slate-700">
              Endpoint <span className="font-mono">{String(selectedCandidate.endpoint_url ?? selectedCandidate.url ?? "n/a")}</span>
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                <p className="text-[10px] uppercase text-[var(--muted)]">Structure profile</p>
                <div className="mt-1 space-y-1 text-[11px] text-slate-700">
                  <p>Root type: {String((selectedCandidate.structure_profile as Record<string, unknown> | undefined)?.root_type ?? "unknown")}</p>
                  <p>Estimated records: {String(selectedCandidate.record_count_guess ?? "n/a")}</p>
                  <p>
                    Common fields:{" "}
                    {Array.isArray((selectedCandidate.structure_profile as Record<string, unknown> | undefined)?.common_keys)
                      ? ((selectedCandidate.structure_profile as Record<string, unknown>).common_keys as string[]).slice(0, 10).join(", ")
                      : "n/a"}
                  </p>
                  <p>
                    Nested fields:{" "}
                    {Array.isArray((selectedCandidate.structure_profile as Record<string, unknown> | undefined)?.nested_keys)
                      ? ((selectedCandidate.structure_profile as Record<string, unknown>).nested_keys as string[]).slice(0, 12).join(", ")
                      : "n/a"}
                  </p>
                  <p>
                    Likely fields:{" "}
                    {JSON.stringify(
                      ((selectedCandidate.structure_profile as Record<string, unknown> | undefined)?.likely_fields as Record<string, unknown> | undefined) ?? {},
                    )}
                  </p>
                </div>
                <pre className="mt-2 max-h-44 overflow-auto text-[10px] text-slate-700">
                  {JSON.stringify(
                    ((selectedCandidate.structure_profile as Record<string, unknown> | undefined)?.sample_records as unknown[] | undefined)?.slice(0, 5) ?? [],
                    null,
                    2,
                  )}
                </pre>
              </div>
              <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                <p className="text-[10px] uppercase text-[var(--muted)]">Mapping preview</p>
                <pre className="mt-1 max-h-56 overflow-auto text-[10px] text-slate-700">
                  {JSON.stringify(selectedMappingPreview ?? {}, null, 2)}
                </pre>
                <div className="mt-2">
                  <ConsoleButton variant="secondary" type="button" onClick={() => openUseEndpointModal(selectedCandidate)}>
                    Use this mapping
                  </ConsoleButton>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {result ? (
        <details className="rounded border border-[var(--panel-border)] bg-white">
          <summary className="cursor-pointer list-none border-b border-[var(--panel-border)] px-4 py-3 text-sm font-semibold text-slate-800">
            Technical details
          </summary>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <Panel title="Static fetch result" eyebrow="Baseline preview" className="min-h-[420px] overflow-hidden">
                <iframe
                  title="Page preview"
                  sandbox=""
                  srcDoc={previewSrcDoc}
                  className="h-[560px] w-full border border-[var(--panel-border)] bg-white"
                />
              </Panel>

              <Panel title="Rendered anchors" eyebrow={`${result.links.length} links`}>
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
                {result.diagnostics?.renderedConfigSent ? (
                  <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                    <p className="mb-1 font-semibold text-slate-800">Rendered fetch config sent</p>
                    <pre className="max-h-52 overflow-auto text-[10px] text-slate-700">
                      {JSON.stringify(result.diagnostics.renderedConfigSent ?? {}, null, 2)}
                    </pre>
                  </div>
                ) : null}
                {result.diagnostics?.detectedRequests?.length ? (
                  <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                    <p className="mb-1 font-semibold text-slate-800">Other network requests</p>
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
          </div>
        </details>
      ) : null}

      {promotionCandidate ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded border border-[var(--panel-border)] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--panel-border)] px-4 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-[var(--muted)]">Use this endpoint</p>
                <h3 className="text-sm font-semibold text-slate-900">Create declared API source draft</h3>
              </div>
              <ConsoleButton variant="ghost" type="button" onClick={closeUseEndpointModal}>
                Close
              </ConsoleButton>
            </div>
            <div className="space-y-3 p-4 text-xs">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="font-medium">
                  Source name
                  <input
                    value={sourceNameDraft}
                    onChange={(event) => setSourceNameDraft(event.target.value)}
                    className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5"
                  />
                </label>
                <label className="font-medium">
                  Source page URL
                  <input
                    value={sourcePageDraft}
                    onChange={(event) => setSourcePageDraft(event.target.value)}
                    className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5 font-mono text-[11px]"
                  />
                </label>
                <label className="font-medium">
                  Endpoint URL
                  <input
                    value={getEndpointUrl(promotionCandidate)}
                    readOnly
                    className="mt-1 w-full rounded border border-[var(--panel-border)] bg-slate-50 px-2 py-1.5 font-mono text-[11px]"
                  />
                </label>
                <label className="font-medium">
                  Method
                  <input
                    value={String(promotionCandidate.method ?? "GET").toUpperCase()}
                    readOnly
                    className="mt-1 w-full rounded border border-[var(--panel-border)] bg-slate-50 px-2 py-1.5"
                  />
                </label>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-[var(--muted)]">Detected record count</p>
                  <p className="font-semibold">{String(promotionCandidate.record_count_guess ?? "n/a")}</p>
                </div>
                <div className="rounded border border-[var(--panel-border)] bg-slate-50 p-2">
                  <p className="text-[10px] uppercase text-[var(--muted)]">Suggested field mapping</p>
                  <pre className="mt-1 max-h-40 overflow-auto text-[10px] text-slate-700">
                    {JSON.stringify(
                      (() => {
                        const suggested = promotionCandidate.suggested_mapping;
                        if (!suggested || typeof suggested !== "object" || Array.isArray(suggested)) return {};
                        const fields = (suggested as Record<string, unknown>).fields;
                        return fields && typeof fields === "object" && !Array.isArray(fields) ? fields : {};
                      })(),
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>

              <details className="rounded border border-dashed border-[var(--panel-border)] bg-slate-50 px-3 py-2">
                <summary className="cursor-pointer font-semibold text-slate-800">Advanced raw JSON config</summary>
                <pre className="mt-2 max-h-56 overflow-auto text-[10px] text-slate-700">
                  {JSON.stringify(
                    {
                      declared_api: {
                        endpoint: getEndpointUrl(promotionCandidate),
                        method: String(promotionCandidate.method ?? "GET").toUpperCase(),
                        record_selector:
                          (promotionCandidate.suggested_mapping as Record<string, unknown> | undefined)?.record_selector ?? "$[*]",
                        field_mapping:
                          ((promotionCandidate.suggested_mapping as Record<string, unknown> | undefined)?.fields as Record<string, string> | undefined) ??
                          {},
                        url_fields:
                          ((promotionCandidate.suggested_mapping as Record<string, unknown> | undefined)?.url_fields as Record<string, unknown> | undefined) ??
                          {},
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>

              {promotionError ? <p className="text-xs text-red-700">{promotionError}</p> : null}
              {savedDraftSourceId ? (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
                  <p className="font-semibold text-emerald-900">Source saved. Ready to test extraction.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link href={`/runs?source=${savedDraftSourceId}&run_type=scrape`} className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-900">
                      Test extraction
                    </Link>
                    <Link href={`/sources/${savedDraftSourceId}`} className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-900">
                      Go to Sources
                    </Link>
                    <Link href={`/runs?source=${savedDraftSourceId}&run_type=scrape`} className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-900">
                      Run extraction
                    </Link>
                  </div>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <ConsoleButton variant="ghost" type="button" onClick={closeUseEndpointModal}>
                  Cancel
                </ConsoleButton>
                <ConsoleButton
                  variant="primary"
                  type="button"
                  disabled={savingDraft}
                  onClick={() => saveSourceDraftFromCandidate(promotionCandidate)}
                >
                  {savingDraft ? "Saving…" : "Save source draft"}
                </ConsoleButton>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

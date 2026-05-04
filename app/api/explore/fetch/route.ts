import { NextResponse } from "next/server";
import { z } from "zod";

import { hydrateEndpointCandidate, scoreEndpointCandidate, type EndpointCandidate } from "@/lib/explore-endpoints";
import { getProductAccess } from "@/lib/auth";
import { extractHtmlTitle, extractLinksFromHtml, groupLinksByOriginPath, stripScriptsForIframe } from "@/lib/explore-parse";
import { ADMIN_ROLES } from "@/lib/product";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validatePublicFetchUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().min(4),
  mode: z.enum(["static_html", "rendered_html", "discovered_api", "declared_api"]).default("static_html"),
  sourceConfig: z.record(z.string(), z.unknown()).optional(),
  includeStaticBaseline: z.boolean().optional(),
  sourceId: z.string().uuid().optional(),
  persistCandidates: z.boolean().optional(),
});

class ExploreConfigurationError extends Error {}

type ExploreHtmlResult = {
  requestedUrl: string;
  resolvedUrl: string;
  statusCode: number;
  title: string | null;
  links: Array<{ href: string; absoluteUrl: string; label: string }>;
  grouped: Array<{ pattern: string; items: Array<{ href: string; absoluteUrl: string; label: string }> }>;
  sanitisedHtml: string;
  textPreview: string;
};

async function fetchStaticHtml(target: URL): Promise<ExploreHtmlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(target.href, {
      headers: {
        "user-agent": "GlassspiderExplore/1.0 (+https://glassspider)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(`Expected HTML; received ${contentType || "unknown content type"}.`);
    }

    const buffer = await response.arrayBuffer();
    const maxBytes = 2_000_000;
    if (buffer.byteLength > maxBytes) {
      throw new Error("Response too large (max 2MB).");
    }

    const html = new TextDecoder("utf-8").decode(buffer);
    const title = extractHtmlTitle(html);
    const links = extractLinksFromHtml(html, target.href);
    const grouped = [...groupLinksByOriginPath(links)].map(([pattern, items]) => ({ pattern, items }));
    const sanitisedHtml = stripScriptsForIframe(html).slice(0, 2_500_000);

    return {
      requestedUrl: target.href,
      resolvedUrl: response.url ?? target.href,
      statusCode: response.status,
      title,
      links,
      grouped,
      sanitisedHtml,
      textPreview: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5_000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRenderedViaWorker(url: string, sourceConfig: Record<string, unknown>) {
  const workerBaseUrl = process.env.GLASSSPIDER_WORKER_BASE_URL;
  const workerDebugToken = process.env.GLASSSPIDER_WORKER_DEBUG_TOKEN;

  if (!workerBaseUrl || !workerDebugToken) {
    throw new ExploreConfigurationError(
      "Rendered fetch is not configured. Missing GLASSSPIDER_WORKER_BASE_URL or GLASSSPIDER_WORKER_DEBUG_TOKEN.",
    );
  }

  const renderedConfig = (() => {
    const provided = sourceConfig.rendered;
    if (provided && typeof provided === "object" && !Array.isArray(provided)) {
      return provided as Record<string, unknown>;
    }
    return sourceConfig;
  })();

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  const endpoint = new URL("/debug/fetch-rendered", workerBaseUrl).toString();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${workerDebugToken}`,
      },
      body: JSON.stringify({
        url,
        rendered: renderedConfig,
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (payload?.ok === false) {
      return {
        ok: false,
        status: 502,
        error: payload?.error ?? "Worker rendered fetch failed.",
        endpoint,
        payload,
      } as const;
    }

    if (!response.ok) {
      const mappedError =
        response.status === 404
          ? "Worker reached, but rendered fetch endpoint was not found. Check that POST /debug/fetch-rendered is registered and the Fly worker was redeployed."
          : response.status === 401 || response.status === 403
            ? "Worker rejected the debug token. Check GLASSSPIDER_WORKER_DEBUG_TOKEN matches in Vercel and Fly."
            : response.status === 503
              ? "Worker debug token is not configured on Fly. Set GLASSSPIDER_WORKER_DEBUG_TOKEN and redeploy."
              : payload?.detail ?? payload?.error ?? "Worker debug fetch failed.";
      return {
        ok: false,
        status: response.status,
        error: mappedError,
        endpoint,
        payload,
      } as const;
    }

    return { ok: true, payload, endpoint } as const;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: "Request timed out.",
        endpoint,
        payload: { elapsed_ms: Date.now() - startedAt },
      } as const;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDeclaredApi(
  sourcePageUrl: string,
  sourceConfig: Record<string, unknown>,
): Promise<{
  candidate: EndpointCandidate;
  links: Array<{ href: string; absoluteUrl: string; label: string }>;
  textPreview: string;
}> {
  const declaredApiConfig = (() => {
    const candidate = sourceConfig.declared_api;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate as Record<string, unknown>;
    const legacy = sourceConfig.api;
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) return legacy as Record<string, unknown>;
    return {};
  })();

  const endpointRaw = String(declaredApiConfig.endpoint ?? sourcePageUrl);
  const endpointTarget = validatePublicFetchUrl(endpointRaw);
  const method = String(declaredApiConfig.method ?? "GET").toUpperCase();
  const headersRaw = declaredApiConfig.headers;
  const headers = headersRaw && typeof headersRaw === "object" && !Array.isArray(headersRaw) ? headersRaw : {};
  const payload = declaredApiConfig.payload;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(endpointTarget.href, {
      method,
      headers: {
        accept: "application/json,text/plain,*/*",
        ...(headers as Record<string, string>),
      },
      body: method === "GET" || method === "HEAD" ? undefined : payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type");
    const text = await response.text();
    const candidate = scoreEndpointCandidate({
      sourcePageUrl,
      endpointUrl: endpointTarget.href,
      method,
      status: response.status,
      contentType,
      requestPostData: payload ?? null,
      preview: text.slice(0, 1500),
    });
    return {
      candidate,
      links: [],
      textPreview: text.replace(/\s+/g, " ").trim().slice(0, 5_000),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function persistEndpointCandidates(sourceId: string | undefined, candidates: EndpointCandidate[]) {
  if (!candidates.length) return;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return;

  const rows = candidates.map((candidate) => ({
    source_id: sourceId ?? null,
    source_page_url: candidate.source_page_url,
    endpoint_url: candidate.endpoint_url,
    method: candidate.method,
    content_type: candidate.content_type,
    status_code: candidate.status,
    response_preview: candidate.preview,
    request_post_data: candidate.request_post_data,
    structure_profile: candidate.structure_profile,
    suggested_mapping: candidate.suggested_mapping,
    record_count_guess: candidate.record_count_guess,
    confidence_score: candidate.confidence_score,
    confidence_label: candidate.confidence,
    discovery_method: candidate.discovery_method,
    discovery_metadata: {
      rejection_reasons: candidate.rejection_reasons,
    },
  }));

  await supabase.from("glassspider_endpoint_candidates").upsert(rows, {
    onConflict: "source_page_url,endpoint_url,method",
  });
}

async function buildNetworkCandidates(sourcePageUrl: string, requests: Array<Record<string, unknown>>) {
  const initial = requests.map((request) =>
    scoreEndpointCandidate({
      sourcePageUrl,
      endpointUrl: String(request.url ?? ""),
      method: typeof request.method === "string" ? request.method : null,
      status: typeof request.status === "number" ? request.status : null,
      contentType: typeof request.content_type === "string" ? request.content_type : null,
      requestPostData: request.request_post_data ?? null,
      preview: typeof request.preview === "string" ? request.preview : null,
    }),
  );

  const filtered = initial
    .filter((candidate) => candidate.endpoint_url.startsWith("http://") || candidate.endpoint_url.startsWith("https://"))
    .sort((a, b) => b.confidence_score - a.confidence_score)
    .slice(0, 25);

  const topForHydration = filtered.slice(0, 4);
  const hydrated = await Promise.all(
    topForHydration.map((candidate) =>
      hydrateEndpointCandidate(candidate, {
        fetchJson: async ({ url, method, requestPostData }) => {
          const target = validatePublicFetchUrl(url);
          const response = await fetch(target.href, {
            method,
            headers: { accept: "application/json,text/plain,*/*" },
            body: method === "GET" || method === "HEAD" ? undefined : typeof requestPostData === "string" ? requestPostData : JSON.stringify(requestPostData),
          });
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.toLowerCase().includes("json")) {
            throw new Error("Not JSON");
          }
          return response.json();
        },
      }),
    ),
  );

  const byKey = new Map<string, EndpointCandidate>();
  for (const candidate of [...filtered, ...hydrated]) {
    byKey.set(`${candidate.method}:${candidate.endpoint_url}`, candidate);
  }
  return [...byKey.values()].sort((a, b) => b.confidence_score - a.confidence_score);
}

export async function POST(request: Request) {
  const access = await getProductAccess();

  if (access.status !== "granted" || !access.role || !ADMIN_ROLES.includes(access.role)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let target: URL;

  try {
    target = validatePublicFetchUrl(parsed.data.url);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Blocked URL." }, { status: 400 });
  }

  try {
    const mode = parsed.data.mode;
    const sourceConfig = parsed.data.sourceConfig ?? {};

    if (mode === "static_html") {
      const snapshot = await fetchStaticHtml(target);
      return NextResponse.json({
        mode,
        ...snapshot,
        initialLinks: snapshot.links,
        renderedLinks: snapshot.links,
        diagnostics: {
          contentType: "text/html",
          detectedRequests: [],
          jsonEndpoints: [],
          endpointCandidates: [],
          metadata: { fetch_mode: "static_html" },
          renderedTextPreview: snapshot.textPreview,
        },
      });
    }
    if (mode === "declared_api") {
      const apiPreview = await fetchDeclaredApi(target.href, sourceConfig);
      const endpointCandidates = [apiPreview.candidate];
      if (parsed.data.persistCandidates) {
        await persistEndpointCandidates(parsed.data.sourceId, endpointCandidates);
      }
      return NextResponse.json({
        ok: true,
        mode,
        requestedUrl: parsed.data.url,
        resolvedUrl: apiPreview.candidate.endpoint_url,
        statusCode: apiPreview.candidate.status ?? 0,
        title: null,
        links: [],
        grouped: [],
        sanitisedHtml: "",
        initialLinks: [],
        renderedLinks: [],
        diagnostics: {
          workerConnectionStatus: "n/a",
          contentType: apiPreview.candidate.content_type,
          detectedRequests: [],
          jsonEndpoints: endpointCandidates,
          endpointCandidates,
          metadata: { fetch_mode: "declared_api" },
          renderedTextPreview: apiPreview.textPreview,
        },
      });
    }

    const includeStaticBaseline = parsed.data.includeStaticBaseline ?? true;
    const baseline = includeStaticBaseline ? await fetchStaticHtml(target).catch(() => null) : null;
    const workerResult = await fetchRenderedViaWorker(target.href, sourceConfig);
    if (!workerResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: workerResult.error,
          workerStatus: "error",
          workerStatusCode: workerResult.status,
          workerEndpoint: workerResult.endpoint,
          workerPayload: workerResult.payload,
        },
        { status: workerResult.status },
      );
    }

    const workerPayload = workerResult.payload as {
      ok: boolean;
      requested_url: string;
      final_url: string;
      status_code: number | null;
      title: string | null;
      rendered_html_length: number;
      text_preview: string;
      anchors: Array<{ href: string; absoluteUrl: string; label: string }>;
      buttons_detected: string[];
      discovered_requests: Array<Record<string, unknown>>;
      json_endpoints: Array<Record<string, unknown>>;
      warnings: string[];
      metadata: Record<string, unknown>;
      config_echo: Record<string, unknown>;
    };
    const workerLinks = workerPayload.anchors ?? [];
    const endpointCandidates = await buildNetworkCandidates(target.href, workerPayload.discovered_requests ?? []);
    if (parsed.data.persistCandidates) {
      await persistEndpointCandidates(parsed.data.sourceId, endpointCandidates);
    }
    const grouped = [...groupLinksByOriginPath(workerLinks)].map(([pattern, items]) => ({ pattern, items }));

    return NextResponse.json({
      ok: true,
      mode,
      requestedUrl: parsed.data.url,
      resolvedUrl: workerPayload.final_url ?? baseline?.resolvedUrl ?? target.href,
      statusCode: workerPayload.status_code ?? baseline?.statusCode ?? 0,
      title: workerPayload.title ?? baseline?.title ?? null,
      links: workerLinks,
      grouped,
      sanitisedHtml: baseline?.sanitisedHtml ?? "",
      initialLinks: baseline?.links ?? [],
      renderedLinks: workerLinks,
      diagnostics: {
        workerConnectionStatus: "connected",
        workerEndpoint: workerResult.endpoint,
        renderedConfigSent: workerPayload.config_echo ?? sourceConfig,
        buttonsDetected: workerPayload.buttons_detected ?? [],
        contentType: "text/html",
        detectedRequests: workerPayload.discovered_requests ?? [],
        jsonEndpoints: endpointCandidates,
        endpointCandidates,
        metadata: workerPayload.metadata ?? {},
        warnings: workerPayload.warnings ?? [],
        renderedTextPreview: workerPayload.text_preview ?? "",
        renderedHtmlLength: workerPayload.rendered_html_length ?? 0,
        staticBaseline: baseline
          ? {
              resolvedUrl: baseline.resolvedUrl,
              statusCode: baseline.statusCode,
              title: baseline.title,
              linksCount: baseline.links.length,
            }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof ExploreConfigurationError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const message =
      error instanceof Error ? (error.name === "AbortError" ? "Request timed out." : error.message) : "Fetch failed.";

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

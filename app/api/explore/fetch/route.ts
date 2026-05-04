import { NextResponse } from "next/server";
import { z } from "zod";

import { getProductAccess } from "@/lib/auth";
import { extractHtmlTitle, extractLinksFromHtml, groupLinksByOriginPath, stripScriptsForIframe } from "@/lib/explore-parse";
import { ADMIN_ROLES } from "@/lib/product";
import { validatePublicFetchUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().min(4),
  mode: z.enum(["static", "rendered", "api"]).default("static"),
  sourceConfig: z.record(z.string(), z.unknown()).optional(),
  includeStaticBaseline: z.boolean().optional(),
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
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${workerBaseUrl.replace(/\/$/, "")}/debug/fetch-rendered`, {
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
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: payload?.detail ?? payload?.error ?? "Worker debug fetch failed.",
        payload,
      } as const;
    }

    return { ok: true, payload } as const;
  } finally {
    clearTimeout(timeout);
  }
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

    if (mode === "static") {
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
          metadata: { fetch_mode: "static" },
          renderedTextPreview: snapshot.textPreview,
        },
      });
    }

    if (mode === "api") {
      return NextResponse.json(
        {
          ok: false,
          error: "Explore API mode is not enabled yet in this proxy. Use static or rendered.",
        },
        { status: 400 },
      );
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
          workerPayload: workerResult.payload,
        },
        { status: workerResult.status === 401 ? 502 : workerResult.status === 403 ? 502 : 502 },
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
        renderedConfigSent: workerPayload.config_echo ?? sourceConfig,
        buttonsDetected: workerPayload.buttons_detected ?? [],
        contentType: "text/html",
        detectedRequests: workerPayload.discovered_requests ?? [],
        jsonEndpoints: workerPayload.json_endpoints ?? [],
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

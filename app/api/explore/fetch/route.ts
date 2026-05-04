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

async function fetchViaWorker(url: string, mode: "rendered" | "api", sourceConfig: Record<string, unknown>) {
  const workerUrl = process.env.GLASSSPIDER_WORKER_INTERNAL_URL;
  const workerSecret = process.env.GLASSSPIDER_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error("Rendered/API Explore requires worker debug fetch configuration.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${workerUrl.replace(/\/$/, "")}/debug/fetch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-glassspider-worker-secret": workerSecret,
      },
      body: JSON.stringify({
        url,
        mode,
        source_config: sourceConfig,
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.detail ?? payload?.error ?? "Worker debug fetch failed.");
    }

    return payload as {
      mode: string;
      requested_url: string;
      title: string | null;
      links: Array<{ href: string; absoluteUrl: string; label: string }>;
      json_endpoints: Array<Record<string, unknown>>;
      result: {
        final_url: string;
        status_code: number | null;
        html: string | null;
        text: string | null;
        content_type: string | null;
        discovered_requests: Array<Record<string, unknown>>;
        metadata: Record<string, unknown>;
      };
    };
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

    const includeStaticBaseline = parsed.data.includeStaticBaseline ?? true;
    const baseline = includeStaticBaseline ? await fetchStaticHtml(target).catch(() => null) : null;
    const workerPayload = await fetchViaWorker(target.href, mode, sourceConfig);
    const workerLinks = workerPayload.links ?? [];
    const grouped = [...groupLinksByOriginPath(workerLinks)].map(([pattern, items]) => ({ pattern, items }));

    const renderedHtml = workerPayload.result.html ?? "";
    const sanitisedHtml = renderedHtml ? stripScriptsForIframe(renderedHtml).slice(0, 2_500_000) : baseline?.sanitisedHtml ?? "";
    const title = workerPayload.title ?? extractHtmlTitle(renderedHtml) ?? baseline?.title ?? null;
    const resolvedUrl = workerPayload.result.final_url ?? baseline?.resolvedUrl ?? target.href;
    const textPreview =
      workerPayload.result.text?.slice(0, 5_000) ??
      renderedHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 5_000);

    return NextResponse.json({
      mode,
      requestedUrl: parsed.data.url,
      resolvedUrl,
      statusCode: workerPayload.result.status_code ?? baseline?.statusCode ?? 0,
      title,
      links: workerLinks,
      grouped,
      sanitisedHtml,
      initialLinks: baseline?.links ?? [],
      renderedLinks: workerLinks,
      diagnostics: {
        contentType: workerPayload.result.content_type,
        detectedRequests: workerPayload.result.discovered_requests ?? [],
        jsonEndpoints: workerPayload.json_endpoints ?? [],
        metadata: workerPayload.result.metadata ?? {},
        renderedTextPreview: textPreview,
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
    const message =
      error instanceof Error ? (error.name === "AbortError" ? "Request timed out." : error.message) : "Fetch failed.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

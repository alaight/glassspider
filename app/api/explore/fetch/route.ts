import { NextResponse } from "next/server";
import { z } from "zod";

import { getProductAccess } from "@/lib/auth";
import { extractHtmlTitle, extractLinksFromHtml, groupLinksByOriginPath, stripScriptsForIframe } from "@/lib/explore-parse";
import { ADMIN_ROLES } from "@/lib/product";
import { validatePublicFetchUrl } from "@/lib/url-safety";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().min(4),
});

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

    clearTimeout(timeout);

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("text/html")) {
      return NextResponse.json(
        {
          error: `Expected HTML; received ${contentType || "unknown content type"}.`,
        },
        { status: 415 },
      );
    }

    const buffer = await response.arrayBuffer();
    const maxBytes = 2_000_000;

    if (buffer.byteLength > maxBytes) {
      return NextResponse.json({ error: "Response too large (max 2MB)." }, { status: 413 });
    }

    const html = new TextDecoder("utf-8").decode(buffer);
    const title = extractHtmlTitle(html);
    const links = extractLinksFromHtml(html, target.href);
    const grouped = [...groupLinksByOriginPath(links)].map(([pattern, items]) => ({ pattern, items }));
    const sanitisedHtml = stripScriptsForIframe(html).slice(0, 2_500_000);

    return NextResponse.json({
      requestedUrl: parsed.data.url,
      resolvedUrl: response.url ?? target.href,
      statusCode: response.status,
      title,
      links,
      grouped,
      sanitisedHtml,
    });
  } catch (error) {
    clearTimeout(timeout);

    const message =
      error instanceof Error ? (error.name === "AbortError" ? "Request timed out." : error.message) : "Fetch failed.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

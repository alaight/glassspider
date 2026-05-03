/** Strip scripting from arbitrary HTML before placing it in a sandbox iframe. */
export function stripScriptsForIframe(html: string): string {
  let out = html.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<\/?iframe\b[\s\S]*?>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  out = out.replace(/<meta[^>]*http-equiv\s*=\s*(['"`])?\s*refresh/gi, "<meta blocked-refresh ");
  out = out.replace(/<link\b[^>]*href\s*=\s*(["'])javascript:/gi, "<link blocked-href=");
  return out;
}

export function extractHtmlTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/im.exec(html);
  if (!match?.[1]) {
    return null;
  }

  const text = decodeBasicEntities(match[1].replace(/<[\s\S]*?>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  return text.length > 0 ? text : null;
}

function decodeBasicEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot);/gi, (entity) => {
      switch (entity.toLowerCase()) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        default:
          return entity;
      }
    });
}

export type ExtractedLink = {
  href: string;
  absoluteUrl: string;
  label: string;
};

/** Simple anchor extractor — tolerant of malformed HTML. */
export function extractLinksFromHtml(html: string, baseUrl: string): ExtractedLink[] {
  const base = safeUrl(baseUrl);
  const out: ExtractedLink[] = [];
  const regex = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const inner = stripTags(match[4] ?? "");
    const trimmed = href.trim();

    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("javascript:") || trimmed.startsWith("mailto:")) {
      continue;
    }

    let absoluteUrl: string;

    try {
      absoluteUrl = new URL(trimmed, base).href.split("#")[0] ?? trimmed;
    } catch {
      continue;
    }

    if (!/^https?:\/\//i.test(absoluteUrl)) {
      continue;
    }

    out.push({
      href: trimmed,
      absoluteUrl,
      label: inner.replace(/\s+/g, " ").trim().slice(0, 280) || absoluteUrl,
    });
  }

  return dedupeByAbsolute(out);
}

function safeUrl(candidate: string) {
  try {
    return new URL(candidate).href;
  } catch {
    return "https://example.com/";
  }
}

function stripTags(fragment: string) {
  return fragment.replace(/<[^>]+>/g, " ");
}

function dedupeByAbsolute(links: ExtractedLink[]) {
  const seen = new Set<string>();
  const result: ExtractedLink[] = [];

  for (const link of links) {
    if (seen.has(link.absoluteUrl)) {
      continue;
    }

    seen.add(link.absoluteUrl);
    result.push(link);
  }

  return result;
}

export function groupLinksByOriginPath(links: ExtractedLink[]): Map<string, ExtractedLink[]> {
  const map = new Map<string, ExtractedLink[]>();

  for (const link of links) {
    let pattern = "(other)";
    try {
      const u = new URL(link.absoluteUrl);
      const segments = u.pathname.split("/").filter(Boolean);
      const prefix = segments[0] ?? "";
      pattern = `${u.origin}${prefix ? `/${prefix}` : ""}/*`;
    } catch {
      pattern = "(unparsed)";
    }

    const bucket = map.get(pattern) ?? [];
    bucket.push(link);
    map.set(pattern, bucket);
  }

  const sortedEntries = [...map.entries()].sort((a, b) => b[1].length - a[1].length);

  return new Map(sortedEntries);
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

import { ButtonGroup, ConsoleButton } from "@/components/ui/button-group";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

type ExploreResponse = {
  requestedUrl: string;
  resolvedUrl: string;
  statusCode: number;
  title: string | null;
  links: Array<{ href: string; absoluteUrl: string; label: string }>;
  grouped: Array<{ pattern: string; items: Array<{ href: string; absoluteUrl: string; label: string }> }>;
  sanitisedHtml: string;
};

export function ExploreWorkspace() {
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExploreResponse | null>(null);
  const [pending, startTransition] = useTransition();

  const previewSrcDoc = result?.sanitisedHtml ?? "";
  const grouping = useMemo(() => result?.grouped ?? [], [result?.grouped]);

  const handleFetch = useCallback(() => {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/explore/fetch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const payload = await response.json();

        if (!response.ok) {
          setError(payload?.error ?? "Request failed.");
          setResult(null);
          return;
        }

        setResult(payload as ExploreResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error.");
        setResult(null);
      }
    });
  }, [url]);

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
        </div>
        {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}
        {result ? (
          <p className="mt-3 text-xs text-[var(--muted)]">
            Resolved <span className="font-mono">{result.resolvedUrl}</span> · HTTP {result.statusCode}
            {result.title ? (
              <>
                {" "}
                · <span className="text-slate-800">{result.title}</span>
              </>
            ) : null}
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
          <Panel title="Rendered preview" eyebrow="Sandbox" className="min-h-[420px] overflow-hidden">
            <iframe
              title="Page preview"
              sandbox=""
              srcDoc={previewSrcDoc}
              className="h-[560px] w-full border border-[var(--panel-border)] bg-white"
            />
          </Panel>

          <Panel title="Extracted links" eyebrow={`${result.links.length} total`}>
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
    </div>
  );
}

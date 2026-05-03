"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { enqueueScrapeForSelection, updateDiscoveredUrls } from "@/app/actions/console";
import { isLikelyUrlMapRlsError } from "@/lib/url-map-feedback";
import { ButtonGroup, ConsoleButton } from "@/components/ui/button-group";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DiscoveredUrl, Source } from "@/lib/types";

type UrlMapClientProps = {
  sources: Source[];
  rows: DiscoveredUrl[];
  total: number | null;
  limit: number;
  offset: number;
  filters: {
    urlType: string;
    status: string;
    sourceId: string;
  };
};

export function UrlMapClient({ sources, rows, total, limit, offset, filters }: UrlMapClientProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<
    | { kind: "success"; text: string }
    | { kind: "error"; text: string }
    | { kind: "rls"; text: string }
    | null
  >(null);
  const [pending, startTransition] = useTransition();

  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const tuples = useMemo(() => {
    return [...selected]
      .map((id) => {
        const row = rowById.get(id);
        if (!row) {
          return null;
        }

        return { sourceId: row.source_id, urlId: row.id };
      })
      .filter(Boolean) as { sourceId: string; urlId: string }[];
  }, [rowById, selected]);

  const toggleRow = (id: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);

      if (next) {
        copy.add(id);
      } else {
        copy.delete(id);
      }

      return copy;
    });
  };

  const page = Math.floor(offset / limit) + 1;
  const hasPrev = offset > 0;
  const hasNext = total != null ? offset + rows.length < total : rows.length === limit;

  function buildQuery(next: Partial<{ page: number; type: string; status: string; source: string }>) {
    const params = new URLSearchParams();
    const type = next.type ?? filters.urlType;
    const status = next.status ?? filters.status;
    const source = next.source ?? filters.sourceId;

    if (type && type !== "all") {
      params.set("type", type);
    }

    if (status && status !== "all") {
      params.set("status", status);
    }

    if (source && source !== "all") {
      params.set("source", source);
    }

    const nextPage = next.page ?? page;
    if (nextPage > 1) {
      params.set("page", String(nextPage));
    }

    return params.toString();
  }

  const columns: Column<DiscoveredUrl>[] = [
    {
      key: "url",
      header: "URL",
      cell: (row) => (
        <div>
          <a className="text-[var(--accent)] underline-offset-2 hover:underline" href={row.url} target="_blank" rel="noreferrer">
            {row.url}
          </a>
          {row.matched_rule ? <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{row.matched_rule}</div> : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      cell: (row) => <StatusBadge tone="neutral">{row.url_type}</StatusBadge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => {
        const tone =
          row.status === "failed" ? "bad" : row.status === "scraped" ? "ok" : row.status === "ignored" ? "neutral" : "active";
        return <StatusBadge tone={tone}>{row.status}</StatusBadge>;
      },
    },
    {
      key: "http",
      header: "HTTP",
      cell: (row) => row.http_status ?? "—",
    },
    {
      key: "seen",
      header: "Last seen",
      cell: (row) => new Date(row.last_seen_at).toLocaleString(),
    },
  ];

  const runBatch = (action: () => Promise<void>) => {
    setFeedback(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (error) {
        const text = error instanceof Error ? error.message : "Action failed.";
        setFeedback(isLikelyUrlMapRlsError(text) ? { kind: "rls", text } : { kind: "error", text });
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Discovered URLs"
        eyebrow="URL map"
        actions={
          <ButtonGroup>
            <ConsoleButton
              variant="primary"
              type="button"
              disabled={pending || tuples.length === 0}
              onClick={() =>
                runBatch(async () => {
                  const res = await enqueueScrapeForSelection(tuples);

                  if (res.error) {
                    throw new Error(res.error);
                  }

                  const n = res.jobsQueued ?? 0;
                  setFeedback({ kind: "success", text: n <= 1 ? `Queued ${n} extract job.` : `Queued ${n} extract batches (multiple sources split into separate jobs).` });
                  setSelected(new Set());
                })
              }
            >
              Extract selected
            </ConsoleButton>
            <ConsoleButton
              variant="secondary"
              type="button"
              disabled={pending || selected.size === 0}
              onClick={() =>
                runBatch(async () => {
                  const res = await updateDiscoveredUrls([...selected], { url_type: "detail" });

                  if (res.error) {
                    throw new Error(res.error);
                  }

                  const n = selected.size;
                  setFeedback({ kind: "success", text: `Tagged ${n} URL(s) as detail in the URL map.` });
                })
              }
            >
              Mark as detail
            </ConsoleButton>
            <ConsoleButton
              variant="danger"
              type="button"
              disabled={pending || selected.size === 0}
              onClick={() =>
                runBatch(async () => {
                  const res = await updateDiscoveredUrls([...selected], { status: "ignored" });

                  if (res.error) {
                    throw new Error(res.error);
                  }

                  const n = selected.size;
                  setFeedback({ kind: "success", text: `Marked ${n} URL(s) as ignored.` });
                })
              }
            >
              Mark as ignore
            </ConsoleButton>
          </ButtonGroup>
        }
      >
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-xs font-medium">
            Type
            <select
              name="type"
              defaultValue={filters.urlType || "all"}
              className="mt-1 block rounded border border-[var(--panel-border)] bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All</option>
              <option value="listing">listing</option>
              <option value="detail">detail</option>
              <option value="award">award</option>
              <option value="document">document</option>
              <option value="unknown">unknown</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            Status
            <select
              name="status"
              defaultValue={filters.status || "all"}
              className="mt-1 block rounded border border-[var(--panel-border)] bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All</option>
              <option value="new">new</option>
              <option value="queued">queued</option>
              <option value="scraped">scraped</option>
              <option value="ignored">ignored</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className="text-xs font-medium">
            Source
            <select
              name="source"
              defaultValue={filters.sourceId || "all"}
              className="mt-1 block max-w-xs rounded border border-[var(--panel-border)] bg-white px-2 py-1.5 text-xs"
            >
              <option value="all">All</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <ConsoleButton variant="primary" type="submit" className="self-end">
            Apply
          </ConsoleButton>
        </form>
        {feedback?.kind === "success" ? <p className="mt-3 text-xs font-medium text-emerald-900">{feedback.text}</p> : null}
        {feedback?.kind === "error" ? <p className="mt-3 text-xs font-medium text-red-800">{feedback.text}</p> : null}
        {feedback?.kind === "rls" ? (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-semibold">Database policy blocked URL row edits</p>
            <p className="mt-1 leading-relaxed">
              Postgres returned: <span className="break-words font-mono text-[11px]">{feedback.text}</span>
            </p>
            <p className="mt-2 leading-relaxed">
              In the shipped migrations, authenticated users can usually <strong>read</strong> <code className="rounded bg-white px-0.5">glassspider_discovered_urls</code>{" "}
              but not update it without an extra GRANT/policy. Workers using the service role still enqueue extract jobs—which is enough to progress the crawl pipeline.
              To persist tagging from the UI, add an admin UPDATE policy (see <strong>docs/DB_CURRENT_STATE.md</strong> Access model).
            </p>
          </div>
        ) : null}
        <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
          <summary className="cursor-pointer select-none font-medium text-slate-800">Tagging URLs vs enqueueing extracts</summary>
          <ul className="mt-2 list-inside list-disc space-y-1 leading-relaxed">
            <li>
              <strong>Extract selected</strong> queues Fly extract jobs—they do not require manually editing URL rows in Postgres (works alongside read-only URL maps).
            </li>
            <li>
              <strong>Mark as detail / ignore</strong> issues direct updates; success requires database policies granting UPDATE to operators.
            </li>
          </ul>
        </details>
      </Panel>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        selectionKey={(row) => row.id}
        selectedIds={selected}
        onToggleRow={(id, value) => toggleRow(id, value)}
        emptyLabel={
          <>
            Nothing matches these filters. Run a <Link href="/runs" className="text-[var(--accent)] underline">crawl job from Runs</Link>, then widen filters or pagination.
          </>
        }
      />

      <div className="flex items-center justify-between text-xs">
        <div className="text-[var(--muted)]">
          {total != null ? (
            <>
              Showing {offset + 1}-{offset + rows.length} of {total}
            </>
          ) : (
            <>Page {page}</>
          )}
        </div>
        <div className="flex gap-2">
          {hasPrev ? (
            <Link
              href={`/url-map?${buildQuery({ page: page - 1 })}`}
              className="rounded border border-[var(--panel-border)] px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-white"
            >
              Previous
            </Link>
          ) : (
            <span className="rounded px-3 py-1 text-xs font-semibold text-[var(--muted)]">Previous</span>
          )}
          {hasNext ? (
            <Link
              href={`/url-map?${buildQuery({ page: page + 1 })}`}
              className="rounded border border-[var(--panel-border)] px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-white"
            >
              Next
            </Link>
          ) : (
            <span className="rounded px-3 py-1 text-xs font-semibold text-[var(--muted)]">Next</span>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useInspector } from "@/components/console/inspector";
import { RecordInspector } from "@/components/data/record-inspector";
import { type Column, DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { BidRecord, Source } from "@/lib/types";

type ExplorerProps = {
  rows: BidRecord[];
  sources: Source[];
  total: number | null;
  limit: number;
  offset: number;
  filters: {
    keyword: string;
    sourceId: string;
    dateFrom: string;
    dateTo: string;
  };
};

export function DataExplorer({ rows, sources, total, limit, offset, filters }: ExplorerProps) {
  const router = useRouter();
  const { open } = useInspector();

  const page = Math.floor(offset / limit) + 1;
  const hasPrev = offset > 0;
  const hasNext = total != null ? offset + rows.length < total : rows.length === limit;

  function buildQuery(next: Partial<{ page: number }>) {
    const params = new URLSearchParams();

    if (filters.keyword) {
      params.set("keyword", filters.keyword);
    }

    if (filters.sourceId && filters.sourceId !== "all") {
      params.set("source", filters.sourceId);
    }

    if (filters.dateFrom) {
      params.set("from", filters.dateFrom);
    }

    if (filters.dateTo) {
      params.set("to", filters.dateTo);
    }

    const targetPage = next.page ?? page;
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    }

    return params.toString();
  }

  const columns = useMemo<Column<BidRecord>[]>(
    () => [
      {
        key: "title",
        header: "Record",
        cell: (row) => (
          <div>
            <p className="font-semibold text-slate-900">{row.title}</p>
            <p className="text-[var(--muted)]">{row.buyer_name ?? row.source_url ?? "—"}</p>
          </div>
        ),
      },
      {
        key: "counterparty",
        header: "Source / party",
        cell: (row) => row.supplier_name ?? row.buyer_name ?? "—",
      },
      {
        key: "category",
        header: "Category",
        cell: (row) => row.sector_primary ?? "—",
      },
      {
        key: "value",
        header: "Value",
        cell: (row) => (row.contract_value_awarded != null ? `${row.currency ?? ""} ${row.contract_value_awarded.toLocaleString()}` : "—"),
      },
      {
        key: "published",
        header: "Published",
        cell: (row) => row.published_date ?? "—",
      },
      {
        key: "status",
        header: "Review",
        cell: (row) => <StatusBadge tone="neutral">{row.review_status}</StatusBadge>,
      },
    ],
    [],
  );

  const openInspector = useCallback(
    (id: string) => {
      open(<RecordInspector recordId={id} />);
    },
    [open],
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel
        title="Results"
        eyebrow={`${total ?? "?"} rows · keyword uses full‑text`}
        actions={
          <Link className="rounded border border-[var(--panel-border)] bg-white px-3 py-1 text-[11px] font-semibold" href="/api/dashboard/export">
            Export CSV
          </Link>
        }
      >
        <form className="grid gap-3 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]" method="get">
          <label className="text-xs font-medium">
            Keyword
            <input defaultValue={filters.keyword} name="keyword" placeholder="Words or phrases…" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
          </label>
          <label className="text-xs font-medium">
            Source
            <select
              defaultValue={filters.sourceId || "all"}
              name="source"
              className="mt-1 w-full rounded border border-[var(--panel-border)] bg-white px-2 py-1.5"
            >
              <option value="all">All sources</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">
            From
            <input defaultValue={filters.dateFrom} name="from" type="date" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
          </label>
          <label className="text-xs font-medium">
            To
            <input defaultValue={filters.dateTo} name="to" type="date" className="mt-1 w-full rounded border border-[var(--panel-border)] px-2 py-1.5" />
          </label>
          <button
            type="submit"
            className="rounded bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white md:col-span-5 lg:col-span-1 lg:self-end"
          >
            Apply
          </button>
        </form>
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          Keyword mode uses Postgres full‑text (`search_vector`). Click a row to inspect extracted fields and raw capture.
        </p>
      </Panel>

      <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} emptyLabel="Nothing matched yet." onRowClick={(row) => openInspector(row.id)} />

      <div className="space-y-2 border border-dashed border-[var(--panel-border)] bg-slate-50 p-4 text-[11px] text-[var(--muted)] lg:hidden">
        <p className="font-semibold text-slate-800">Mobile</p>
        <p>Open a record:</p>
        <ul className="space-y-1">
          {rows.slice(0, 20).map((row) => (
            <li key={row.id}>
              <Link className="text-[var(--accent)] underline-offset-2 hover:underline" href={`/records/${row.id}`}>
                {row.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="text-[var(--muted)]">
          {total != null ? `${offset + 1}-${offset + rows.length} of ${total}` : <>Page {page}</>}
        </div>
        <div className="flex gap-3">
          {hasPrev ? (
            <button type="button" className="text-[var(--accent)] underline" onClick={() => router.push(`/data?${buildQuery({ page: page - 1 })}`)}>
              Previous page
            </button>
          ) : (
            <span className="text-[var(--muted)]">Previous</span>
          )}
          {hasNext ? (
            <button type="button" className="text-[var(--accent)] underline" onClick={() => router.push(`/data?${buildQuery({ page: page + 1 })}`)}>
              Next page
            </button>
          ) : (
            <span className="text-[var(--muted)]">Next</span>
          )}
        </div>
      </div>
    </div>
  );
}

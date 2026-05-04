import { AccessPanel } from "@/components/access-panel";
import { DataExplorer } from "@/components/data/data-explorer";
import { Panel } from "@/components/ui/panel";
import { requireProductAccess } from "@/lib/auth";
import { listRecordsExplorerPage, listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DataRouteProps = {
  searchParams: Promise<{ keyword?: string; source?: string; from?: string; to?: string; page?: string }>;
};

export default async function DataRoute({ searchParams }: DataRouteProps) {
  const access = await requireProductAccess();

  if (access.status !== "granted") {
    return (
      <div className="p-6">
        <AccessPanel access={access} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="p-6">
        <AccessPanel access={{ status: "configuration_required" }} />
      </div>
    );
  }

  const params = await searchParams;
  const limit = 50;
  const page = Number(params.page) > 1 ? Number(params.page) : 1;
  const offset = (page - 1) * limit;

  const filters = {
    keyword: params.keyword?.trim(),
    sourceId: params.source && params.source !== "all" ? params.source : undefined,
    dateFrom: params.from ?? undefined,
    dateTo: params.to ?? undefined,
    limit,
    offset,
  };

  const [sources, explorer] = await Promise.all([
    listSources(supabase),
    listRecordsExplorerPage(supabase, filters),
  ]);

  return (
    <div className="space-y-3 p-4">
      <Panel title="Data" eyebrow="Extracted bid records">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            This grid shows <strong className="font-semibold text-slate-900">structured rows emitted by extractor runs</strong> (titles, counterparties, review
            state, etc.). Keyword search hits Postgres full-text on the indexed{' '}
            <span className="font-mono text-[11px]">search_vector</span> column—pair it with Source and date filters to reproduce customer issues quickly.
          </p>
          <div>
            <p className="font-semibold text-slate-900">How it ties upstream</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 [&>li]:text-slate-700">
              <li>Empty grid after a crawl → URL map may lack detail URLs queued for scrape, or extract jobs errored.</li>
              <li>Rows present but stale → rerun extract with tighter filters via Runs.</li>
              <li>Open a row in the inspector rail (desktop) or follow <span className="font-mono text-[11px]">/records/&lt;id&gt;</span> for JSON + canon data.</li>
            </ul>
          </div>
        </div>
      </Panel>
      <DataExplorer
        rows={explorer.data.rows}
        sources={sources.data}
        total={explorer.data.count}
        limit={limit}
        offset={offset}
        filters={{
          keyword: params.keyword ?? "",
          sourceId: params.source ?? "all",
          dateFrom: params.from ?? "",
          dateTo: params.to ?? "",
        }}
      />
      {explorer.error ? <p className="text-xs text-red-700">{explorer.error}</p> : null}
      {sources.error ? <p className="text-xs text-amber-800">{sources.error}</p> : null}
    </div>
  );
}

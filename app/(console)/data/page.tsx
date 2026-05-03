import { DataExplorer } from "@/components/data/data-explorer";
import { AccessPanel } from "@/components/access-panel";
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

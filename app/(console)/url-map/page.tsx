import { UrlMapClient } from "@/components/url-map/url-map-client";
import { AccessPanel } from "@/components/access-panel";
import { Panel } from "@/components/ui/panel";
import { requireAdminAccess } from "@/lib/auth";
import { listDiscoveredUrlsPaged, listSources } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type UrlMapPageProps = {
  searchParams: Promise<{ type?: string; status?: string; source?: string; page?: string }>;
};

export default async function UrlMapRoute({ searchParams }: UrlMapPageProps) {
  const access = await requireAdminAccess();

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
  const limit = 75;
  const page = Number(params.page) > 1 ? Number(params.page) : 1;
  const offset = (page - 1) * limit;

  const filters = {
    urlType:
      params.type && params.type !== "all"
        ? (params.type as "listing" | "detail" | "award" | "document" | "unknown")
        : undefined,
    status:
      params.status && params.status !== "all"
        ? (params.status as "new" | "queued" | "scraped" | "ignored" | "failed")
        : undefined,
    sourceId: params.source && params.source !== "all" ? params.source : undefined,
    limit,
    offset,
  };

  const [sources, urls] = await Promise.all([listSources(supabase), listDiscoveredUrlsPaged(supabase, filters)]);

  return (
    <div className="space-y-3 p-4">
      <Panel eyebrow="Context" title="Operational map">
        Inspect everything the crawler surfaced. Selecting rows exposes batch scrape + tagging intents (respecting database policies).
      </Panel>
      <UrlMapClient
        sources={sources.data}
        rows={urls.data.rows}
        total={urls.data.count}
        limit={limit}
        offset={offset}
        filters={{
          urlType: params.type ?? "all",
          status: params.status ?? "all",
          sourceId: params.source ?? "all",
        }}
      />
      {urls.error ? <p className="px-4 text-xs text-red-700">{urls.error}</p> : null}
      {sources.error ? <p className="px-4 text-xs text-amber-800">{sources.error}</p> : null}
    </div>
  );
}

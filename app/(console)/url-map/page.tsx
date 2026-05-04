import Link from "next/link";

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
  const selectedSource = filters.sourceId ? sources.data.find((source) => source.id === filters.sourceId) : null;
  const selectedSourceIsApi =
    selectedSource?.fetch_mode === "declared_api" || selectedSource?.fetch_mode === "discovered_api";

  return (
    <div className="space-y-3 p-4">
      <Panel eyebrow="Scope" title="Scope crawl coverage">
        <div className="space-y-3 text-xs leading-relaxed text-slate-700">
          <p>
            Scope is used when Glassspider needs to crawl many pages before extraction. API sources may skip this step.
          </p>
          <div>
            <p className="font-semibold text-slate-900">What success looks like</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 [&>li]:text-slate-700">
              <li>Rows appear after Runs → job type crawl completes for your source.</li>
              <li>Detail-ish URLs accumulate status updates as extract jobs drain the queue.</li>
              <li>Selected rows unlock batch actions; if saves fail silently, Postgres RLS policies may block updates—watch for inline errors.</li>
            </ul>
          </div>
        </div>
      </Panel>
      {selectedSource && selectedSourceIsApi ? (
        <Panel eyebrow="API source" title="Scope not required for this source">
          <p className="text-xs text-slate-700">
            <span className="font-semibold">{selectedSource.name}</span> uses a direct API endpoint, so URL map coverage is optional.
          </p>
          <div className="mt-3">
            <Link href="/runs" className="rounded border border-[var(--panel-border)] bg-white px-3 py-1.5 text-xs font-semibold">
              Go to run extraction
            </Link>
          </div>
        </Panel>
      ) : null}
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

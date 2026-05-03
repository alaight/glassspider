import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BidRecord,
  Classification,
  DiscoveredUrl,
  PipelineRun,
  RawRecord,
  RecordWorkspace,
  Source,
  SourceRule,
} from "@/lib/types";

export type QueryResult<T> = {
  data: T;
  error?: string;
};

function emptyOnMissingTable<T>(data: T, error: { message?: string; code?: string } | null) {
  if (!error) {
    return { data };
  }

  return { data, error: error.message ?? "Database query failed." };
}

export async function listSources(supabase: SupabaseClient): Promise<QueryResult<Source[]>> {
  const { data, error } = await supabase
    .from("glassspider_sources")
    .select("*")
    .order("created_at", { ascending: false });

  return emptyOnMissingTable((data ?? []) as Source[], error);
}

export async function getSource(
  supabase: SupabaseClient,
  id: string,
): Promise<QueryResult<Source | null>> {
  const { data, error } = await supabase
    .from("glassspider_sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return emptyOnMissingTable((data ?? null) as Source | null, error);
}

export async function listSourceRules(
  supabase: SupabaseClient,
  sourceId: string,
): Promise<QueryResult<SourceRule[]>> {
  const { data, error } = await supabase
    .from("glassspider_source_rules")
    .select("*")
    .eq("source_id", sourceId)
    .order("priority", { ascending: true });

  return emptyOnMissingTable((data ?? []) as SourceRule[], error);
}

export async function listRuns(supabase: SupabaseClient): Promise<QueryResult<PipelineRun[]>> {
  const { data, error } = await supabase
    .from("glassspider_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  return emptyOnMissingTable((data ?? []) as PipelineRun[], error);
}

export async function listDiscoveredUrls(
  supabase: SupabaseClient,
): Promise<QueryResult<DiscoveredUrl[]>> {
  const { data, error } = await supabase
    .from("glassspider_discovered_urls")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(100);

  return emptyOnMissingTable((data ?? []) as DiscoveredUrl[], error);
}

export async function listBidRecords(
  supabase: SupabaseClient,
): Promise<QueryResult<BidRecord[]>> {
  const { data, error } = await supabase
    .from("glassspider_bid_records")
    .select("*")
    .order("estimated_renewal_date", { ascending: true, nullsFirst: false })
    .limit(100);

  return emptyOnMissingTable((data ?? []) as BidRecord[], error);
}

export async function getBidRecord(
  supabase: SupabaseClient,
  id: string,
): Promise<QueryResult<BidRecord | null>> {
  const { data, error } = await supabase
    .from("glassspider_bid_records")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return emptyOnMissingTable((data ?? null) as BidRecord | null, error);
}



export type UrlMapFilters = {
  urlType?: DiscoveredUrl["url_type"];
  status?: DiscoveredUrl["status"];
  sourceId?: string;
  limit?: number;
  offset?: number;
};

export async function listDiscoveredUrlsPaged(
  supabase: SupabaseClient,
  filters: UrlMapFilters,
): Promise<QueryResult<{ rows: DiscoveredUrl[]; count: number | null }>> {
  const limit = Math.min(Math.max(filters.limit ?? 75, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase
    .from("glassspider_discovered_urls")
    .select("*", { count: "exact" })
    .order("last_seen_at", { ascending: false });

  if (filters.urlType) {
    query = query.eq("url_type", filters.urlType);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  if (filters.sourceId) {
    query = query.eq("source_id", filters.sourceId);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return { data: { rows: [], count: null }, error: error.message ?? "Database query failed." };
  }

  return { data: { rows: (data ?? []) as DiscoveredUrl[], count } };
}

export type RecordExplorerFilters = {
  keyword?: string | null;
  sourceId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number;
  offset?: number;
};

export async function listRecordsExplorerPage(
  supabase: SupabaseClient,
  filters: RecordExplorerFilters,
): Promise<QueryResult<{ rows: BidRecord[]; count: number | null }>> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  let query = supabase
    .from("glassspider_bid_records")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (filters.keyword?.trim()) {
    query = query.textSearch("search_vector", filters.keyword.trim(), {
      config: "english",
      type: "websearch",
    });
  }

  if (filters.sourceId) {
    query = query.eq("source_id", filters.sourceId);
  }

  if (filters.dateFrom) {
    query = query.gte("published_date", filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte("published_date", filters.dateTo);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return { data: { rows: [], count: null }, error: error.message ?? "Database query failed." };
  }

  return { data: { rows: (data ?? []) as BidRecord[], count } };
}

export async function getRecordWorkspace(
  supabase: SupabaseClient,
  id: string,
): Promise<QueryResult<RecordWorkspace | null>> {
  const record = await getBidRecord(supabase, id);

  if (record.error) {
    return { data: null, error: record.error };
  }

  if (!record.data) {
    return { data: null };
  }

  let raw: RawRecord | null = null;

  if (record.data.raw_record_id) {
    const { data: rawRow, error: rawErr } = await supabase
      .from("glassspider_raw_records")
      .select("*")
      .eq("id", record.data.raw_record_id)
      .maybeSingle();

    if (rawErr) {
      return { data: null, error: rawErr.message ?? "Unable to load raw capture." };
    }

    raw = (rawRow ?? null) as RawRecord | null;
  }

  const { data: byBidId, error: clsErrBid } = await supabase
    .from("glassspider_classifications")
    .select("*")
    .eq("bid_record_id", id);

  if (clsErrBid) {
    return { data: null, error: clsErrBid.message ?? "Unable to load classifications." };
  }

  let rows: Classification[] = ((byBidId ?? []) as Classification[]).slice();

  if (record.data.raw_record_id) {
    const { data: byRawId, error: clsErrRaw } = await supabase
      .from("glassspider_classifications")
      .select("*")
      .eq("raw_record_id", record.data.raw_record_id);

    if (clsErrRaw) {
      return { data: null, error: clsErrRaw.message ?? "Unable to load classifications." };
    }

    rows = [...rows, ...((byRawId ?? []) as Classification[])];
  }

  const dedupId = new Set<string>();

  rows = rows.filter((row) => {
    if (dedupId.has(row.id)) {
      return false;
    }

    dedupId.add(row.id);
    return true;
  });

  return { data: { record: record.data, raw, classifications: rows }, error: undefined };
}

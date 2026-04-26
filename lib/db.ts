import type { SupabaseClient } from "@supabase/supabase-js";

import type { BidRecord, DiscoveredUrl, PipelineRun, Source, SourceRule } from "@/lib/types";

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

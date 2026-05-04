"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireAdminAccess } from "@/lib/auth";
import { buildJobPayload, enqueueJob, retryJob } from "@/lib/jobs";
import type { DiscoveredUrl } from "@/lib/types";
import { BIDSTATS_RULE_SEEDS, BIDSTATS_SOURCE_SEED } from "@/lib/source-seeds/bidstats";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const sourceSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  base_url: z.string().url(),
  entry_urls: z.string().min(1),
  status: z.enum(["active", "paused", "draft"]),
  fetch_mode: z.enum(["static_html", "rendered_html", "discovered_api", "declared_api"]).default("static_html"),
  fetch_config_json: z.string().optional(),
  crawl_frequency: z.string().optional(),
  scrape_frequency: z.string().optional(),
  compliance_notes: z.string().optional(),
});

const ruleSchema = z.object({
  source_id: z.string().uuid(),
  rule_type: z.enum(["include", "exclude", "detail", "listing"]),
  pattern: z.string().min(1),
  description: z.string().optional(),
  priority: z.coerce.number().int().default(100),
});

const runSchema = z.object({
  source_id: z.string().uuid(),
  run_type: z.enum(["crawl", "scrape", "classify"]),
});

const retrySchema = z.object({
  job_id: z.string().uuid(),
});

const tupleSchema = z.object({
  sourceId: z.string().uuid(),
  urlId: z.string().uuid(),
});

const sourceFetchSchema = z.object({
  source_id: z.string().uuid(),
  fetch_mode: z.enum(["static_html", "rendered_html", "discovered_api", "declared_api"]),
  fetch_config_json: z.string().optional(),
});

function parseFetchConfigJson(value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Fetch config must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid JSON in fetch config.");
  }
}

function revalidateConsole() {
  const paths = ["/sources", "/url-map", "/runs", "/data", "/records", "/explore", "/admin", "/dashboard"];
  for (const path of paths) {
    revalidatePath(path);
  }

  // Legacy route trees
  revalidatePath("/admin/sources");
  revalidatePath("/admin/runs");
  revalidatePath("/admin/url-map");
  revalidatePath("/dashboard/search");
}

export async function createSource(formData: FormData) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const parsed = sourceSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    throw new Error("Check the source fields and try again.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const entryUrls = parsed.data.entry_urls
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);

  const { fetch_config_json, ...sourceFields } = parsed.data;

  const { error } = await supabase.from("glassspider_sources").insert({
    ...sourceFields,
    entry_urls: entryUrls,
    fetch_mode: parsed.data.fetch_mode,
    fetch_config: parseFetchConfigJson(fetch_config_json),
    crawl_frequency: parsed.data.crawl_frequency || null,
    scrape_frequency: parsed.data.scrape_frequency || null,
    compliance_notes: parsed.data.compliance_notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateConsole();
}

export async function updateSourceFetchStrategy(formData: FormData) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const parsed = sourceFetchSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    throw new Error("Choose a valid fetch mode and source.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const fetchConfig = parseFetchConfigJson(parsed.data.fetch_config_json);

  const { error } = await supabase
    .from("glassspider_sources")
    .update({
      fetch_mode: parsed.data.fetch_mode,
      fetch_config: fetchConfig,
    })
    .eq("id", parsed.data.source_id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/sources/${parsed.data.source_id}`);
  revalidatePath("/sources");
  revalidatePath("/runs");
}

export async function createSourceRule(formData: FormData) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    throw new Error("Check the rule fields and try again.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.from("glassspider_source_rules").insert({
    ...parsed.data,
    description: parsed.data.description || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath(`/sources/${parsed.data.source_id}`);
  revalidatePath(`/admin/sources/${parsed.data.source_id}`);
  revalidatePath("/sources");
}

export async function startSourceRun(formData: FormData) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const parsed = runSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    throw new Error("Choose a source and run type.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const payload = buildJobPayload(parsed.data.run_type, formData);

  const { error } = await enqueueJob(supabase, {
    type: parsed.data.run_type,
    sourceId: parsed.data.source_id,
    payload,
    createdBy: access.userId,
  });

  if (error) {
    throw new Error(error);
  }

  revalidateConsole();
}

export async function retryFailedJob(jobIdInput: FormData | string) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const jobId =
    typeof jobIdInput === "string" ? jobIdInput : retrySchema.safeParse(Object.fromEntries(jobIdInput)).data?.job_id;

  if (!jobId) {
    throw new Error("Choose a failed job to retry.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await retryJob(supabase, jobId);

  if (error) {
    throw new Error(error);
  }

  revalidatePath("/runs");
  revalidatePath("/admin/runs");
}

export async function seedBidStatsSource() {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    throw new Error(access.message ?? "Admin access required.");
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data: source, error: sourceError } = await supabase
    .from("glassspider_sources")
    .upsert(BIDSTATS_SOURCE_SEED, { onConflict: "slug" })
    .select("id")
    .single();

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const { error: rulesError } = await supabase.from("glassspider_source_rules").upsert(
    BIDSTATS_RULE_SEEDS.map((rule) => ({
      ...rule,
      source_id: source.id,
    })),
    { onConflict: "source_id,rule_type,pattern" },
  );

  if (rulesError) {
    throw new Error(rulesError.message);
  }

  revalidatePath("/sources");
  revalidatePath("/admin/sources");
}

export async function enqueueScrapeForSelection(tuplesRaw: unknown) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return { error: access.message ?? "Admin access required." };
  }

  const parsedTuples = z.array(tupleSchema).safeParse(tuplesRaw);

  if (!parsedTuples.success || parsedTuples.data.length === 0) {
    return { error: "Select at least one URL with a known source." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const buckets = new Map<string, Set<string>>();
  for (const tuple of parsedTuples.data) {
    const set = buckets.get(tuple.sourceId) ?? new Set<string>();
    set.add(tuple.urlId);
    buckets.set(tuple.sourceId, set);
  }

  let jobsQueued = 0;

  for (const [sourceId, set] of buckets) {
    const ids = [...set];
    const chunkSize = 120;

    for (let index = 0; index < ids.length; index += chunkSize) {
      const slice = ids.slice(index, index + chunkSize);

      const { error } = await enqueueJob(supabase, {
        type: "scrape",
        sourceId,
        payload: { url_ids: slice },
        createdBy: access.userId,
      });

      if (error) {
        return { error };
      }

      jobsQueued += 1;
    }
  }

  revalidatePath("/runs");
  revalidatePath("/url-map");
  revalidatePath("/data");

  return { jobsQueued };
}

export async function updateDiscoveredUrls(
  ids: string[],
  patch: Partial<Pick<DiscoveredUrl, "url_type" | "status">>,
) {
  const access = await requireAdminAccess();

  if (access.status !== "granted") {
    return { error: access.message ?? "Admin access required." };
  }

  if (ids.length === 0) {
    return { error: "No rows selected." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase.from("glassspider_discovered_urls").update(patch).in("id", ids);

  if (error) {
    return {
      error: `${error.message} If this persists, your account may only have read access to the URL map (RLS).`,
    };
  }

  revalidatePath("/url-map");
  revalidatePath("/admin/url-map");

  return {};
}

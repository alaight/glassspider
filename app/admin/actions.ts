"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdminAccess } from "@/lib/auth";
import { getSource, listSourceRules } from "@/lib/db";
import { runSourcePipeline } from "@/lib/scraping/run";
import { BIDSTATS_RULE_SEEDS, BIDSTATS_SOURCE_SEED } from "@/lib/scraping/sources/bidstats";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";

const sourceSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  base_url: z.string().url(),
  entry_urls: z.string().min(1),
  status: z.enum(["active", "paused", "draft"]),
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

  const { error } = await supabase.from("glassspider_sources").insert({
    ...parsed.data,
    entry_urls: entryUrls,
    crawl_frequency: parsed.data.crawl_frequency || null,
    scrape_frequency: parsed.data.scrape_frequency || null,
    compliance_notes: parsed.data.compliance_notes || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/sources");
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

  revalidatePath(`/admin/sources/${parsed.data.source_id}`);
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

  const service = createSupabaseServiceClient();

  if (!service) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for pipeline runs.");
  }

  const source = await getSource(service, parsed.data.source_id);
  const rules = await listSourceRules(service, parsed.data.source_id);

  if (!source.data) {
    throw new Error(source.error ?? "Source not found.");
  }

  if (rules.error) {
    throw new Error(rules.error);
  }

  await runSourcePipeline({
    supabase: service,
    source: source.data,
    rules: rules.data,
    runType: parsed.data.run_type,
    triggeredBy: access.userId,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/runs");
  revalidatePath("/admin/url-map");
  revalidatePath("/dashboard");
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

  revalidatePath("/admin/sources");
}

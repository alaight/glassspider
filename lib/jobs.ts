import type { SupabaseClient } from "@supabase/supabase-js";

import type { JobType, PipelineJob } from "@/lib/types";

type EnqueueJobInput = {
  type: JobType;
  sourceId: string;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
  maxAttempts?: number;
  createdBy?: string;
};

function toJob(data: unknown) {
  return data as PipelineJob;
}

export async function enqueueJob(
  supabase: SupabaseClient,
  { type, sourceId, payload = {}, scheduledAt, maxAttempts = 3, createdBy }: EnqueueJobInput,
) {
  const { data, error } = await supabase.rpc("glassspider_enqueue_job", {
    p_type: type,
    p_source_id: sourceId,
    p_payload: payload,
    p_scheduled_at: scheduledAt ?? new Date().toISOString(),
    p_max_attempts: maxAttempts,
    p_created_by: createdBy ?? null,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: toJob(data), error: undefined };
}

export async function listJobs(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("glassspider_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return { data: [] as PipelineJob[], error: error.message };
  }

  return { data: (data ?? []) as PipelineJob[], error: undefined };
}

export async function retryJob(supabase: SupabaseClient, jobId: string) {
  const { data: job, error: jobError } = await supabase
    .from("glassspider_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("status", "failed")
    .maybeSingle();

  if (jobError || !job) {
    return { data: null, error: jobError?.message ?? "Failed job was not found." };
  }

  const { data, error } = await supabase
    .from("glassspider_jobs")
    .update({
      status: "pending",
      scheduled_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      locked_by: null,
      locked_at: null,
      last_error: null,
    })
    .eq("id", jobId)
    .eq("status", "failed")
    .select("*")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as PipelineJob, error: undefined };
}

export function buildJobPayload(type: JobType, formData: FormData) {
  if (type === "crawl") {
    return {
      entry_urls: formData.getAll("entry_urls").map(String).filter(Boolean),
      max_pages: Number(formData.get("max_pages") ?? 25),
    };
  }

  if (type === "scrape") {
    const urlIds = formData.getAll("url_ids").map(String).filter(Boolean);

    if (urlIds.length > 0) {
      return { url_ids: urlIds };
    }

    return {
      filter: {
        source_id: String(formData.get("source_id") ?? ""),
        status: String(formData.get("url_status") ?? "queued"),
        url_type: String(formData.get("url_type") ?? "detail"),
      },
    };
  }

  const bidRecordIds = formData.getAll("bid_record_ids").map(String).filter(Boolean);

  if (bidRecordIds.length > 0) {
    return { bid_record_ids: bidRecordIds };
  }

  return {
    filter: {
      source_id: String(formData.get("source_id") ?? ""),
      review_status: String(formData.get("review_status") ?? "pending"),
    },
  };
}

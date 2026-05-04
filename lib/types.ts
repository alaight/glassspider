export type SourceStatus = "active" | "paused" | "draft";
export type RunType = "crawl" | "scrape" | "classify";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type ReviewStatus = "pending" | "approved" | "rejected" | "needs_review";
export type JobType = "crawl" | "scrape" | "classify";
export type JobStatus = "pending" | "running" | "completed" | "failed";
export type FetchMode = "static" | "rendered" | "api";

export type RenderedInteractionStep =
  | { type: "click"; selector: string }
  | { type: "fill"; selector: string; value: string }
  | { type: "select"; selector: string; value: string | string[] }
  | { type: "wait_for_selector"; selector: string }
  | { type: "wait_for_timeout"; timeout_ms: number }
  | { type: "wait_for_network_idle" };

export type SourceFetchConfig = {
  rendered?: {
    wait_until?: "load" | "domcontentloaded" | "networkidle";
    wait_for_selector?: string;
    click_selectors?: string[];
    timeout_ms?: number;
    steps?: RenderedInteractionStep[];
    request_capture_limit?: number;
  };
  api?: {
    endpoint?: string | null;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    headers?: Record<string, string>;
    payload?: unknown;
  };
};

export type Source = {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  entry_urls: string[];
  status: SourceStatus;
  fetch_mode: FetchMode;
  fetch_config: SourceFetchConfig;
  crawl_frequency: string | null;
  scrape_frequency: string | null;
  compliance_notes: string | null;
  last_crawled_at: string | null;
  last_scraped_at: string | null;
  created_at: string;
};

export type SourceRule = {
  id: string;
  source_id: string;
  rule_type: "include" | "exclude" | "detail" | "listing";
  pattern: string;
  description: string | null;
  priority: number;
  is_active: boolean;
};

export type PipelineRun = {
  id: string;
  source_id: string | null;
  run_type: RunType;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  pages_visited: number;
  urls_discovered: number;
  records_extracted: number;
  records_updated: number;
  ai_calls: number;
  error_message: string | null;
  created_at: string;
};

export type PipelineJob = {
  id: string;
  type: JobType;
  source_id: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  result: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type DiscoveredUrl = {
  id: string;
  source_id: string;
  url: string;
  url_type: "listing" | "detail" | "award" | "document" | "unknown";
  status: "new" | "queued" | "scraped" | "ignored" | "failed";
  http_status: number | null;
  first_seen_at: string;
  last_seen_at: string;
  last_crawled_at: string | null;
  matched_rule: string | null;
  error_message?: string | null;
};

export type BidRecord = {
  id: string;
  source_id: string | null;
  raw_record_id: string | null;
  source_url: string;
  title: string;
  description: string | null;
  buyer_name: string | null;
  supplier_name: string | null;
  sector_primary: string | null;
  region: string | null;
  contract_value_awarded: number | null;
  currency: string | null;
  published_date: string | null;
  award_date: string | null;
  start_date: string | null;
  end_date: string | null;
  estimated_renewal_date: string | null;
  relevance_score: number | null;
  review_status: ReviewStatus;
  ai_summary: string | null;
  created_at?: string;
};

/** Normalised scraped row (semantic alias — not only procurement). */
export type CanonicalRecord = BidRecord;

export type RawRecord = {
  id: string;
  source_id: string | null;
  discovered_url_id: string | null;
  run_id: string | null;
  source_url: string;
  external_reference: string | null;
  raw_title: string | null;
  raw_text: string;
  raw_metadata: Record<string, unknown>;
  extraction_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type Classification = {
  id: string;
  bid_record_id: string | null;
  raw_record_id: string | null;
  classifier: string;
  prompt_version: string | null;
  labels: string[];
  confidence: number | null;
  output: Record<string, unknown>;
  review_status: ReviewStatus;
  created_at: string;
};

export type RecordWorkspace = {
  record: BidRecord;
  raw: RawRecord | null;
  classifications: Classification[];
};

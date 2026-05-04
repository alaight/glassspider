type DiscoveryMethod = "playwright_network_capture";

type JsonRootType = "array" | "object" | "primitive" | "unknown";

export type EndpointConfidence = "high" | "medium" | "low";

export type EndpointCandidate = {
  source_page_url: string;
  endpoint_url: string;
  method: string;
  status: number | null;
  content_type: string | null;
  request_post_data: unknown;
  preview: string | null;
  record_count_guess: number | null;
  confidence: EndpointConfidence;
  confidence_score: number;
  discovery_method: DiscoveryMethod;
  structure_profile: JsonStructureProfile | null;
  suggested_mapping: SuggestedJsonMapping | null;
  rejection_reasons: string[];
};

export type JsonStructureProfile = {
  root_type: JsonRootType;
  array_length: number | null;
  top_level_keys: string[];
  common_keys: string[];
  nested_keys: string[];
  likely_fields: {
    title: string | null;
    external_id: string | null;
    date: string | null;
    primary_url: string | null;
    image: string | null;
  };
  sample_records: Array<Record<string, unknown>>;
  guessed_fields: Record<string, string>;
  possible_url_fields: string[];
  possible_title_fields: string[];
  possible_date_fields: string[];
  possible_image_fields: string[];
  possible_file_fields: string[];
};

export type SuggestedJsonMapping = {
  record_selector: string;
  fields: Record<string, string>;
  url_fields: Record<string, { base_url: string }>;
};

const URL_HINTS = ["api", "search", "documents", "products", "results", "tenders", "notices", "data"];
const BLOCKED_HINTS = ["analytics", "tracking", "cookie", "consent", "font", "css", "image", "pixel"];
const TITLE_KEYS = ["title", "name", "headline", "label"];
const DATE_KEYS = ["date", "published", "publish", "created", "updated"];
const IMAGE_KEYS = ["image", "thumbnail", "logo", "icon"];
const FILE_KEYS = ["file", "document", "download", "pdf", "attachment", "url"];
const URL_KEYS = ["url", "href", "link", "slug", "path", "download"];

function safeJsonParse(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function flattenObjectKeys(input: unknown, prefix = "", output = new Set<string>()) {
  if (!input || typeof input !== "object") return output;
  if (Array.isArray(input)) {
    for (const item of input.slice(0, 20)) {
      flattenObjectKeys(item, prefix, output);
    }
    return output;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    output.add(path);
    if (value && typeof value === "object") {
      flattenObjectKeys(value, path, output);
    }
  }
  return output;
}

function firstMatchingKey(keys: string[], hints: string[]) {
  return keys.find((key) => hints.some((hint) => key.toLowerCase().includes(hint))) ?? null;
}

function preferNestedKey(keys: string[], preferred: string[]) {
  for (const candidate of preferred) {
    const exact = keys.find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  return null;
}

function isLikelyUrlKey(key: string) {
  const lower = key.toLowerCase();
  return URL_KEYS.some((token) => lower.includes(token));
}

export function profileJsonStructure(payload: unknown): JsonStructureProfile {
  const rootType: JsonRootType = Array.isArray(payload)
    ? "array"
    : payload && typeof payload === "object"
      ? "object"
      : payload === null || payload === undefined
        ? "unknown"
        : "primitive";

  const topLevelKeys =
    rootType === "object" ? Object.keys(payload as Record<string, unknown>).slice(0, 200) : [];

  const arrayRecords: Array<Record<string, unknown>> =
    rootType === "array"
      ? (payload as unknown[]).filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      : [];

  const sampleRecords = arrayRecords.slice(0, 5);
  const nestedKeys = [...flattenObjectKeys(sampleRecords)].slice(0, 300);

  const keyCounts = new Map<string, number>();
  for (const record of sampleRecords) {
    for (const key of Object.keys(record)) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  const commonKeys = [...keyCounts.entries()]
    .filter(([, count]) => count >= Math.max(2, Math.floor(sampleRecords.length * 0.6)))
    .map(([key]) => key)
    .slice(0, 80);

  const candidateKeys = commonKeys.length > 0 ? commonKeys : topLevelKeys;
  const possibleTitleFields = candidateKeys.filter((key) => TITLE_KEYS.some((token) => key.toLowerCase().includes(token)));
  const possibleDateFields = nestedKeys.filter((key) => DATE_KEYS.some((token) => key.toLowerCase().includes(token)));
  const possibleImageFields = nestedKeys.filter((key) => IMAGE_KEYS.some((token) => key.toLowerCase().includes(token)));
  const possibleFileFields = nestedKeys.filter((key) => FILE_KEYS.some((token) => key.toLowerCase().includes(token)));
  const possibleUrlFields = nestedKeys.filter((key) => isLikelyUrlKey(key));

  const guessed_fields: Record<string, string> = {};
  const guessedTitle = firstMatchingKey(possibleTitleFields, TITLE_KEYS) ?? firstMatchingKey(candidateKeys, TITLE_KEYS);
  if (guessedTitle) guessed_fields.title = guessedTitle;
  const guessedId = firstMatchingKey(candidateKeys, ["id", "uuid", "reference"]);
  if (guessedId) guessed_fields.external_id = guessedId;
  const guessedUrl = firstMatchingKey(possibleUrlFields, ["download", "document", "url", "href", "link"]);
  if (guessedUrl) guessed_fields.source_document_url = guessedUrl;
  const guessedDate = firstMatchingKey(possibleDateFields, DATE_KEYS);
  if (guessedDate) guessed_fields.published_date = guessedDate;
  const guessedType = firstMatchingKey(candidateKeys, ["type", "category", "kind"]);
  if (guessedType) guessed_fields.document_type = guessedType;
  const guessedImage = firstMatchingKey(possibleImageFields, IMAGE_KEYS);
  if (guessedImage) guessed_fields.image_url = guessedImage;

  const likelyTitle = preferNestedKey(nestedKeys, ["name", "title", "product.name"]) ?? guessedTitle;
  const likelyId = preferNestedKey(nestedKeys, ["id", "uuid"]) ?? guessedId;
  const likelyDate = preferNestedKey(nestedKeys, ["publishDate", "published_date", "date"]) ?? guessedDate;
  const likelyPrimaryUrl =
    preferNestedKey(nestedKeys, ["url", "downloadUrl", "product.slug", "slug"]) ??
    firstMatchingKey(possibleUrlFields, ["url", "download", "slug", "link"]);
  const likelyImage = preferNestedKey(nestedKeys, ["product.imageUrl", "imageUrl", "image"]) ?? guessedImage;

  return {
    root_type: rootType,
    array_length: Array.isArray(payload) ? payload.length : null,
    top_level_keys: topLevelKeys,
    common_keys: commonKeys,
    nested_keys: nestedKeys,
    likely_fields: {
      title: likelyTitle,
      external_id: likelyId,
      date: likelyDate,
      primary_url: likelyPrimaryUrl,
      image: likelyImage,
    },
    sample_records: sampleRecords,
    guessed_fields,
    possible_url_fields: possibleUrlFields,
    possible_title_fields: possibleTitleFields,
    possible_date_fields: possibleDateFields,
    possible_image_fields: possibleImageFields,
    possible_file_fields: possibleFileFields,
  };
}

export function buildSuggestedMapping(
  profile: JsonStructureProfile,
  options: { baseUrl: string },
): SuggestedJsonMapping | null {
  const { baseUrl } = options;
  if (profile.root_type !== "array") return null;
  const nested = profile.nested_keys;
  const choose = (...candidates: string[]) =>
    candidates
      .map((candidate) => nested.find((item) => item.toLowerCase() === candidate.toLowerCase()) ?? null)
      .find(Boolean) ?? null;

  const fields: Record<string, string> = {};
  const externalId = choose("id", "uuid") ?? profile.guessed_fields.external_id ?? null;
  if (externalId) fields.external_id = `$.${externalId}`;
  const title = choose("name", "title", "product.name") ?? profile.guessed_fields.title ?? null;
  if (title) fields.title = `$.${title}`;
  const documentUrl =
    choose("url", "downloadUrl", "documentUrl") ??
    profile.guessed_fields.source_document_url ??
    profile.likely_fields.primary_url;
  if (documentUrl) {
    fields.document_url = `$.${documentUrl}`;
    fields.source_document_url = `$.${documentUrl}`;
  }
  const primaryUrl = choose("url", "product.slug", "slug", "link") ?? profile.likely_fields.primary_url;
  if (primaryUrl) fields.primary_url = `$.${primaryUrl}`;
  const category = choose("product.category", "category");
  if (category) fields.category = `$.${category}`;
  const productName = choose("product.name", "name");
  if (productName) fields.product_name = `$.${productName}`;
  const recordType = choose("type", "documentType", "kind");
  if (recordType) fields.record_type = `$.${recordType}`;
  const published = choose("publishDate", "published_date", "date");
  if (published) fields.published_date_raw = `$.${published}`;
  const image = choose("product.imageUrl", "imageUrl", "image");
  if (image) fields.image_url = `$.${image}`;
  const detailUrl = choose("product.slug", "slug", "detailUrl", "path");
  if (detailUrl) fields.detail_url = `$.${detailUrl}`;
  fields.raw_json = "$";
  if (Object.keys(fields).length === 0) return null;

  const url_fields: Record<string, { base_url: string }> = {};
  for (const [canonicalField, selector] of Object.entries(fields)) {
    const sourceField = selector.replace(/^\$\./, "");
    if (canonicalField.includes("url") || isLikelyUrlKey(sourceField)) {
      url_fields[canonicalField] = { base_url: baseUrl };
    }
  }

  return {
    record_selector: "$[*]",
    fields,
    url_fields,
  };
}

export function scoreEndpointCandidate(input: {
  sourcePageUrl: string;
  endpointUrl: string;
  method?: string | null;
  status?: number | null;
  contentType?: string | null;
  requestPostData?: unknown;
  preview?: string | null;
}): EndpointCandidate {
  const method = (input.method ?? "GET").toUpperCase();
  const contentType = input.contentType ?? null;
  const preview = input.preview ?? null;
  const endpointLower = input.endpointUrl.toLowerCase();
  const contentTypeLower = (contentType ?? "").toLowerCase();

  const parsedPreview = safeJsonParse(preview);
  const profile = parsedPreview !== null ? profileJsonStructure(parsedPreview) : null;
  const rejection_reasons: string[] = [];
  let score = 0;

  if (contentTypeLower.includes("json")) score += 45;
  if (URL_HINTS.some((token) => endpointLower.includes(token))) score += 20;
  if (profile?.root_type === "array") score += 25;
  if ((profile?.array_length ?? 0) >= 20) score += 10;
  if ((profile?.common_keys.length ?? 0) >= 3) score += 10;

  if (BLOCKED_HINTS.some((token) => endpointLower.includes(token))) {
    score -= 50;
    rejection_reasons.push("looks_like_non_data_endpoint");
  }
  if (input.status && input.status >= 400) {
    score -= 15;
    rejection_reasons.push("http_error_status");
  }
  if (profile?.root_type === "object" && (profile.top_level_keys.length <= 3 || (preview?.length ?? 0) < 300)) {
    score -= 20;
    rejection_reasons.push("small_config_json_shape");
  }
  if ((preview?.length ?? 0) < 120) {
    score -= 10;
    rejection_reasons.push("very_small_preview");
  }

  const bounded = Math.max(0, Math.min(100, score));
  const confidence: EndpointConfidence = bounded >= 70 ? "high" : bounded >= 40 ? "medium" : "low";
  const pageOrigin = new URL(input.sourcePageUrl).origin;
  const suggested_mapping = profile ? buildSuggestedMapping(profile, { baseUrl: pageOrigin }) : null;

  return {
    source_page_url: input.sourcePageUrl,
    endpoint_url: input.endpointUrl,
    method,
    status: input.status ?? null,
    content_type: contentType,
    request_post_data: input.requestPostData ?? null,
    preview,
    record_count_guess: profile?.array_length ?? null,
    confidence,
    confidence_score: bounded,
    discovery_method: "playwright_network_capture",
    structure_profile: profile,
    suggested_mapping,
    rejection_reasons,
  };
}

export async function hydrateEndpointCandidate(
  candidate: EndpointCandidate,
  {
    fetchJson,
    maxPreviewChars = 1500,
  }: {
    fetchJson: (args: { url: string; method: string; requestPostData: unknown }) => Promise<unknown>;
    maxPreviewChars?: number;
  },
): Promise<EndpointCandidate> {
  try {
    const payload = await fetchJson({
      url: candidate.endpoint_url,
      method: candidate.method,
      requestPostData: candidate.request_post_data,
    });
    const profile = profileJsonStructure(payload);
    const suggested = buildSuggestedMapping(profile, { baseUrl: new URL(candidate.source_page_url).origin });
    return {
      ...candidate,
      preview: JSON.stringify(payload).slice(0, maxPreviewChars),
      record_count_guess: profile.array_length ?? candidate.record_count_guess,
      structure_profile: profile,
      suggested_mapping: suggested,
      confidence_score: Math.max(candidate.confidence_score, profile.root_type === "array" ? 80 : candidate.confidence_score),
      confidence: profile.root_type === "array" ? "high" : candidate.confidence,
    };
  } catch {
    return candidate;
  }
}

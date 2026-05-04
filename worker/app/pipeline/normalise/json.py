from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from urllib.parse import urljoin


def _extract_path(value: Any, path: str) -> Any:
    trimmed = path.strip()
    if trimmed in {"$", ""}:
        return value
    if not trimmed.startswith("$."):
        return None
    current = value
    for part in trimmed[2:].split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _record_selector(data: Any, selector: str) -> list[dict[str, Any]]:
    value = selector.strip() or "$[*]"
    if value == "$[*]":
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        return []
    selected = _extract_path(data, value)
    if isinstance(selected, list):
        return [row for row in selected if isinstance(row, dict)]
    if isinstance(selected, dict):
        return [selected]
    return []


def _coerce_url(value: Any, base_url: str | None) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return text
    if text.startswith(("http://", "https://")):
        return text
    if base_url:
        return urljoin(base_url, text)
    return text


def _coerce_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%d/%m/%Y"):
        try:
            return datetime.strptime(text.replace("Z", ""), fmt).date().isoformat()
        except ValueError:
            continue
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    return None


def _extract_mapped_fields(record: dict[str, Any], mapping: dict[str, str], url_fields: dict[str, Any]) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for canonical_field, selector in mapping.items():
        if not isinstance(selector, str):
            continue
        value = _extract_path(record, selector)
        if canonical_field in url_fields and isinstance(url_fields[canonical_field], dict):
            value = _coerce_url(value, str(url_fields[canonical_field].get("base_url") or "").strip() or None)
        output[canonical_field] = value
    return output


def normalise_records_from_json_mapping(
    *,
    source_url: str,
    payload: Any,
    extraction_config: dict[str, Any],
) -> list[dict[str, dict[str, Any]]]:
    selector = str(extraction_config.get("record_selector") or "$[*]")
    field_mapping_raw = extraction_config.get("field_mapping", extraction_config.get("fields", {}))
    field_mapping = field_mapping_raw if isinstance(field_mapping_raw, dict) else {}
    url_fields_raw = extraction_config.get("url_fields", {})
    url_fields = url_fields_raw if isinstance(url_fields_raw, dict) else {}
    if not field_mapping:
        return []

    records = _record_selector(payload, selector)
    normalised: list[dict[str, dict[str, Any]]] = []
    for record in records:
        mapped = _extract_mapped_fields(record, field_mapping, url_fields)
        title = str(mapped.get("title") or mapped.get("name") or "Untitled record")
        source_document_url = (
            mapped.get("source_document_url")
            or mapped.get("document_url")
            or mapped.get("primary_url")
            or mapped.get("download_url")
            or mapped.get("detail_url")
            or source_url
        )
        published_date = mapped.get("published_date") or _coerce_date(mapped.get("published_date_raw"))
        description = mapped.get("description")
        if not isinstance(description, str) or not description.strip():
            description = json.dumps(record, default=str)[:4000]

        review_status = "needs_review"
        normalised.append(
            {
                "raw": {
                    "source_url": str(source_document_url),
                    "external_reference": str(mapped.get("external_id")) if mapped.get("external_id") is not None else None,
                    "raw_title": title[:500],
                    "raw_text": json.dumps(record, default=str)[:100000],
                    "raw_metadata": {
                        "extracted_by": "python-json-mapper-v1",
                        "field_mapping": field_mapping,
                        "mapped_fields": mapped,
                    },
                    "content_hash": None,
                    "extraction_status": review_status,
                },
                "bid": {
                    "source_url": str(source_document_url),
                    "title": title[:500],
                    "description": str(description)[:4000],
                    "buyer_name": mapped.get("buyer_name"),
                    "supplier_name": mapped.get("supplier_name"),
                    "sector_primary": mapped.get("category") or mapped.get("sector_primary"),
                    "region": mapped.get("region"),
                    "contract_value_awarded": mapped.get("contract_value_awarded"),
                    "currency": mapped.get("currency"),
                    "published_date": published_date if isinstance(published_date, str) else None,
                    "award_date": _coerce_date(mapped.get("award_date_raw")) or mapped.get("award_date"),
                    "start_date": _coerce_date(mapped.get("start_date_raw")) or mapped.get("start_date"),
                    "end_date": _coerce_date(mapped.get("end_date_raw")) or mapped.get("end_date"),
                    "estimated_renewal_date": _coerce_date(mapped.get("estimated_renewal_date_raw"))
                    or mapped.get("estimated_renewal_date"),
                    "relevance_score": None,
                    "review_status": review_status,
                    "ai_summary": None,
                },
            }
        )
    return normalised

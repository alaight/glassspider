import logging
import re
import asyncio
import json
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup
from supabase import Client

from app.config import get_settings
from app.models import Job
from app.pipeline.fetchers import (
    fetch_with_mode,
    resolve_fetch_config,
    resolve_fetch_mode,
    serialise_json_preview,
)
from app.pipeline.normalise.html import normalise_record_from_html
from app.pipeline.normalise.json import normalise_records_from_json_mapping

logger = logging.getLogger(__name__)

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_scoped_urls(db: Client, job: Job) -> list[dict]:
    url_ids = job.payload.get("url_ids")

    if isinstance(url_ids, list) and url_ids:
        return (
            db.table("glassspider_discovered_urls")
            .select("*")
            .eq("source_id", job.source_id)
            .in_("id", url_ids)
            .execute()
            .data
            or []
        )

    filter_payload = job.payload.get("filter")

    if not isinstance(filter_payload, dict):
        raise ValueError("Scrape job requires payload.url_ids or payload.filter.")

    query = db.table("glassspider_discovered_urls").select("*").eq("source_id", job.source_id)

    for key in ("status", "url_type", "matched_rule"):
        value = filter_payload.get(key)
        if value:
            query = query.eq(key, value)

    limit = int(filter_payload.get("limit") or 100)
    return query.limit(limit).execute().data or []


def _resolve_declared_api_config(fetch_config: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    declared_api_config = fetch_config.get("declared_api")
    if not isinstance(declared_api_config, dict):
        legacy_api_cfg = fetch_config.get("api")
        declared_api_config = legacy_api_cfg if isinstance(legacy_api_cfg, dict) else {}

    extraction_mapping = source.get("extraction_mapping")
    if isinstance(extraction_mapping, dict) and extraction_mapping:
        merged = dict(declared_api_config)
        merged["field_mapping"] = extraction_mapping
        declared_api_config = merged
    return declared_api_config


def _slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _host_key(base_url: str) -> str:
    host = base_url.split("//")[-1].split("/")[0].lower()
    return host.replace(".", "-") or "source"


def _build_product_group_key(
    *,
    base_url: str,
    product_slug: str | None,
    product_name: str | None,
    product_category: str | None,
) -> str | None:
    if product_slug:
        slug = _slugify(product_slug.replace("/", " "))
        if slug:
            return f"{_host_key(base_url)}:{slug}"
    combined = " ".join([part for part in [product_name, product_category] if part]).strip()
    if not combined:
        return None
    return f"{_host_key(base_url)}:{_slugify(combined)}"


def _extract_field_pairs(soup: BeautifulSoup) -> dict[str, str]:
    fields: dict[str, str] = {}
    for row in soup.select("table tr"):
        key_node = row.find(["th", "td"])
        value_node = key_node.find_next_sibling("td") if key_node else None
        if not key_node or not value_node:
            continue
        key = key_node.get_text(" ", strip=True)
        value = value_node.get_text(" ", strip=True)
        if key and value:
            fields[_slugify(key).replace("-", "_")] = value[:1000]
    for dt in soup.select("dl dt"):
        dd = dt.find_next_sibling("dd")
        key = dt.get_text(" ", strip=True)
        value = dd.get_text(" ", strip=True) if dd else ""
        if key and value:
            fields[_slugify(key).replace("-", "_")] = value[:1000]
    for item in soup.select("li"):
        text = item.get_text(" ", strip=True)
        if ":" not in text or len(text) > 250:
            continue
        key, value = [part.strip() for part in text.split(":", 1)]
        if key and value and len(key) < 80:
            fields.setdefault(_slugify(key).replace("-", "_"), value[:1000])
    return fields


def _extract_sections(soup: BeautifulSoup) -> list[dict[str, str]]:
    sections: list[dict[str, str]] = []
    for heading in soup.select("h2, h3"):
        heading_text = heading.get_text(" ", strip=True)
        if not heading_text:
            continue
        text_parts: list[str] = []
        cursor = heading.find_next_sibling()
        steps = 0
        while cursor is not None and steps < 8:
            if getattr(cursor, "name", "") in {"h2", "h3"}:
                break
            chunk = cursor.get_text(" ", strip=True)
            if chunk:
                text_parts.append(chunk)
            cursor = cursor.find_next_sibling()
            steps += 1
        if text_parts:
            sections.append({"heading": heading_text[:200], "text": " ".join(text_parts)[:3000]})
    return sections[:30]


def _parse_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return {}
    text = value.strip()
    if not text or not text.startswith("{"):
        return {}
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _find_existing_product_bucket_key(
    *,
    grouped: dict[str, dict[str, Any]],
    product_page_url: str | None,
    group_key: str | None,
) -> str | None:
    for key, bucket in grouped.items():
        bucket_page = bucket.get("product_page_url")
        bucket_group = bucket.get("group_key")
        if product_page_url and bucket_page and str(bucket_page) == product_page_url:
            return key
        if group_key and bucket_group and str(bucket_group) == group_key:
            return key
    return None


def _upsert_normalised_record(
    *,
    db: Client,
    job: Job,
    normalised: dict[str, dict[str, Any]],
    discovered_url_id: str | None,
    fetch_mode: str,
    result: Any,
) -> tuple[int, int]:
    existing_metadata = normalised["raw"].get("raw_metadata")
    metadata_payload = existing_metadata if isinstance(existing_metadata, dict) else {}
    metadata_payload["fetch"] = {
        "mode": fetch_mode,
        "url": result.url,
        "final_url": result.final_url,
        "status_code": result.status_code,
        "content_type": result.content_type,
        "discovered_requests_count": len(result.discovered_requests),
        "metadata": result.metadata,
    }
    if result.discovered_requests:
        metadata_payload["fetch"]["discovered_requests"] = result.discovered_requests[:20]
    normalised["raw"]["raw_metadata"] = metadata_payload

    raw_record = (
        db.table("glassspider_raw_records")
        .insert(
            {
                **normalised["raw"],
                "source_id": job.source_id,
                "discovered_url_id": discovered_url_id,
                "run_id": None,
            }
        )
        .execute()
        .data[0]
    )

    canonical_record = normalised.get("record") if isinstance(normalised.get("record"), dict) else {}
    record_source_url = str(canonical_record.get("source_url") or normalised["raw"].get("source_url") or "")
    record_title = str(canonical_record.get("title") or normalised["bid"].get("title") or "Untitled record")
    record_extracted = canonical_record.get("extracted") if isinstance(canonical_record.get("extracted"), dict) else {}
    record_raw = canonical_record.get("raw") if isinstance(canonical_record.get("raw"), dict) else {}
    record_payload = {
        "source_id": job.source_id,
        "raw_record_id": raw_record["id"],
        "record_type": str(canonical_record.get("record_type") or "generic"),
        "source_url": record_source_url,
        "external_reference": canonical_record.get("external_reference"),
        "title": record_title[:500],
        "summary": str(canonical_record.get("summary"))[:4000] if canonical_record.get("summary") else None,
        "category": str(canonical_record.get("category"))[:240] if canonical_record.get("category") else None,
        "subcategory": str(canonical_record.get("subcategory"))[:240] if canonical_record.get("subcategory") else None,
        "primary_url": str(canonical_record.get("primary_url")) if canonical_record.get("primary_url") else None,
        "image_url": str(canonical_record.get("image_url")) if canonical_record.get("image_url") else None,
        "published_date": canonical_record.get("published_date"),
        "extracted": record_extracted,
        "raw": record_raw,
        "review_status": str(canonical_record.get("review_status") or normalised["bid"].get("review_status") or "needs_review"),
    }
    db.table("glassspider_records").upsert(
        record_payload,
        on_conflict="source_id,record_type,source_url",
    ).execute()

    source_url = str(normalised["bid"].get("source_url") or normalised["raw"].get("source_url") or record_source_url)
    existing_bid = (
        db.table("glassspider_bid_records")
        .select("id")
        .eq("source_url", source_url)
        .limit(1)
        .execute()
        .data
        or []
    )
    created = 0 if existing_bid else 1
    updated = 1 if existing_bid else 0

    db.table("glassspider_bid_records").upsert(
        {
            **normalised["bid"],
            "source_id": job.source_id,
            "raw_record_id": raw_record["id"],
        },
        on_conflict="source_url",
    ).execute()
    return created, updated


async def _run_declared_api_extraction(
    *,
    db: Client,
    job: Job,
    source: dict[str, Any],
    fetch_mode: str,
    fetch_config: dict[str, Any],
) -> dict[str, Any]:
    settings = get_settings()
    declared_api_config = _resolve_declared_api_config(fetch_config, source)
    endpoint = str(
        job.payload.get("endpoint")
        or declared_api_config.get("endpoint")
        or source.get("base_url")
        or ""
    )
    method = str(job.payload.get("method") or declared_api_config.get("method") or "GET").upper()
    if not endpoint:
        raise ValueError("Declared API extraction requires an endpoint.")

    merged_fetch_config = dict(fetch_config)
    declared = dict(declared_api_config)
    declared["endpoint"] = endpoint
    declared["method"] = method
    merged_fetch_config["declared_api"] = declared

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        result = await fetch_with_mode(
            mode="declared_api",
            url=source.get("base_url") or endpoint,
            client=client,
            user_agent=settings.glassspider_worker_user_agent,
            source_config=merged_fetch_config,
        )

    extraction_config = {
        "record_selector": declared.get("record_selector") or "$[*]",
        "field_mapping": declared.get("field_mapping") if isinstance(declared.get("field_mapping"), dict) else {},
        "url_fields": declared.get("url_fields") if isinstance(declared.get("url_fields"), dict) else {},
        "base_url": source.get("base_url") or endpoint,
    }
    mapped_records: list[dict[str, dict[str, Any]]] = []
    if result.json_data is not None:
        mapped_records = normalise_records_from_json_mapping(
            source_url=endpoint,
            payload=result.json_data,
            extraction_config=extraction_config,
        )

    records_seen = len(mapped_records)
    records_extracted = 0
    records_created = 0
    records_updated = 0
    records_skipped = 0

    for normalised in mapped_records:
        canonical_record = normalised.get("record") if isinstance(normalised.get("record"), dict) else {}
        source_url = str(
            canonical_record.get("source_url")
            or normalised["bid"].get("source_url")
            or normalised["raw"].get("source_url")
            or ""
        )
        if not source_url:
            records_skipped += 1
            continue
        created, updated = _upsert_normalised_record(
            db=db,
            job=job,
            normalised=normalised,
            discovered_url_id=None,
            fetch_mode=fetch_mode,
            result=result,
        )
        records_extracted += 1
        records_created += created
        records_updated += updated

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()
    return {
        "records_seen": records_seen,
        "records_extracted": records_extracted,
        "records_created": records_created,
        "records_updated": records_updated,
        "records_skipped": records_skipped,
        "mode": "declared_api",
        "endpoint": endpoint,
        "fetch_mode": fetch_mode,
    }


def _extract_product_from_document_row(
    *,
    row: dict[str, Any],
    source_base_url: str,
) -> dict[str, Any] | None:
    extracted = row.get("extracted") if isinstance(row.get("extracted"), dict) else {}
    product_page_url = extracted.get("product_page_url") if isinstance(extracted.get("product_page_url"), str) else None
    product_name = extracted.get("product_name") if isinstance(extracted.get("product_name"), str) else None
    product_category = extracted.get("product_category") if isinstance(extracted.get("product_category"), str) else None
    product_slug = extracted.get("product_slug") if isinstance(extracted.get("product_slug"), str) else None
    if not product_page_url and product_slug:
        product_page_url = urljoin(source_base_url, product_slug)
    key = _build_product_group_key(
        base_url=source_base_url,
        product_slug=product_slug,
        product_name=product_name,
        product_category=product_category,
    )
    if not product_page_url and not key:
        return None
    return {
        "group_key": key or product_page_url,
        "product_page_url": product_page_url,
        "product_name": product_name,
        "product_category": product_category,
        "product_slug": product_slug,
        "product_image_url": extracted.get("product_image_url"),
        "document": {
            "id": row.get("id"),
            "title": row.get("title"),
            "document_type": extracted.get("document_type") or extracted.get("record_type"),
            "document_url": row.get("source_url"),
            "published_date_raw": extracted.get("published_date_raw") or row.get("published_date"),
        },
    }


def _extract_product_from_bid_row(
    *,
    row: dict[str, Any],
    source_base_url: str,
) -> dict[str, Any] | None:
    payload = _parse_json_object(row.get("description"))
    product_obj = payload.get("product") if isinstance(payload.get("product"), dict) else {}
    product_slug = product_obj.get("slug") if isinstance(product_obj.get("slug"), str) else None
    product_page_url = urljoin(source_base_url, product_slug) if product_slug else None
    product_name = (
        product_obj.get("name") if isinstance(product_obj.get("name"), str) else row.get("supplier_name")
    )
    product_category = (
        product_obj.get("category") if isinstance(product_obj.get("category"), str) else row.get("sector_primary")
    )
    product_image_url = product_obj.get("imageUrl") if isinstance(product_obj.get("imageUrl"), str) else None
    key = _build_product_group_key(
        base_url=source_base_url,
        product_slug=product_slug,
        product_name=str(product_name) if isinstance(product_name, str) else None,
        product_category=str(product_category) if isinstance(product_category, str) else None,
    )
    if not product_page_url and not key:
        return None
    return {
        "group_key": key or product_page_url,
        "product_page_url": product_page_url,
        "product_name": product_name,
        "product_category": product_category,
        "product_slug": product_slug,
        "product_image_url": product_image_url,
        "document": {
            "id": row.get("id"),
            "title": row.get("title"),
            "document_type": row.get("notice_type"),
            "document_url": row.get("source_url"),
            "published_date_raw": row.get("published_date"),
        },
    }


def _extract_product_page_payload(
    *,
    base_url: str,
    page_url: str,
    html: str,
    fallback_name: str | None,
    fallback_category: str | None,
    fallback_image_url: str | None,
    product_group_key: str,
    linked_documents: list[dict[str, Any]],
    fetched_via: str,
) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    title_node = soup.select_one("h1")
    page_title = title_node.get_text(" ", strip=True) if title_node else ""
    if not page_title and soup.title:
        page_title = soup.title.get_text(" ", strip=True)
    page_title = page_title or fallback_name or "Untitled product"

    meta_description = ""
    meta_node = soup.select_one('meta[name="description"]')
    if meta_node and meta_node.get("content"):
        meta_description = str(meta_node.get("content")).strip()

    description = ""
    main_node = soup.select_one("main")
    if main_node:
        paragraphs = [node.get_text(" ", strip=True) for node in main_node.select("p")]
        text_chunks = [chunk for chunk in paragraphs if len(chunk) > 80]
        description = " ".join(text_chunks[:4])[:5000]
    if not description:
        description = meta_description

    image_urls: list[str] = []
    for image in soup.select("img[src]"):
        src = str(image.get("src") or "").strip()
        if not src:
            continue
        absolute = urljoin(page_url, src)
        if absolute not in image_urls:
            image_urls.append(absolute)
    if fallback_image_url and fallback_image_url not in image_urls:
        image_urls.insert(0, fallback_image_url)

    fields = _extract_field_pairs(soup)
    sections = _extract_sections(soup)
    pdf_links = []
    for anchor in soup.select("a[href]"):
        href = str(anchor.get("href") or "").strip()
        if not href.lower().endswith(".pdf"):
            continue
        url = urljoin(page_url, href)
        if any(item.get("document_url") == url for item in pdf_links):
            continue
        pdf_links.append(
            {
                "title": anchor.get_text(" ", strip=True)[:300] or url,
                "document_type": "linked_document",
                "document_url": url,
                "published_date_raw": None,
            }
        )

    combined_documents: list[dict[str, Any]] = []
    for document in linked_documents:
        if not isinstance(document, dict):
            continue
        item = {
            "title": document.get("title"),
            "document_type": document.get("document_type"),
            "document_url": document.get("document_url"),
            "published_date_raw": document.get("published_date_raw"),
        }
        if not isinstance(item["document_url"], str) or not item["document_url"]:
            continue
        if any(existing.get("document_url") == item["document_url"] for existing in combined_documents):
            continue
        combined_documents.append(item)
    for candidate in pdf_links:
        if not any(doc.get("document_url") == candidate.get("document_url") for doc in combined_documents):
            combined_documents.append(candidate)

    raw_text = soup.get_text(" ", strip=True)
    raw_text = re.sub(r"\s+", " ", raw_text)
    product_category = fields.get("category") or fallback_category

    return {
        "record_type": "product",
        "source_url": page_url,
        "title": page_title[:500],
        "summary": description[:4000] if description else None,
        "category": product_category[:240] if isinstance(product_category, str) else None,
        "primary_url": page_url,
        "image_url": (image_urls[0] if image_urls else None),
        "extracted": {
            "record_type": "product",
            "product_group_key": product_group_key,
            "product_name": page_title,
            "product_category": product_category,
            "product_page_url": page_url,
            "product_image_urls": image_urls[:20],
            "primary_image_url": image_urls[0] if image_urls else None,
            "meta_description": meta_description[:2000] if meta_description else None,
            "description": description[:5000] if description else None,
            "sections": sections,
            "fields": fields,
            "documents": combined_documents,
            "provenance": {
                "base_url": base_url,
                "source_url": page_url,
                "fetched_at": _now(),
                "fetched_via": fetched_via,
                "reuse_status": "internal_only",
            },
        },
        "raw": {
            "raw_text": raw_text[:120000],
            "raw_html": html[:180000],
            "fields": fields,
        },
    }


async def _run_hydrate_product_pages(
    *,
    db: Client,
    job: Job,
    source: dict[str, Any],
    fetch_config: dict[str, Any],
) -> dict[str, Any]:
    limit = int(job.payload.get("limit") or 25)
    source_base_url = str(source.get("base_url") or "")
    document_rows = (
        db.table("glassspider_records")
        .select("id,title,source_url,published_date,extracted")
        .eq("source_id", job.source_id)
        .eq("record_type", "product_document")
        .order("updated_at", desc=True)
        .limit(5000)
        .execute()
        .data
        or []
    )
    records_scanned = len(document_rows)
    grouped: dict[str, dict[str, Any]] = {}
    for row in document_rows:
        product = _extract_product_from_document_row(row=row, source_base_url=source_base_url)
        if not product:
            continue
        product_page_url = str(product.get("product_page_url") or "") or None
        group_key = str(product.get("group_key") or "") or None
        existing_key = _find_existing_product_bucket_key(
            grouped=grouped,
            product_page_url=product_page_url,
            group_key=group_key,
        )
        key = existing_key or str(product_page_url or group_key or "")
        if not key:
            continue
        bucket = grouped.get(key)
        if not bucket:
            grouped[key] = {
                "group_key": group_key or key,
                "product_page_url": product.get("product_page_url"),
                "product_name": product.get("product_name"),
                "product_category": product.get("product_category"),
                "product_slug": product.get("product_slug"),
                "product_image_url": product.get("product_image_url"),
                "documents": [],
                "record_ids": [],
            }
            bucket = grouped[key]
        if product.get("product_page_url") and not bucket.get("product_page_url"):
            bucket["product_page_url"] = product.get("product_page_url")
        if product["document"].get("id"):
            bucket["record_ids"].append(product["document"]["id"])
        if not any(item.get("document_url") == product["document"].get("document_url") for item in bucket["documents"]):
            bucket["documents"].append(product["document"])

    if not grouped:
        logger.warning(
            "hydrate_product_pages found no product URLs in glassspider_records extracted JSON source_id=%s hint=%s",
            job.source_id,
            "No product_page_url found in extracted JSON",
        )
        fallback_rows = (
            db.table("glassspider_bid_records")
            .select("id,title,source_url,notice_type,supplier_name,sector_primary,description")
            .eq("source_id", job.source_id)
            .order("updated_at", desc=True)
            .limit(5000)
            .execute()
            .data
            or []
        )
        records_scanned += len(fallback_rows)
        for row in fallback_rows:
            product = _extract_product_from_bid_row(row=row, source_base_url=source_base_url)
            if not product:
                continue
            product_page_url = str(product.get("product_page_url") or "") or None
            group_key = str(product.get("group_key") or "") or None
            existing_key = _find_existing_product_bucket_key(
                grouped=grouped,
                product_page_url=product_page_url,
                group_key=group_key,
            )
            key = existing_key or str(product_page_url or group_key or "")
            if not key:
                continue
            bucket = grouped.get(key)
            if not bucket:
                grouped[key] = {
                    "group_key": group_key or key,
                    "product_page_url": product.get("product_page_url"),
                    "product_name": product.get("product_name"),
                    "product_category": product.get("product_category"),
                    "product_slug": product.get("product_slug"),
                    "product_image_url": product.get("product_image_url"),
                    "documents": [],
                    "record_ids": [],
                }
                bucket = grouped[key]
            if product.get("product_page_url") and not bucket.get("product_page_url"):
                bucket["product_page_url"] = product.get("product_page_url")
            if not any(item.get("document_url") == product["document"].get("document_url") for item in bucket["documents"]):
                bucket["documents"].append(product["document"])

    products = [value for value in grouped.values() if value.get("product_page_url")][: max(limit, 1)]
    sample_product_urls = [str(value.get("product_page_url")) for value in products[:5]]
    logger.info(
        "hydrate_product_pages source=%s records_scanned=%s product_urls_found=%s sample_urls=%s",
        job.source_id,
        records_scanned,
        len(grouped),
        sample_product_urls,
    )
    if not products:
        logger.warning(
            "hydrate_product_pages no products to fetch source_id=%s hint=%s",
            job.source_id,
            "No product_page_url found in extracted JSON",
        )
        return {
            "mode": "hydrate_product_pages",
            "products_seen": len(grouped),
            "records_scanned": records_scanned,
            "product_urls_found": len(grouped),
            "sample_product_urls": sample_product_urls,
            "warning": "No product_page_url found in extracted JSON",
            "products_fetched": 0,
            "products_created": 0,
            "products_updated": 0,
            "products_failed": 0,
            "documents_linked": len(document_rows),
        }

    settings = get_settings()
    products_fetched = 0
    products_created = 0
    products_updated = 0
    products_failed = 0
    documents_linked = 0
    documents_linked_by_product: list[dict[str, Any]] = []

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=35,
        follow_redirects=True,
    ) as client:
        for product in products:
            page_url = str(product.get("product_page_url") or "")
            if not page_url:
                products_failed += 1
                continue
            try:
                static_result = await fetch_with_mode(
                    mode="static_html",
                    url=page_url,
                    client=client,
                    user_agent=settings.glassspider_worker_user_agent,
                    source_config=fetch_config,
                )
                html = static_result.html or static_result.text or ""
                fetched_via = "static_html"
                if len(html) < 1000 or "<script" in html and "application/json" in html and not BeautifulSoup(html, "html.parser").select_one("h1"):
                    rendered_result = await fetch_with_mode(
                        mode="rendered_html",
                        url=page_url,
                        client=client,
                        user_agent=settings.glassspider_worker_user_agent,
                        source_config=fetch_config,
                    )
                    html = rendered_result.html or rendered_result.text or html
                    fetched_via = "rendered_html"
                if not html:
                    raise ValueError("Product page returned no HTML.")

                payload = _extract_product_page_payload(
                    base_url=source_base_url,
                    page_url=page_url,
                    html=html,
                    fallback_name=str(product.get("product_name") or "") or None,
                    fallback_category=str(product.get("product_category") or "") or None,
                    fallback_image_url=str(product.get("product_image_url") or "") or None,
                    product_group_key=str(product["group_key"]),
                    linked_documents=product.get("documents") if isinstance(product.get("documents"), list) else [],
                    fetched_via=fetched_via,
                )
                linked_documents = payload["extracted"].get("documents")
                linked_count = len(linked_documents) if isinstance(linked_documents, list) else 0
                documents_linked += linked_count
                if len(documents_linked_by_product) < 25:
                    documents_linked_by_product.append(
                        {
                            "product_page_url": page_url,
                            "product_group_key": str(product["group_key"]),
                            "documents_linked": linked_count,
                        }
                    )
                raw_record = (
                    db.table("glassspider_raw_records")
                    .insert(
                        {
                            "source_id": job.source_id,
                            "discovered_url_id": None,
                            "run_id": None,
                            "source_url": page_url,
                            "external_reference": str(product["group_key"]),
                            "raw_title": payload["title"],
                            "raw_text": str(payload["raw"].get("raw_text") or ""),
                            "raw_metadata": {
                                "kind": "product_hydration",
                                "product_group_key": product["group_key"],
                                "documents": payload["extracted"].get("documents"),
                                "provenance": payload["extracted"].get("provenance"),
                            },
                            "content_hash": None,
                            "extraction_status": "needs_review",
                        }
                    )
                    .execute()
                    .data[0]
                )
                existing = (
                    db.table("glassspider_records")
                    .select("id")
                    .eq("source_id", job.source_id)
                    .eq("record_type", "product")
                    .eq("source_url", page_url)
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                db.table("glassspider_records").upsert(
                    {
                        "source_id": job.source_id,
                        "raw_record_id": raw_record["id"],
                        "record_type": "product",
                        "source_url": page_url,
                        "external_reference": str(product["group_key"]),
                        "title": payload["title"],
                        "summary": payload["summary"],
                        "category": payload["category"],
                        "primary_url": page_url,
                        "image_url": payload["image_url"],
                        "published_date": None,
                        "extracted": payload["extracted"],
                        "raw": payload["raw"],
                        "review_status": "needs_review",
                    },
                    on_conflict="source_id,record_type,source_url",
                ).execute()
                for record_id in product.get("record_ids", []):
                    rows = (
                        db.table("glassspider_records")
                        .select("extracted")
                        .eq("id", record_id)
                        .limit(1)
                        .execute()
                        .data
                        or []
                    )
                    row = rows[0] if rows else {}
                    existing_extracted = row.get("extracted") if isinstance(row, dict) and isinstance(row.get("extracted"), dict) else {}
                    merged_extracted = {
                        **existing_extracted,
                        "product_group_key": product["group_key"],
                        "product_page_url": page_url,
                        "linked_product_record_url": page_url,
                    }
                    db.table("glassspider_records").update({"extracted": merged_extracted}).eq("id", record_id).execute()
                products_fetched += 1
                if existing:
                    products_updated += 1
                else:
                    products_created += 1
            except Exception:
                logger.exception("Product hydration failed source=%s product_url=%s", job.source_id, page_url)
                products_failed += 1
            await asyncio.sleep(0.35)

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()
    return {
        "mode": "hydrate_product_pages",
        "products_seen": len(grouped),
        "records_scanned": records_scanned,
        "product_urls_found": len(grouped),
        "sample_product_urls": sample_product_urls,
        "products_fetched": products_fetched,
        "products_created": products_created,
        "products_updated": products_updated,
        "products_failed": products_failed,
        "documents_linked": documents_linked,
        "documents_linked_by_product": documents_linked_by_product[:5],
    }


async def _run_url_map_extraction(
    *,
    db: Client,
    job: Job,
    source: dict[str, Any],
    fetch_mode: str,
    fetch_config: dict[str, Any],
) -> dict[str, Any]:
    urls = _load_scoped_urls(db, job)
    if not urls:
        return {"records_extracted": 0, "records_updated": 0, "fetch_mode": fetch_mode}

    settings = get_settings()
    declared_api_config = _resolve_declared_api_config(fetch_config, source)
    records_extracted = 0
    records_updated = 0
    records_created = 0

    async with httpx.AsyncClient(
        headers={"user-agent": settings.glassspider_worker_user_agent},
        timeout=30,
        follow_redirects=True,
    ) as client:
        for url in urls:
            try:
                result = await fetch_with_mode(
                    mode=fetch_mode,
                    url=url["url"],
                    client=client,
                    user_agent=settings.glassspider_worker_user_agent,
                    source_config=fetch_config,
                )
                mapped_records: list[dict[str, dict[str, Any]]] = []
                if result.json_data is not None and declared_api_config:
                    mapped_records = normalise_records_from_json_mapping(
                        source_url=url["url"],
                        payload=result.json_data,
                        extraction_config=declared_api_config,
                    )

                if not mapped_records:
                    html_input = result.html or result.text or ""
                    if not html_input and result.json_data is not None:
                        html_input = serialise_json_preview(result.json_data)
                    mapped_records = [normalise_record_from_html(url["url"], html_input)]

                for normalised in mapped_records:
                    created, updated = _upsert_normalised_record(
                        db=db,
                        job=job,
                        normalised=normalised,
                        discovered_url_id=url["id"],
                        fetch_mode=fetch_mode,
                        result=result,
                    )
                    records_extracted += 1
                    records_updated += updated
                    records_created += created

                db.table("glassspider_discovered_urls").update(
                    {
                        "status": "scraped",
                        "http_status": result.status_code,
                        "last_crawled_at": _now(),
                    }
                ).eq("id", url["id"]).execute()
                logger.info(
                    "Scrape fetched url=%s mode=%s status=%s requests=%s",
                    url["url"],
                    fetch_mode,
                    result.status_code,
                    len(result.discovered_requests),
                )
            except Exception as exc:
                logger.warning("Scrape failed url=%s mode=%s error=%s", url["url"], fetch_mode, exc)
                db.table("glassspider_discovered_urls").update(
                    {"status": "failed", "error_message": str(exc)}
                ).eq("id", url["id"]).execute()

    db.table("glassspider_sources").update({"last_scraped_at": _now()}).eq("id", job.source_id).execute()
    return {
        "records_extracted": records_extracted,
        "records_updated": records_updated,
        "records_created": records_created,
        "fetch_mode": fetch_mode,
    }


async def run_scrape_job(db: Client, job: Job) -> dict[str, Any]:
    source = (
        db.table("glassspider_sources")
        .select("*")
        .eq("id", job.source_id)
        .single()
        .execute()
        .data
    )
    fetch_mode = resolve_fetch_mode(source, job.payload)
    fetch_config = resolve_fetch_config(source, job.payload)
    mode = str(job.payload.get("mode") or "").lower()
    if mode == "hydrate_product_pages":
        return await _run_hydrate_product_pages(
            db=db,
            job=job,
            source=source,
            fetch_config=fetch_config,
        )
    if fetch_mode == "declared_api" or mode == "declared_api":
        return await _run_declared_api_extraction(
            db=db,
            job=job,
            source=source,
            fetch_mode=fetch_mode,
            fetch_config=fetch_config,
        )
    return await _run_url_map_extraction(
        db=db,
        job=job,
        source=source,
        fetch_mode=fetch_mode,
        fetch_config=fetch_config,
    )

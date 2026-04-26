import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup


def extract_money(text: str) -> float | None:
    match = re.search(r"£\s?([\d,]+(?:\.\d{2})?)", text)
    return float(match.group(1).replace(",", "")) if match else None


def extract_date(text: str) -> str | None:
    match = re.search(r"\b(\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})\b", text)

    if not match:
        return None

    for fmt in ("%d %B %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(match.group(1), fmt).date().isoformat()
        except ValueError:
            continue

    return None


def classify_sector(text: str) -> str:
    lower = text.lower()

    if re.search(r"\brail|railway|track|network rail\b", lower):
        return "rail"
    if re.search(r"\bhighway|road|carriageway|footway|traffic\b", lower):
        return "highways"
    if re.search(r"\bbridge|structure|inspection|principal inspection\b", lower):
        return "structures"
    if re.search(r"\bdrainage|culvert|flood\b", lower):
        return "drainage"
    if re.search(r"\bcivil|infrastructure|construction|maintenance\b", lower):
        return "civil infrastructure"

    return "unclassified"


def relevance_score(text: str) -> int:
    return 25 if classify_sector(text) == "unclassified" else 75


def normalise_record_from_html(source_url: str, html: str) -> dict[str, dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    title = ""

    if soup.h1:
        title = soup.h1.get_text(" ", strip=True)

    if not title and soup.title:
        title = soup.title.get_text(" ", strip=True)

    title = title or "Untitled notice"
    raw_text = soup.get_text(" ", strip=True)
    raw_text = re.sub(r"\s+", " ", raw_text)
    value = extract_money(raw_text)
    date = extract_date(raw_text)
    sector = classify_sector(f"{title} {raw_text}")
    review_status = "needs_review" if sector == "unclassified" else "pending"

    return {
        "raw": {
            "source_url": source_url,
            "raw_title": title,
            "raw_text": raw_text[:100000],
            "raw_metadata": {"extracted_by": "python-html-normaliser-v1"},
            "content_hash": None,
            "extraction_status": review_status,
        },
        "bid": {
            "source_url": source_url,
            "title": title,
            "description": raw_text[:4000],
            "sector_primary": sector,
            "relevance_score": relevance_score(f"{title} {raw_text}"),
            "contract_value_awarded": value,
            "currency": "GBP" if value else None,
            "published_date": date,
            "estimated_renewal_date": None,
            "review_status": review_status,
            "ai_summary": None,
        },
    }

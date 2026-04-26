import re
from urllib.parse import urldefrag, urljoin


def normalise_url(href: str, base_url: str) -> str | None:
    try:
        joined = urljoin(base_url, href)
        return urldefrag(joined).url
    except ValueError:
        return None


def matches_rule(url: str, rule: dict) -> bool:
    pattern = rule.get("pattern", "")
    try:
        return re.search(pattern, url) is not None
    except re.error:
        return pattern in url


def should_visit_url(url: str, rules: list[dict]) -> bool:
    active = [rule for rule in rules if rule.get("is_active", True)]
    excludes = [rule for rule in active if rule.get("rule_type") == "exclude"]
    includes = [rule for rule in active if rule.get("rule_type") == "include"]

    if any(matches_rule(url, rule) for rule in excludes):
        return False

    if not includes:
        return True

    return any(matches_rule(url, rule) for rule in includes)


def classify_url(url: str, rules: list[dict]) -> str:
    active = [rule for rule in rules if rule.get("is_active", True)]

    if any(rule.get("rule_type") == "detail" and matches_rule(url, rule) for rule in active):
        return "detail"

    if any(rule.get("rule_type") == "listing" and matches_rule(url, rule) for rule in active):
        return "listing"

    if re.search(r"award|awarded|contract", url, re.IGNORECASE):
        return "award"

    if re.search(r"\.pdf($|\?)", url, re.IGNORECASE):
        return "document"

    return "unknown"


def matched_rule_label(url: str, rules: list[dict]) -> str | None:
    active = sorted(
        [rule for rule in rules if rule.get("is_active", True)],
        key=lambda rule: rule.get("priority", 100),
    )

    for rule in active:
        if matches_rule(url, rule):
            return f"{rule.get('rule_type')}:{rule.get('pattern')}"

    return None

BIDSTATS_SOURCE_SEED = {
    "name": "BidStats",
    "slug": "bidstats",
    "base_url": "https://bidstats.uk",
    "entry_urls": ["https://bidstats.uk/tenders/"],
    "status": "draft",
    "crawl_frequency": "manual",
    "scrape_frequency": "manual",
    "compliance_notes": (
        "robots.txt sets Crawl-delay: 20 for generic user agents and disallows "
        "query-string crawling. MVP should use low-rate manual runs and avoid query URL discovery."
    ),
}

BIDSTATS_RULE_SEEDS = [
    {
        "rule_type": "include",
        "pattern": r"^https://bidstats\.uk/tenders/?",
        "description": "Stay inside the public tenders path.",
        "priority": 10,
        "is_active": True,
    },
    {
        "rule_type": "exclude",
        "pattern": r"\?",
        "description": "BidStats robots.txt disallows query-string crawling for generic user agents.",
        "priority": 1,
        "is_active": True,
    },
    {
        "rule_type": "exclude",
        "pattern": r"^https://bidstats\.uk/tenders/20(15|16|17|18|19|20)/",
        "description": "BidStats robots.txt disallows older tender year paths.",
        "priority": 2,
        "is_active": True,
    },
    {
        "rule_type": "listing",
        "pattern": r"^https://bidstats\.uk/tenders/?$",
        "description": "Public tenders landing page.",
        "priority": 20,
        "is_active": True,
    },
    {
        "rule_type": "detail",
        "pattern": r"^https://bidstats\.uk/tenders/[A-Za-z0-9-]+",
        "description": "Candidate detail page pattern, to be refined after approved exploratory crawl.",
        "priority": 30,
        "is_active": True,
    },
]

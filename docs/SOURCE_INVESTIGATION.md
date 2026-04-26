# Source Investigation

## First Source: BidStats

BidStats is a useful first target because it aggregates UK public-sector notices and references Contracts Finder, Find a Tender, and OJEU sources from one public entry point.

Read-only checks performed:

- `https://bidstats.uk/robots.txt`
- `https://bidstats.uk/`
- `https://bidstats.uk/tenders/`

## Findings

- The public landing page links to the tender directory and exposes current tender counts.
- `robots.txt` sets `Crawl-delay: 20` for generic user agents.
- `robots.txt` disallows query-string crawling for generic user agents via `Disallow: *?`.
- Older tender year paths from 2015 through 2020 are disallowed.
- The MVP should avoid `?source=`, `?ntype=`, and other query-based crawling unless explicit permission or a different compliant access route is confirmed.

## Worker Decision

Use a Python worker on Fly.io for crawl/scrape/classify execution.

Reasoning:

- Next.js/Vercel is the control plane and must not run heavy crawling or scraping.
- Fly gives the scraper a persistent execution environment with retry/backoff and service-role access.
- The worker currently uses HTTP + BeautifulSoup-style parsing; Scrapy/Playwright can be introduced inside the worker if later sources need complex crawl state or JavaScript rendering.
- Crawl, scrape, and classify are separate user-controlled stages. Crawl does not automatically trigger scrape.

## Initial BidStats Seed

The code includes draft BidStats source seeds in both control-plane and worker locations:

- Next source seed: `lib/source-seeds/bidstats.ts`
- Worker source reference: `worker/app/pipeline/sources/bidstats.py`

- Base URL: `https://bidstats.uk`
- Entry URL: `https://bidstats.uk/tenders/`
- Exclude query-string URLs.
- Exclude disallowed older tender year paths.
- Keep status as `draft` until compliance notes are reviewed.

## Next Source Candidates

- Contracts Finder
- Find a Tender
- Public Contracts Scotland

Each source needs a similar robots/terms and URL-structure review before adding active crawler rules.

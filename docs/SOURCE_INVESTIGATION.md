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

Use a TypeScript crawler/scraper inside the Next.js codebase for the first MVP run path.

Reasoning:

- The first pass only needs low-rate manual crawling and URL-map storage.
- Keeping the worker interface in TypeScript reduces initial operational surface area.
- The crawler can still be moved behind a queue or into a separate worker later because the pipeline is isolated under `lib/scraping/`.
- Scrapy/Playwright remain options if a later source needs complex crawl state or JavaScript rendering.

## Initial BidStats Seed

The code includes a draft BidStats source seed in `lib/scraping/sources/bidstats.ts`:

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

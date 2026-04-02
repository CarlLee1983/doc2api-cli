# Scout Command Design

## Problem

When facing a new API documentation website, users lack a clear decision process for choosing the best extraction strategy. The current options (`--crawl`, URL list, single URL) require upfront knowledge of the site structure. Users need a lightweight reconnaissance step before committing to a full extraction.

## Solution

A new `doc2api scout <url>` command that crawls a site, classifies each page as API-relevant or not, and outputs a curated URL list ready for `doc2api inspect`.

## Command Interface

```bash
# Reconnaissance - list discovered pages
doc2api scout <url> [--max-depth 1] [--max-pages 50] [--browser] [--request-delay 200]

# Save API pages as URL list
doc2api scout <url> --save urls.txt

# Save all pages (including non-API)
doc2api scout <url> --save urls.txt --all

# JSON output for AI agents
doc2api scout <url> --json
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--max-depth` | 1 | Crawl depth (scout defaults to 1, shallower than inspect's 2) |
| `--max-pages` | 50 | Maximum pages to visit |
| `--browser` | false | Force Playwright for SPA rendering |
| `--request-delay` | 200 | Delay between requests (ms) |
| `--no-robots` | false | Ignore robots.txt |
| `--save` | - | Write URL list to file |
| `--all` | false | Include non-API pages in `--save` output |
| `--json` | false | JSON output |

## API Page Detection

Lightweight heuristic scoring (0-1) for each crawled page:

### Positive signals (increase score)

1. **HTTP method detection** (+0.4) - Page content contains `GET /`, `POST /`, `PUT /`, `DELETE /`, `PATCH /` patterns
2. **URL pattern match** (+0.2) - Path contains `api`, `reference`, `endpoint`, `method`
3. **Parameter table features** (+0.2) - Content contains `required`, `optional`, `parameter`, `request body`, `response`

### Negative signals (decrease score)

1. **Exclude URL patterns** (-0.3) - Path contains `faq`, `changelog`, `blog`, `logo`, `contact`, `glossary`, `terms`, `privacy`

### Threshold

- Score >= 0.3 -> classified as API page (`isApi: true`)

## Output Formats

### Human-readable (default)

```
Scout: https://developers-pay.line.me/zh/online-api-v3
Found 12 pages (depth 1):

  API (8 pages):
  [0.9] https://developers-pay.line.me/zh/.../request    付款請求
  [0.8] https://developers-pay.line.me/zh/.../confirm    付款授權
  ...

  Other (4 pages):
  [0.1] https://developers-pay.line.me/zh/faq            FAQ
  ...

Suggested next:
  doc2api scout https://... --save urls.txt
  doc2api inspect urls.txt
```

### JSON (`--json`)

```json
{
  "ok": true,
  "data": {
    "entry": "https://developers-pay.line.me/zh/online-api-v3",
    "totalPages": 12,
    "apiPages": 8,
    "pages": [
      {
        "url": "https://...",
        "title": "付款請求",
        "score": 0.9,
        "isApi": true,
        "signals": ["http_method", "url_pattern"]
      }
    ]
  }
}
```

### URL list file (`--save`)

```txt
# Scout: https://developers-pay.line.me/zh/online-api-v3
# Generated: 2026-04-02
# API pages: 8 / 12
https://developers-pay.line.me/zh/online-api-v3
https://developers-pay.line.me/zh/online-api-v3/request
https://developers-pay.line.me/zh/online-api-v3/confirm
...
```

Compatible with existing `doc2api inspect urls.txt` (comment lines starting with `#` are already filtered out).

## Architecture

### New files

- `src/commands/scout.ts` - Command handler
- `src/pipeline/scout-scorer.ts` - API page heuristic scoring
- `tests/commands/scout.test.ts` - Command tests
- `tests/pipeline/scout-scorer.test.ts` - Scorer unit tests

### Reused modules

- `src/pipeline/fetcher/crawler.ts` - BFS crawling with robots.txt, SSRF protection, checkpoint/resume
- `src/pipeline/fetcher/http-fetcher.ts` - HTTP fetch with limits
- `src/pipeline/fetcher/fetch-page.ts` - Orchestration of http vs browser fetch
- `src/cli/router.ts` - CLI routing (add `scout` command)

### Data flow

```
scout <url>
  -> crawler.ts (BFS, collect URLs + page content)
  -> scout-scorer.ts (score each page)
  -> sort by score descending
  -> format output (human / json / save)
```

### Key design decisions

1. **Scout does NOT chunk/classify** - It only fetches page text and scores it. This keeps it fast and cheap.
2. **Scout reuses the crawler** - Same crawl infrastructure, same safety (SSRF, robots.txt, rate limiting).
3. **Scout defaults to `--max-depth 1`** - Reconnaissance needs less depth than full extraction.
4. **Scout is decoupled from session** - It's a pre-inspect step. The flow is `scout -> inspect -> session`, each step producing input for the next.
5. **No page content caching between scout and inspect** - Scout and inspect are independent runs. Inspect will re-fetch. This keeps the design simple and avoids stale cache issues.

## Typical Workflow

```bash
# 1. Reconnaissance
doc2api scout https://developers-pay.line.me/zh/online-api-v3
# Review the output, see which pages are API-relevant

# 2. Save URL list (edit if needed)
doc2api scout https://developers-pay.line.me/zh/online-api-v3 --save urls.txt
# Optionally hand-edit urls.txt to add/remove pages

# 3. Full extraction
doc2api inspect urls.txt --json -o inspect.json

# 4. Session workflow
doc2api session start inspect.json
```

## What This Does NOT Do

- No auto crawl-then-inspect pipeline - scout's value is the user confirmation point
- No page content caching between scout and inspect
- No changes to existing `--crawl` behavior
- No changes to session workflow

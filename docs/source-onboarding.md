# Source Onboarding & Expansion Strategy

This document outlines the strategy for adding new publisher sources to the Scriba Aggregator. As the system scales, ensuring a predictable and standardized onboarding process is critical for maintaining data quality and ingestion stability.

## 1. Categorization by API Type
Before adding a source, determine its data extraction method:
* **WordPress REST API**: Native `wp-json/wp/v2` endpoints available (e.g., Kallxo, TechCrunch). This is our primary and easiest integration type.
* **Custom API**: Non-WordPress endpoints returning structured JSON. Requires writing a dedicated adapter.
* **RSS Feeds**: Traditional XML feeds. Easily parsed but often lack full article bodies (requires supplementary scraping).
* **DOM Scraping**: Sites with no API or RSS. Requires building custom Cheerio or Puppeteer scrapers. This should be the last resort due to fragility.

## 2. The Onboarding Checklist
For every new source, verify the following:

- [ ] **Endpoint Availability**: Can you access the `/posts`, `/tags`, `/categories` endpoints without authentication?
- [ ] **Pagination Support**: Does the API support `?page=` and `?per_page=` query parameters?
- [ ] **Data Completeness**:
  - [ ] Does the API return the full article body?
  - [ ] Does the API return the author name or author ID? (If 401 Unauthorized, ensure the adapter falls back gracefully to 'Unknown').
  - [ ] Does the API (or embedded Yoast SEO metadata) return a thumbnail/cover image?
- [ ] **Run the Audit Script**: Execute `bun run scripts/auditSources.ts` with the new URL to programmatically verify endpoints.
- [ ] **Single-Source Test**: Add the source to `prisma/seed.ts`, run the seed, and execute `bun run src/cli.ts <domain>` to verify the adapter handles edge cases correctly.

## 3. Adapter Integration Rules
If a site does not fit the standard `WordpressAdapter`, you must build a custom class implementing the `SourceAdapter` interface (`src/adapters/base.adapter.ts`).

**Rules for Custom Adapters:**
1. **Never crash the ingestion loop**: Wrap network requests in `try/catch` and return safe falbacks (e.g., empty arrays for tags, 'Unknown' for authors) when non-critical metadata fails.
2. **Implement Resiliency**: Use the `fetchWithRetry` wrapper to ensure exponential backoff and timeouts.
3. **Respect Rate Limits**: If a source throws a 429 Too Many Requests, back off exponentially.
4. **Identify External IDs properly**: Ensure the API returns a stable, unique identifier for each article. If an ID is missing, compute a deterministic hash of the URL to serve as the `externalId`.
5. **Yoast SEO Fallbacks**: Always attempt to parse `yoast_head_json` when available, as it is often more reliable than secondary API requests for categories, tags, and thumbnails.

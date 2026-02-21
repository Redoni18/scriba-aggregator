import { prisma as db } from './db';
import { ingestRemoteArticle } from './ingestion/ingestRemoteArticle';
import { createAdapter } from './adapters';

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: bun run src/cli.ts <source-domain>');
        console.error('Example: bun run src/cli.ts https://techcrunch.com');
        process.exit(1);
    }

    const domain = args[0];

    console.log(`🔍 Looking up source for domain: ${domain}`);
    const source = await db.source.findUnique({
        where: { domain },
    });

    if (!source) {
        console.error(`❌ Source not found in database for domain: ${domain}`);
        console.error('Have you run `bun run prisma db seed`?');
        process.exit(1);
    }

    if (!source.isActive) {
        console.error(`⚠️ Source ${source.name} is currently inactive.`);
        process.exit(1);
    }

    console.log(`✅ Found active source: ${source.name}`);
    console.log(`🚀 Starting single-source ingestion for ${source.name}...`);

    try {
        const adapter = createAdapter(source);

        let maxPublishedAt = source.lastSeenPublishedAt ? new Date(source.lastSeenPublishedAt) : new Date(0);
        let consecutiveSkipped = 0;
        const MAX_CONSECUTIVE_SKIPPED = 10;

        // Orchestrator loop state variables
        let currentPage = 1;
        let articlesProcessed = 0;
        let shouldContinue = true;

        // Assuming your adapter has a sync method or similar. We need to implement the fetch loop.
        while (shouldContinue) {
            console.log(`\n📄 Fetching page ${currentPage} for ${source.name}...`);
            const articles = await adapter.fetchPage(currentPage);

            if (articles.length === 0) {
                console.log(`End of articles reached at page ${currentPage}.`);
                break;
            }

            for (const article of articles) {
                console.log(`\n-----------------------------------`);
                console.log(`Processing article: ${article.title} (${article.externalId})`);

                // Hybrid Stop Strategy Rule 1: Stop if article is older than lastSeenPublishedAt
                if (source.lastSeenPublishedAt && article.publishedAt < source.lastSeenPublishedAt) {
                    console.log(`🛑 [STOP] Article published at ${article.publishedAt} is older than last seen (${source.lastSeenPublishedAt}). Stopping ingestion.`);
                    shouldContinue = false;
                    break;
                }

                if (article.publishedAt > maxPublishedAt) {
                    maxPublishedAt = article.publishedAt;
                }

                try {
                    const result = await ingestRemoteArticle(article, source.id, source.name);
                    if (result) {
                        console.log(`[SUCCESS] Ingested Article ID: ${result.id}`);
                        articlesProcessed++;
                        consecutiveSkipped = 0; // reset
                    } else {
                        console.log(`[SKIPPED] Article already exists or could not be ingested.`);
                        consecutiveSkipped++;

                        // Hybrid Stop Strategy Rule 2: Stop if we see too many existing articles in a row
                        if (consecutiveSkipped >= MAX_CONSECUTIVE_SKIPPED) {
                            console.log(`🛑 [STOP] Hit ${MAX_CONSECUTIVE_SKIPPED} consecutive existing articles. Stopping ingestion.`);
                            shouldContinue = false;
                            break;
                        }
                    }
                } catch (error: any) {
                    console.error(`[ERROR] Failed to ingest article ${article.externalId}: ${error.message}`);
                }
            }

            if (!shouldContinue) {
                break;
            }

            // Simple stop block for the test — only run 5 pages for now to test pagination
            if (currentPage >= 5) {
                console.log(`\n🛑 Reached maximum test pages (${currentPage}). Stopping.`);
                shouldContinue = false;
            }

            currentPage++;
        }

        // Update the source's lastSeenPublishedAt
        if (maxPublishedAt.getTime() > 0 && maxPublishedAt > (source.lastSeenPublishedAt || new Date(0))) {
            console.log(`\n🕒 Updating source lastSeenPublishedAt to: ${maxPublishedAt}`);
            await db.source.update({
                where: { id: source.id },
                data: { lastSeenPublishedAt: maxPublishedAt, lastFetchedAt: new Date() }
            });
        } else {
            // Just update lastFetchedAt
            await db.source.update({
                where: { id: source.id },
                data: { lastFetchedAt: new Date() }
            });
        }

        console.log(`\n✨ Ingestion complete for ${source.name}. Processed ${articlesProcessed} new articles.`);

    } catch (error: any) {
        console.error(`❌ Global Ingestion Error: ${error.message}`);
        console.error(error);
    } finally {
        await db.$disconnect();
    }
}

main().catch(console.error);

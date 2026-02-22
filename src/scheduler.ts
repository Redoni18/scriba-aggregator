import { prisma as db } from './db';
import { ingestRemoteArticle } from './ingestion/ingestRemoteArticle';
import { createAdapter } from './adapters';

const POLLING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONSECUTIVE_SKIPPED = 10;
const MAX_PAGES_PER_RUN = 5;
const MAX_CONSECUTIVE_ERRORS = 5;

async function ingestSource(source: any) {
    console.log(`\n🚀 Starting ingestion for ${source.name} (${source.domain})`);
    const startTime = Date.now();
    let articlesProcessed = 0;

    try {
        const adapter = createAdapter(source);
        let currentPage = 1;
        let shouldContinue = true;
        let consecutiveSkipped = 0;
        let maxPublishedAt = source.lastSeenPublishedAt ? new Date(source.lastSeenPublishedAt) : new Date(0);

        while (shouldContinue) {
            console.log(`📄 Fetching page ${currentPage} for ${source.name}...`);
            const articles = await adapter.fetchPage(currentPage);

            if (articles.length === 0) {
                console.log(`End of articles reached at page ${currentPage}.`);
                break;
            }

            for (const article of articles) {
                if (source.lastSeenPublishedAt && article.publishedAt <= source.lastSeenPublishedAt) {
                    console.log(`🛑 [STOP] Article published at ${article.publishedAt} is older than or equal to last seen (${source.lastSeenPublishedAt}).`);
                    shouldContinue = false;
                    break;
                }

                if (article.publishedAt > maxPublishedAt) {
                    maxPublishedAt = article.publishedAt;
                }

                try {
                    const result = await ingestRemoteArticle(article, source.id, source.name);
                    if (result) {
                        articlesProcessed++;
                        consecutiveSkipped = 0;
                    } else {
                        consecutiveSkipped++;
                        if (consecutiveSkipped >= MAX_CONSECUTIVE_SKIPPED) {
                            console.log(`🛑 [STOP] Hit ${MAX_CONSECUTIVE_SKIPPED} consecutive existing articles.`);
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

            if (currentPage >= MAX_PAGES_PER_RUN) {
                console.log(`🛑 Reached maximum pages (${MAX_PAGES_PER_RUN}) per run.`);
                shouldContinue = false;
            }

            currentPage++;
        }

        const endTime = Date.now();
        const durationMs = endTime - startTime;

        // Calculate moving averages (using Exponential Moving Average)
        const newAvgArticles = source.avgArticlesPerRun > 0
            ? (source.avgArticlesPerRun * 0.8) + (articlesProcessed * 0.2)
            : articlesProcessed;

        const newAvgTime = source.avgTimePerRunMs > 0
            ? (source.avgTimePerRunMs * 0.8) + (durationMs * 0.2)
            : durationMs;

        const updatedData: any = {
            lastFetchedAt: new Date(),
            avgArticlesPerRun: newAvgArticles,
            avgTimePerRunMs: newAvgTime,
            errorCount: 0, // Reset errors on success
            lastError: null
        };

        if (maxPublishedAt.getTime() > 0 && maxPublishedAt > (source.lastSeenPublishedAt || new Date(0))) {
            updatedData.lastSeenPublishedAt = maxPublishedAt;
        }

        await db.source.update({
            where: { id: source.id },
            data: updatedData
        });

        console.log(`✨ Finished ${source.name}: ${articlesProcessed} articles in ${durationMs}ms.`);
    } catch (error: any) {
        console.error(`❌ Error ingesting ${source.name}: ${error.message}`);

        const newErrorCount = source.errorCount + 1;
        const autoDisable = newErrorCount >= MAX_CONSECUTIVE_ERRORS; // Auto-disable after 5 consecutive errors

        await db.source.update({
            where: { id: source.id },
            data: {
                errorCount: newErrorCount,
                lastError: error.message,
                isActive: !autoDisable,
                lastFetchedAt: new Date()
            }
        });

        if (autoDisable) {
            console.error(`🚨 Source ${source.name} auto-disabled due to ${newErrorCount} consecutive errors.`);
        }
    }
}

async function runScheduler() {
    console.log(`🕒 Starting Master Scheduler...`);
    const isSingleRun = process.argv.includes('--run-once');

    if (isSingleRun) {
        console.log(`\n--- Running Single Execution Mode at ${new Date().toISOString()} ---`);
        try {
            const sources = await db.source.findMany({
                where: { isActive: true }
            });

            console.log(`Found ${sources.length} active sources.`);

            for (const source of sources) {
                await ingestSource(source);
            }
        } catch (error) {
            console.error(`❌ Error in single-run scheduler cycle:`, error);
            process.exitCode = 1;
        }
        return; // Exit after single run completes successfully or triggers errors. Process handles teardown below.
    }

    while (true) {
        console.log(`\n--- Starting new ingestion cycle at ${new Date().toISOString()} ---`);

        try {
            const sources = await db.source.findMany({
                where: { isActive: true }
            });

            console.log(`Found ${sources.length} active sources.`);

            for (const source of sources) {
                await ingestSource(source);
            }
        } catch (error) {
            console.error(`❌ Error in scheduler cycle:`, error);
        }

        console.log(`\n💤 Cycle complete. Sleeping for ${POLLING_INTERVAL_MS / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    await db.$disconnect();
    process.exit(0);
});

runScheduler().then(async () => {
    if (process.argv.includes('--run-once')) {
        console.log('\nSingle run complete. Disconnecting from DB and exiting...');
        await db.$disconnect();
        process.exit(process.exitCode || 0);
    }
}).catch(async (err) => {
    console.error('Fatal error in scheduler:', err);
    await db.$disconnect();
    process.exit(1);
});

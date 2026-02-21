import { RemoteArticle } from "../adapters/base.adapter";
import { prisma } from "../db";
import { findArticle, createArticle, updateArticle } from "../services/article.service";
import { createArticleVersion } from "../services/articleVersion.service";
import { ensureJournalist } from "../services/journalist.service";
import { ensureTags } from "../services/tags.service";
import { ensureCategories } from "../services/category.service";
import { hashContent } from "../utils/hash";

/**
 * Orchestrates the ingestion of a single remote article into the local database.
 *
 * Flow:
 * 1. Hash body
 * 2. Check if article exists
 * 3. Ensure journalist
 * 4. Ensure tags & categories
 * 5. Create or update article
 * 6. Create version if needed
 * 7. Link tags & categories
 */
export const ingestRemoteArticle = async (
    remoteArticle: RemoteArticle,
    sourceId: string,
    sourceName: string
) => {
    // 1. Hash body
    const bodyHash = hashContent(remoteArticle.body);

    // 2. Check if article exists
    const existingArticle = await findArticle(sourceId, remoteArticle.externalId);

    // 3. Ensure journalist
    const journalist = await ensureJournalist(
        remoteArticle.authorName,
        remoteArticle.authorProfileImageUrl,
        sourceName,
        remoteArticle.authorId,
        sourceId
    );

    // 4. Ensure tags & categories (parallel — independent)
    const [tags, categories] = await Promise.all([
        remoteArticle.tags.length > 0
            ? ensureTags(remoteArticle.tags, sourceId)
            : Promise.resolve([]),
        remoteArticle.categories.length > 0
            ? ensureCategories(remoteArticle.categories, sourceId)
            : Promise.resolve([]),
    ]);

    // 5. Create or update article
    let article;

    if (!existingArticle) {
        // New article — create + always snapshot a version
        article = await createArticle({
            sourceId,
            externalId: remoteArticle.externalId,
            canonicalUrl: remoteArticle.canonicalUrl,
            title: remoteArticle.title,
            summary: remoteArticle.summary,
            thumbnailUrl: remoteArticle.thumbnailUrl,
            coverImageUrl: remoteArticle.coverImageUrl,
            bodyHash,
            publishedAt: remoteArticle.publishedAt,
            journalistId: journalist.id,
        });

        // 6. Create initial version
        await createArticleVersion(
            article.id,
            remoteArticle.title,
            remoteArticle.summary,
            remoteArticle.body
        );
    } else {
        article = existingArticle;
        const bodyChanged = existingArticle.bodyHash !== bodyHash;

        // Update article fields if anything relevant changed
        const needsUpdate =
            bodyChanged ||
            existingArticle.title !== remoteArticle.title ||
            existingArticle.summary !== remoteArticle.summary ||
            existingArticle.thumbnailUrl !== remoteArticle.thumbnailUrl ||
            existingArticle.coverImageUrl !== remoteArticle.coverImageUrl;

        if (needsUpdate) {
            article = await updateArticle(existingArticle.id, {
                title: remoteArticle.title,
                summary: remoteArticle.summary,
                thumbnailUrl: remoteArticle.thumbnailUrl,
                coverImageUrl: remoteArticle.coverImageUrl,
                journalistId: journalist.id,
                ...(bodyChanged ? { bodyHash } : {}),
            });
        }

        // 6. Create version only when body changes
        if (bodyChanged) {
            await createArticleVersion(
                article.id,
                remoteArticle.title,
                remoteArticle.summary,
                remoteArticle.body
            );
        }
    }

    // 7. Link tags & categories
    await Promise.all([
        ...tags.map((tag) =>
            prisma.articleTag.upsert({
                where: {
                    articleId_tagId: {
                        articleId: article.id,
                        tagId: tag.id,
                    },
                },
                update: {},
                create: {
                    articleId: article.id,
                    tagId: tag.id,
                },
            })
        ),
        ...categories.map((category) =>
            prisma.articleCategory.upsert({
                where: {
                    articleId_categoryId: {
                        articleId: article.id,
                        categoryId: category.id,
                    },
                },
                update: {},
                create: {
                    articleId: article.id,
                    categoryId: category.id,
                },
            })
        ),
    ]);

    return article;
};

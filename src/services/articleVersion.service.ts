import { prisma } from "../db";

/**
 * Creates a new article version snapshot.
 * Called whenever the article body changes (detected via bodyHash).
 */
export const createArticleVersion = async (
    articleId: string,
    title: string,
    summary: string | undefined,
    body: string
) => {
    return prisma.articleVersion.create({
        data: {
            articleId,
            title,
            summary,
            body,
        },
    });
};

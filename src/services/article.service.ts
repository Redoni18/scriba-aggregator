import { prisma } from "../db";

/**
 * Finds an existing article by its source-scoped external ID.
 *
 * @returns The article record, or null if not found.
 */
export const findArticle = async (sourceId: string, externalId: string) => {
    return prisma.article.findUnique({
        where: {
            sourceId_externalId: {
                sourceId,
                externalId,
            },
        },
    });
};

/**
 * Creates a new article record.
 */
export const createArticle = async (data: {
    sourceId: string;
    externalId: string;
    canonicalUrl: string;
    title: string;
    summary?: string;
    thumbnailUrl?: string;
    coverImageUrl?: string;
    bodyHash: string;
    publishedAt: Date;
    journalistId?: string;
}) => {
    return prisma.article.create({ data });
};

/**
 * Updates mutable fields on an existing article.
 */
export const updateArticle = async (
    id: string,
    data: {
        title?: string;
        summary?: string;
        thumbnailUrl?: string;
        coverImageUrl?: string;
        bodyHash?: string;
        journalistId?: string;
    }
) => {
    return prisma.article.update({
        where: { id },
        data,
    });
};

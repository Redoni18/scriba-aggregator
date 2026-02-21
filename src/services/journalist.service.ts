import { prisma } from "../db";

/**
 * Ensures a journalist exists for a given source.
 * Uses `sourceUniqueId` (source + authorId compound) to upsert the journalist,
 * then upserts the JournalistSource link.
 *
 * @returns The journalist record.
 */
export const ensureJournalist = async (
    name: string,
    profileImageUrl: string | undefined,
    source: string,
    authorId: string,
    sourceId: string
) => {
    const sourceUniqueId = `${source}_${authorId}`;
    const journalist = await prisma.journalist.upsert({
        where: {
            sourceUniqueId: sourceUniqueId,
        },
        update: {},
        create: {
            name: name,
            profileImageUrl: profileImageUrl,
            sourceUniqueId: sourceUniqueId,
        },
    });

    await prisma.journalistSource.upsert({
        where: {
            journalistId_sourceId: {
                journalistId: journalist.id,
                sourceId: sourceId,
            },
        },
        update: {},
        create: {
            journalistId: journalist.id,
            sourceId: sourceId,
        },
    });
    return journalist;
};
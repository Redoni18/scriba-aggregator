import { prisma } from "../db";

/**
 * Ensures tags exist for a given source.
 * Upserts each tag by the compound unique (sourceId + name),
 * so duplicates are safely ignored.
 *
 * @returns The tag records (one per name).
 */
export const ensureTags = async (names: string[], sourceId: string) => {
    const tags = await Promise.all(
        names.map((name) =>
            prisma.tag.upsert({
                where: {
                    sourceId_name: {
                        sourceId,
                        name,
                    },
                },
                update: {},
                create: {
                    name,
                    sourceId,
                },
            })
        )
    );
    return tags;
};

import { prisma } from "../db";

/**
 * Ensures categories exist for a given source.
 * Upserts each category by the compound unique (sourceId + name),
 * so duplicates are safely ignored.
 *
 * @returns The category records (one per name).
 */
export const ensureCategories = async (names: string[], sourceId: string) => {
    const categories = await Promise.all(
        names.map((name) =>
            prisma.category.upsert({
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
    return categories;
};

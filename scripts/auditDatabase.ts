import { prisma } from '../src/db';

async function main() {
    console.log('📊 Starting Data Quality Audit...\n');

    // 1. Audit Journalists
    const totalJournalists = await prisma.journalist.count();
    const journalistsWithImages = await prisma.journalist.count({ where: { profileImageUrl: { not: null } } });
    const duplicateNames = await prisma.$queryRaw`
        SELECT name, COUNT(*) as count 
        FROM "Journalist" 
        GROUP BY name 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    `;

    console.log(`👤 Journalists:`);
    console.log(` - Total: ${totalJournalists}`);
    console.log(` - With Profile Images: ${journalistsWithImages} (${((journalistsWithImages / totalJournalists) * 100).toFixed(2)}%)`);
    console.log(` - Potential Duplicates (by exact name): ${(duplicateNames as any[]).length}`);
    if ((duplicateNames as any[]).length > 0) {
        console.log(`   Top culprits: ${(duplicateNames as any[]).slice(0, 3).map(d => `${d.name} (${d.count})`).join(', ')}`);
    }

    console.log('\n-----------------------------------\n');

    // 2. Audit Articles
    const totalArticles = await prisma.article.count();
    const articlesMissingThumb = await prisma.article.count({ where: { thumbnailUrl: null } });
    const articlesMissingAuthor = await prisma.article.count({ where: { journalistId: null } });

    console.log(`📄 Articles:`);
    console.log(` - Total Ingested: ${totalArticles}`);
    console.log(` - Missing Thumbnails: ${articlesMissingThumb} (${((articlesMissingThumb / totalArticles) * 100).toFixed(2)}%)`);
    console.log(` - Missing Authors: ${articlesMissingAuthor} (${((articlesMissingAuthor / totalArticles) * 100).toFixed(2)}%)`);

    console.log('\n-----------------------------------\n');

    // 3. Audit Tags and Categories
    const totalTags = await prisma.tag.count();
    const totalCategories = await prisma.category.count();

    // Group categories by name across sources
    const duplicateCategories = await prisma.$queryRaw`
        SELECT name, COUNT(*) as count 
        FROM "Category" 
        GROUP BY name 
        HAVING COUNT(*) > 1
        ORDER BY count DESC
    `;

    console.log(`🏷️  Taxonomy:`);
    console.log(` - Total Unique Tags: ${totalTags}`);
    console.log(` - Total Unique Categories: ${totalCategories}`);
    console.log(` - Categories sharing exact names across sources: ${(duplicateCategories as any[]).length}`);
    if ((duplicateCategories as any[]).length > 0) {
        console.log(`   Common categories: ${(duplicateCategories as any[]).slice(0, 5).map(c => `${c.name} (${c.count})`).join(', ')}`);
    }

    console.log('\n✨ Audit Complete.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

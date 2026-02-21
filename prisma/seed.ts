import { prisma } from '../src/db';

async function main() {
    console.log('Seeding database with initial sources...');

    // TODO: Replace these with actual sources provided by the user
    const sources = [
        { name: 'TechCrunch', domain: 'https://techcrunch.com', baseUrl: 'https://techcrunch.com', apiType: 'wordpress', isActive: true },
        { name: 'Kallxo', domain: 'https://kallxo.com', baseUrl: 'https://kallxo.com', apiType: 'wordpress', isActive: true },
        { name: 'Insajderi', domain: 'https://insajderi.com', baseUrl: 'https://insajderi.com', apiType: 'wordpress', isActive: true },
        { name: 'InfoKosova', domain: 'https://infokosova.net', baseUrl: 'https://infokosova.net', apiType: 'wordpress', isActive: true },
        { name: 'VizionPlus', domain: 'https://www.vizionplus.tv', baseUrl: 'https://www.vizionplus.tv', apiType: 'wordpress', isActive: true },
        { name: 'ABCNews', domain: 'https://abcnews.al', baseUrl: 'https://abcnews.al', apiType: 'wordpress', isActive: true },
        { name: 'Periskopi', domain: 'https://www.periskopi.com', baseUrl: 'https://www.periskopi.com', apiType: 'wordpress', isActive: true },
        { name: 'Lajmi', domain: 'https://lajmi.net', baseUrl: 'https://lajmi.net', apiType: 'wordpress', isActive: true },
        { name: 'GazetaExpress', domain: 'https://gazetaexpress.com', baseUrl: 'https://gazetaexpress.com', apiType: 'wordpress', isActive: true },
        { name: 'GazetaMetro', domain: 'https://gazetametro.net', baseUrl: 'https://gazetametro.net', apiType: 'wordpress', isActive: true },
        { name: 'KlanKosova', domain: 'https://klankosova.tv', baseUrl: 'https://klankosova.tv', apiType: 'wordpress', isActive: true },
        { name: 'IndeksOnline', domain: 'https://indeksonline.net', baseUrl: 'https://indeksonline.net', apiType: 'wordpress', isActive: true },
    ];

    for (const sourceData of sources) {
        const source = await prisma.source.upsert({
            where: { domain: sourceData.domain },
            update: sourceData,
            create: sourceData,
        });
        console.log(`✅ Seeded source: ${source.name} (${source.domain})`);
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

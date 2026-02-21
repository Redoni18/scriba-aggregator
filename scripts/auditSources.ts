import axios from 'axios';

const testUrls: string[] = [
    'https://infokosova.net',
    'https://www.vizionplus.tv',
    'https://abcnews.al',
    'https://www.periskopi.com',
    'https://lajmi.net',
    'https://gazetaexpress.com',
    'https://gazetametro.net',
    'https://klankosova.tv',
    'https://indeksonline.net'
];

async function checkEndpoint(baseUrl: string, path: string, name: string) {
    try {
        const url = `${baseUrl}${path}`;
        const response = await axios.get(url, { params: { per_page: 1 } });
        if (response.status === 200 && Array.isArray(response.data)) {
            console.log(`✅ [${name}] works on ${baseUrl}`);
            return true;
        } else {
            console.log(`❌ [${name}] failed on ${baseUrl} - Status: ${response.status}`);
            return false;
        }
    } catch (error: any) {
        console.log(`❌ [${name}] failed on ${baseUrl} - Error: ${error.message}`);
        return false;
    }
}

async function auditSource(domain: string) {
    console.log(`\n\n🔍 Auditing Source: ${domain}`);
    console.log(`-----------------------------------`);
    const baseUrl = `${domain}/wp-json/wp/v2`;

    await checkEndpoint(baseUrl, '/posts', 'Posts API');
    await checkEndpoint(baseUrl, '/tags', 'Tags API');
    await checkEndpoint(baseUrl, '/categories', 'Categories API');
    await checkEndpoint(baseUrl, '/users', 'Users (Authors) API');
}

async function main() {
    if (testUrls.length === 0) {
        console.log('No sources configured. Add some URLs to the testUrls array.');
        return;
    }
    for (const url of testUrls) {
        await auditSource(url);
    }
}

main().catch(console.error);

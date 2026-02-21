import apiFetch from '@wordpress/api-fetch'
import { SourceAdapter, RemoteArticle, Author } from './base.adapter'

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
const TIMEOUT_MS = 15000 // 15 seconds per request

async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let retries = 0
    let backoff = INITIAL_BACKOFF_MS

    while (true) {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            })
            clearTimeout(timeoutId)

            if (!response.ok) {
                // Don't retry on client errors except 429 Too Many Requests
                if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                    return response
                }
                throw new Error(`Request failed with status ${response.status}`)
            }

            return response
        } catch (error: any) {
            clearTimeout(timeoutId)

            if (retries >= MAX_RETRIES) {
                throw error
            }

            retries++
            console.warn(`[WARN] Fetch error for ${url.substring(0, 50)}... (${error.name}: ${error.message}). Retrying ${retries}/${MAX_RETRIES} in ${backoff}ms`)
            await new Promise(resolve => setTimeout(resolve, backoff))
            backoff *= 2 // Exponential backoff
        }
    }
}

// Configure apiFetch with a custom fetch handler for Bun/Node.js environment
apiFetch.setFetchHandler((options) => {
    const { url, path, data, method = 'GET', headers, ...restOptions } = options

    return fetchWithRetry(url || path!, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(headers as HeadersInit),
        },
        body: data ? JSON.stringify(data) : undefined,
        ...(restOptions as any),
    }).then(async (response) => {
        if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`)
        }
        return response.json()
    })
})

interface WPAuthor {
    id: number
    name: string
    avatar_urls: Record<string, string>
}

export class WordpressAdapter implements SourceAdapter {
    constructor(private source: { baseUrl: string }) { }

    private extractTagsAndCategoriesFromYoast(post: any) {
        const graph = post.yoast_head_json?.schema?.['@graph'] ?? []

        const articleNode = graph.find(
            (n: any) => n['@type'] === 'Article'
        )

        return {
            tags: articleNode?.keywords ?? [],
            categories: articleNode?.articleSection ?? [],
        }
    }

    async fetchTagById(tagId: number[]): Promise<string[]> {
        const tags: string[] = []
        for (const id of tagId) {
            try {
                const tag = await apiFetch<{ name: string }>({
                    url: `${this.source.baseUrl}/wp-json/wp/v2/tags/${id}`,
                })
                tags.push(tag.name)
            } catch {
                continue
            }
        }
        return tags
    }

    async fetchCategoryById(categoryId: number[]): Promise<string[]> {
        const categories: string[] = []
        for (const id of categoryId) {
            try {
                const category = await apiFetch<{ name: string }>({
                    url: `${this.source.baseUrl}/wp-json/wp/v2/categories/${id}`,
                })
                categories.push(category.name)
            } catch {
                continue
            }
        }
        return categories
    }

    async fetchAuthorById(authorId: number): Promise<Author> {
        try {
            const wpAuthor = await apiFetch<WPAuthor>({
                url: `${this.source.baseUrl}/wp-json/wp/v2/users/${authorId}`,
            })
            return {
                id: String(wpAuthor.id),
                name: wpAuthor.name,
                profileImageUrl: wpAuthor.avatar_urls?.['96'],
            }
        } catch {
            return { id: '0', name: 'Unknown' }
        }
    }

    async fetchPage(page: number): Promise<RemoteArticle[]> {
        const posts = await apiFetch<any[]>({
            url: `${this.source.baseUrl}/wp-json/wp/v2/posts?_embed&per_page=10&page=${page}`,
        })

        return Promise.all(
            posts.map(async (post: any) => {
                const media = post._embedded?.['wp:featuredmedia']?.[0]

                const coverImageUrl =
                    media?.media_details?.sizes?.full?.source_url ??
                    post.yoast_head_json?.og_image?.[0]?.url

                const thumbnailUrl =
                    media?.media_details?.sizes?.thumbnail?.source_url ??
                    media?.media_details?.sizes?.medium?.source_url ??
                    post.yoast_head_json?.og_image?.[0]?.url

                const hasYoast = post.yoast_head_json !== null

                const tags: string[] = []
                const categories: string[] = []
                let authorName: string = 'Unknown'
                let authorProfileImageUrl: string | undefined = undefined
                let authorId: string = '0'

                if (hasYoast) {
                    const { tags: yoastTags, categories: yoastCategories } =
                        this.extractTagsAndCategoriesFromYoast(post)
                    tags.push(...yoastTags)
                    categories.push(...yoastCategories)
                    authorName = post.yoast_head_json?.author ?? 'Unknown'
                } else {
                    const tagsFromApi = await this.fetchTagById(post.tags)
                    const categoriesFromApi = await this.fetchCategoryById(post.categories)
                    tags.push(...tagsFromApi)
                    categories.push(...categoriesFromApi)
                    const authorFromApi = await this.fetchAuthorById(post.author)
                    authorName = authorFromApi.name
                    authorProfileImageUrl = authorFromApi.profileImageUrl
                    authorId = authorFromApi.id
                }

                return {
                    externalId: String(post.id),
                    canonicalUrl: post.link,
                    title: post.title.rendered,
                    body: post.content.rendered,
                    summary: post.excerpt?.rendered,
                    publishedAt: new Date(post.date),

                    thumbnailUrl,
                    coverImageUrl,

                    authorName,
                    authorId,
                    authorProfileImageUrl,
                    tags,
                    categories,
                }
            })
        )
    }

    hasMore(page: number, lastBatchSize: number) {
        return lastBatchSize > 0
    }
}

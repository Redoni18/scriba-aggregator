export type RemoteArticle = {
    externalId: string
    canonicalUrl: string
    title: string
    summary?: string
    body: string
    publishedAt: Date
  
    thumbnailUrl?: string
    coverImageUrl?: string
    authorName: string
    authorId: string
    authorProfileImageUrl?: string
    tags: string[]
    categories: string[]
}

export type Author = {
    id: string
    name: string
    profileImageUrl?: string
}

export interface SourceAdapter {
    fetchPage(page: number): Promise<RemoteArticle[]>;
    fetchByUrl?(url: string): Promise<RemoteArticle | null>;
    fetchTagById(tagId: number[]): Promise<string[]>;
    fetchCategoryById(categoryId: number[]): Promise<string[]>;
    fetchAuthorById(authorId: number): Promise<Author>;
    hasMore(page: number, lastBatchSize: number): boolean;
}
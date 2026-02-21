import { describe, expect, test, mock, beforeEach } from "bun:test";

/**
 * Unit tests for the ingestRemoteArticle orchestrator.
 * All database calls are mocked via Prisma client mock.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
    journalist: {
        upsert: mock(() =>
            Promise.resolve({ id: "journalist-1", name: "John Doe" })
        ),
    },
    journalistSource: {
        upsert: mock(() => Promise.resolve({})),
    },
    tag: {
        upsert: mock((args: any) =>
            Promise.resolve({ id: `tag-${args.create.name}`, name: args.create.name })
        ),
    },
    category: {
        upsert: mock((args: any) =>
            Promise.resolve({
                id: `cat-${args.create.name}`,
                name: args.create.name,
            })
        ),
    },
    article: {
        findUnique: mock(() => Promise.resolve<any>(null)),
        create: mock((args: any) =>
            Promise.resolve({ id: "article-1", ...args.data })
        ),
        update: mock((args: any) =>
            Promise.resolve({ id: args.where.id, ...args.data })
        ),
    },
    articleVersion: {
        create: mock(() => Promise.resolve({ id: "version-1" })),
    },
    articleTag: {
        upsert: mock(() => Promise.resolve({})),
    },
    articleCategory: {
        upsert: mock(() => Promise.resolve({})),
    },
};

// Mock the db module so all services use our mockPrisma
mock.module("../src/db", () => ({
    prisma: mockPrisma,
}));

// Import AFTER mocking
const { ingestRemoteArticle } = await import(
    "../src/ingestion/ingestRemoteArticle"
);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRemoteArticle(overrides: Record<string, any> = {}) {
    return {
        externalId: "ext-123",
        canonicalUrl: "https://example.com/article-1",
        title: "Test Article",
        summary: "A summary",
        body: "<p>Article body content</p>",
        publishedAt: new Date("2026-01-15"),
        thumbnailUrl: "https://example.com/thumb.jpg",
        coverImageUrl: "https://example.com/cover.jpg",
        authorName: "John Doe",
        authorId: "42",
        authorProfileImageUrl: "https://example.com/avatar.jpg",
        tags: ["tech", "news"],
        categories: ["politics"],
        ...overrides,
    };
}

function resetMocks() {
    Object.values(mockPrisma).forEach((model: any) => {
        Object.values(model).forEach((fn: any) => {
            if (typeof fn.mockClear === "function") fn.mockClear();
        });
    });
    // Default: article not found
    mockPrisma.article.findUnique.mockImplementation(() =>
        Promise.resolve(null)
    );
    mockPrisma.article.create.mockImplementation((args: any) =>
        Promise.resolve({ id: "article-1", ...args.data })
    );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("ingestRemoteArticle", () => {
    beforeEach(resetMocks);

    test("creates new article, version, journalist, tags, and categories", async () => {
        const remote = makeRemoteArticle();
        const result = await ingestRemoteArticle(remote, "source-1", "TestSource");

        expect(result.id).toBe("article-1");

        // Article was created (not updated)
        expect(mockPrisma.article.create).toHaveBeenCalledTimes(1);
        expect(mockPrisma.article.update).not.toHaveBeenCalled();

        // Version was created
        expect(mockPrisma.articleVersion.create).toHaveBeenCalledTimes(1);

        // Journalist ensured
        expect(mockPrisma.journalist.upsert).toHaveBeenCalledTimes(1);
        expect(mockPrisma.journalistSource.upsert).toHaveBeenCalledTimes(1);

        // Tags ensured (2 tags)
        expect(mockPrisma.tag.upsert).toHaveBeenCalledTimes(2);

        // Categories ensured (1 category)
        expect(mockPrisma.category.upsert).toHaveBeenCalledTimes(1);

        // Links created
        expect(mockPrisma.articleTag.upsert).toHaveBeenCalledTimes(2);
        expect(mockPrisma.articleCategory.upsert).toHaveBeenCalledTimes(1);
    });

    test("skips version creation when body hash is unchanged", async () => {
        const remote = makeRemoteArticle();

        // Simulate existing article with same body hash
        const { hashContent } = await import("../src/utils/hash");
        const bodyHash = hashContent(remote.body);

        mockPrisma.article.findUnique.mockImplementation(() =>
            Promise.resolve({
                id: "article-1",
                bodyHash,
                title: remote.title,
                summary: remote.summary,
                thumbnailUrl: remote.thumbnailUrl,
                coverImageUrl: remote.coverImageUrl,
            })
        );

        await ingestRemoteArticle(remote, "source-1", "TestSource");

        // Article should NOT be created (already exists)
        expect(mockPrisma.article.create).not.toHaveBeenCalled();

        // Article should NOT be updated (nothing changed)
        expect(mockPrisma.article.update).not.toHaveBeenCalled();

        // Version should NOT be created (hash same)
        expect(mockPrisma.articleVersion.create).not.toHaveBeenCalled();
    });

    test("creates version and updates article when body changes", async () => {
        const remote = makeRemoteArticle();

        // Simulate existing article with different body hash
        mockPrisma.article.findUnique.mockImplementation(() =>
            Promise.resolve({
                id: "article-1",
                bodyHash: "old-hash-value",
                title: remote.title,
                summary: remote.summary,
                thumbnailUrl: remote.thumbnailUrl,
                coverImageUrl: remote.coverImageUrl,
            })
        );
        mockPrisma.article.update.mockImplementation((args: any) =>
            Promise.resolve({ id: "article-1", ...args.data })
        );

        await ingestRemoteArticle(remote, "source-1", "TestSource");

        // Article should be updated
        expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);

        // New version should be created
        expect(mockPrisma.articleVersion.create).toHaveBeenCalledTimes(1);
    });

    test("handles articles with no tags or categories", async () => {
        const remote = makeRemoteArticle({ tags: [], categories: [] });

        await ingestRemoteArticle(remote, "source-1", "TestSource");

        // Tags and categories should not be ensured
        expect(mockPrisma.tag.upsert).not.toHaveBeenCalled();
        expect(mockPrisma.category.upsert).not.toHaveBeenCalled();

        // No link records should be created
        expect(mockPrisma.articleTag.upsert).not.toHaveBeenCalled();
        expect(mockPrisma.articleCategory.upsert).not.toHaveBeenCalled();
    });

    test("updates article when title changes but body stays the same", async () => {
        const remote = makeRemoteArticle();
        const { hashContent } = await import("../src/utils/hash");
        const bodyHash = hashContent(remote.body);

        mockPrisma.article.findUnique.mockImplementation(() =>
            Promise.resolve({
                id: "article-1",
                bodyHash,
                title: "Old Title",
                summary: remote.summary,
                thumbnailUrl: remote.thumbnailUrl,
                coverImageUrl: remote.coverImageUrl,
            })
        );
        mockPrisma.article.update.mockImplementation((args: any) =>
            Promise.resolve({ id: "article-1", ...args.data })
        );

        await ingestRemoteArticle(remote, "source-1", "TestSource");

        // Article should be updated (title changed)
        expect(mockPrisma.article.update).toHaveBeenCalledTimes(1);

        // But no new version (body didn't change)
        expect(mockPrisma.articleVersion.create).not.toHaveBeenCalled();
    });
});

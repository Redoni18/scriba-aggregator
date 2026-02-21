import { describe, expect, test } from "bun:test";
import { hashContent } from "../src/utils/hash";

describe("hashContent", () => {
    test("returns a hex SHA-256 hash", () => {
        const hash = hashContent("hello world");
        // SHA-256 of "hello world" is well-known
        expect(hash).toBe(
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    });

    test("trims whitespace before hashing", () => {
        const hash1 = hashContent("hello world");
        const hash2 = hashContent("  hello world  ");
        expect(hash1).toBe(hash2);
    });

    test("produces consistent hashes across multiple calls", () => {
        const hash1 = hashContent("foo bar baz");
        const hash2 = hashContent("foo bar baz");
        const hash3 = hashContent("foo bar baz");
        expect(hash1).toBe(hash2);
        expect(hash2).toBe(hash3);
    });

    test("different inputs produce different hashes", () => {
        const hash1 = hashContent("article body one");
        const hash2 = hashContent("article body two");
        expect(hash1).not.toBe(hash2);
    });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/core", () => ({
  getDb: vi.fn(),
}));
vi.mock("../sentry", () => ({
  captureServerException: vi.fn(),
}));

const { getDb } = await import("../db/core");
const { captureServerException } = await import("../sentry");
const {
  generateEmbedding,
  storeEmbedding,
  embedAndStoreLetterVersion,
  findSimilarLetters,
} = await import("./embeddings");

const mockGetDb = vi.mocked(getDb);
const mockCapture = vi.mocked(captureServerException);

describe("embeddings", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: "sk-test-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("generateEmbedding", () => {
    it("throws when OPENAI_API_KEY is missing", async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(generateEmbedding("hello")).rejects.toThrow("OPENAI_API_KEY is required");
    });

    it("calls OpenAI API with correct params and returns embedding", async () => {
      const fakeEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: fakeEmbedding }] }), { status: 200 }),
      );

      const result = await generateEmbedding("test text");

      expect(result).toEqual(fakeEmbedding);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/embeddings");
      const body = JSON.parse(opts!.body as string);
      expect(body.model).toBe("text-embedding-3-small");
      expect(body.dimensions).toBe(1536);
      expect(body.input).toBe("test text");
    });

    it("truncates input text to 8000 chars", async () => {
      const longText = "x".repeat(10_000);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }),
      );

      await generateEmbedding(longText);

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.input.length).toBe(8000);
    });

    it("throws on non-OK response with status text", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("rate limited", { status: 429 }),
      );

      await expect(generateEmbedding("test")).rejects.toThrow("OpenAI embedding API returned 429: rate limited");
    });

    it("sends correct Authorization header", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { status: 200 }),
      );

      await generateEmbedding("test");

      const headers = fetchSpy.mock.calls[0][1]!.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test-key");
    });
  });

  describe("storeEmbedding", () => {
    it("throws when database is not available", async () => {
      mockGetDb.mockResolvedValue(null as any);
      await expect(storeEmbedding(1, [0.1, 0.2])).rejects.toThrow("Database not available");
    });

    it("executes UPDATE SQL with vector string", async () => {
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);

      await storeEmbedding(42, [0.1, 0.2, 0.3]);

      expect(mockExecute).toHaveBeenCalledOnce();
    });
  });

  describe("embedAndStoreLetterVersion", () => {
    it("generates embedding and stores it", async () => {
      const fakeEmbedding = [0.1, 0.2, 0.3];
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: fakeEmbedding }] }), { status: 200 }),
      );
      const mockExecute = vi.fn().mockResolvedValue(undefined);
      mockGetDb.mockResolvedValue({ execute: mockExecute } as any);

      await embedAndStoreLetterVersion(10, "letter content");

      expect(mockExecute).toHaveBeenCalledOnce();
    });

    it("reports errors to Sentry and re-throws", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network fail"));

      await expect(embedAndStoreLetterVersion(10, "content")).rejects.toThrow("network fail");

      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: "embeddings", error_type: "embed_and_store_failed" },
          extra: { versionId: 10 },
        }),
      );
    });
  });

  describe("findSimilarLetters", () => {
    it("returns empty array when db is unavailable", async () => {
      mockGetDb.mockResolvedValue(null as any);
      const result = await findSimilarLetters("query text");
      expect(result).toEqual([]);
    });

    it("returns mapped results with parsed similarity", async () => {
      const fakeEmbedding = [0.1, 0.2];
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ data: [{ embedding: fakeEmbedding }] }), { status: 200 }),
      );

      const mockRows = [
        { id: 1, letter_request_id: 10, content: "Dear Sir...", similarity: "0.85" },
        { id: 2, letter_request_id: 20, content: "To Whom...", similarity: 0.92 },
      ];
      mockGetDb.mockResolvedValue({ execute: vi.fn().mockResolvedValue(mockRows) } as any);

      const results = await findSimilarLetters("query", 3, 0.7);

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.85);
      expect(results[1].similarity).toBe(0.92);
      expect(results[0].content).toBe("Dear Sir...");
    });

    it("catches errors, reports to Sentry, returns empty array", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("api down"));
      mockGetDb.mockResolvedValue({ execute: vi.fn() } as any);

      const result = await findSimilarLetters("query");

      expect(result).toEqual([]);
      expect(mockCapture).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { component: "embeddings", error_type: "similar_search_failed" },
        }),
      );
    });
  });
});

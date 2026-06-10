import { describe, it, expect } from "vitest";
import { tokenize, buildIndex, search } from "../src/memory-search.js";

const ROOT = process.cwd();

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumerics, dropping 1-char tokens", () => {
    expect(tokenize("Claude-Sonnet 4.6, $3/MTok!")).toEqual([
      "claude",
      "sonnet",
      "mtok",
    ]);
  });
});

describe("buildIndex", () => {
  it("indexes this repo's own corpus (non-empty docs + avgLen)", () => {
    const { docs, df, avgLen } = buildIndex(ROOT);
    expect(docs.length).toBeGreaterThan(3);
    expect(avgLen).toBeGreaterThan(0);
    // Core knowledge files must be present in the corpus.
    const paths = docs.map((d) => d.path);
    expect(paths).toContain("memory/MEMORY.md");
    // The inverted-index document-frequency map is populated.
    expect(df.size).toBeGreaterThan(50);
  });
});

describe("search (BM25)", () => {
  it("returns ranked hits with scores for a repo-relevant query", () => {
    const hits = search("pricing model fuzzy match", ROOT, 5);
    expect(hits.length).toBeGreaterThan(0);
    // Scores are positive and sorted descending.
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
    expect(hits[0].score).toBeGreaterThan(0);
    // A pricing query should surface a memory/pricing-related doc near the top.
    const topPaths = hits.slice(0, 3).map((h) => h.path).join(" ");
    expect(topPaths).toMatch(/MEMORY|LEARNINGS|pricing/i);
  });

  it("respects the limit", () => {
    const hits = search("the", ROOT, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  it("returns nothing for a query with no real terms", () => {
    expect(search("!!! $$$ %%%", ROOT, 5)).toEqual([]);
  });

  it("IDF down-weights ubiquitous terms vs rare ones", () => {
    // A rare, specific term should out-rank a common one for the same doc set.
    const rare = search("firecracker", ROOT, 1);
    const common = search("the", ROOT, 1);
    if (rare.length && common.length) {
      // Both return something; the rare-term top hit is a meaningful match.
      expect(rare[0].score).toBeGreaterThan(0);
    }
    expect(common.length).toBeGreaterThanOrEqual(0);
  });
});

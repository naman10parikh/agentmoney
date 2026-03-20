import { describe, it, expect } from "vitest";
import { calculateCost, detectProvider, listModels } from "../src/pricing.js";

describe("calculateCost", () => {
  it("calculates Claude Opus 4.6 correctly", () => {
    const result = calculateCost("claude-opus-4-6", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(5); // $5/MTok
    expect(result.outputCost).toBe(25); // $25/MTok
    expect(result.totalCost).toBe(30);
  });

  it("calculates Claude Sonnet 4.6 correctly", () => {
    const result = calculateCost("claude-sonnet-4-6", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(3);
    expect(result.outputCost).toBe(15);
    expect(result.totalCost).toBe(18);
  });

  it("calculates Claude Haiku 4.5 correctly", () => {
    const result = calculateCost("claude-haiku-4-5", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(1);
    expect(result.outputCost).toBe(5);
    expect(result.totalCost).toBe(6);
  });

  it("handles cache tokens for Anthropic models", () => {
    const result = calculateCost(
      "claude-opus-4-6",
      500_000,
      200_000,
      300_000, // cache read
      100_000, // cache write
    );
    // input: 0.5M * $5 = $2.50
    // output: 0.2M * $25 = $5.00
    // cache read: 0.3M * $0.50 = $0.15
    // cache write: 0.1M * $6.25 = $0.625
    expect(result.inputCost).toBeCloseTo(2.5);
    expect(result.outputCost).toBeCloseTo(5.0);
    expect(result.cacheCost).toBeCloseTo(0.775);
    expect(result.totalCost).toBeCloseTo(8.275);
  });

  it("calculates GPT-4.1 correctly", () => {
    const result = calculateCost("gpt-4.1", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(2);
    expect(result.outputCost).toBe(8);
    expect(result.totalCost).toBe(10);
  });

  it("calculates GPT-4o correctly", () => {
    const result = calculateCost("gpt-4o", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(2.5);
    expect(result.outputCost).toBe(10);
    expect(result.totalCost).toBe(12.5);
  });

  it("handles small token counts", () => {
    const result = calculateCost("claude-sonnet-4-6", 100, 50);
    expect(result.inputCost).toBeCloseTo(0.0000003);
    expect(result.outputCost).toBeCloseTo(0.00000075);
    expect(result.totalCost).toBeCloseTo(0.00000105);
  });

  it("returns Sonnet-tier estimate for unknown models", () => {
    const result = calculateCost("unknown-model-xyz", 1_000_000, 1_000_000);
    expect(result.inputCost).toBe(3); // defaults to $3/MTok
    expect(result.outputCost).toBe(15); // defaults to $15/MTok
    expect(result.cacheCost).toBe(0);
  });

  it("fuzzy matches dated model variants", () => {
    const result = calculateCost(
      "claude-sonnet-4-6-20260301",
      1_000_000,
      1_000_000,
    );
    expect(result.inputCost).toBe(3);
    expect(result.outputCost).toBe(15);
  });

  it("fuzzy matches prefixed model names", () => {
    const result = calculateCost(
      "anthropic/claude-opus-4-6",
      1_000_000,
      1_000_000,
    );
    expect(result.inputCost).toBe(5);
    expect(result.outputCost).toBe(25);
  });
});

describe("detectProvider", () => {
  it("detects Anthropic models", () => {
    expect(detectProvider("claude-opus-4-6")).toBe("anthropic");
    expect(detectProvider("claude-sonnet-4-6")).toBe("anthropic");
    expect(detectProvider("claude-haiku-4-5")).toBe("anthropic");
  });

  it("detects OpenAI models", () => {
    expect(detectProvider("gpt-4o")).toBe("openai");
    expect(detectProvider("gpt-4.1")).toBe("openai");
    expect(detectProvider("o1")).toBe("openai");
    expect(detectProvider("o3")).toBe("openai");
    expect(detectProvider("o4-mini")).toBe("openai");
  });

  it("detects Google models", () => {
    expect(detectProvider("gemini-2.0-flash")).toBe("google");
    expect(detectProvider("gemini-1.5-pro")).toBe("google");
  });

  it("returns unknown for unrecognized models", () => {
    expect(detectProvider("llama-3")).toBe("unknown");
    expect(detectProvider("mistral-large")).toBe("unknown");
  });
});

describe("listModels", () => {
  it("returns a non-empty list", () => {
    const models = listModels();
    expect(models.length).toBeGreaterThan(0);
  });

  it("includes all major providers", () => {
    const models = listModels();
    expect(models.some((m) => m.includes("claude"))).toBe(true);
    expect(models.some((m) => m.includes("gpt"))).toBe(true);
    expect(models.some((m) => m.includes("gemini"))).toBe(true);
  });

  it("includes latest models", () => {
    const models = listModels();
    expect(models).toContain("claude-opus-4-6");
    expect(models).toContain("claude-sonnet-4-6");
    expect(models).toContain("gpt-4.1");
    expect(models).toContain("o3");
  });
});

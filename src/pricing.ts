// Pricing per million tokens (as of March 2026)
// Sources: platform.claude.com/docs/en/about-claude/pricing, openai.com/api/pricing

interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic — Claude 4.6
  "claude-opus-4-6": {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Anthropic — Claude 4.5
  "claude-opus-4-5": {
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
  },
  "claude-sonnet-4-5": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-haiku-4-5": {
    input: 1,
    output: 5,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  // Anthropic — Claude 4.1 / 4.0
  "claude-opus-4-1": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-opus-4": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-sonnet-4": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  // Anthropic — Claude 3.x legacy
  "claude-3-5-sonnet": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheWrite: 3.75,
  },
  "claude-3-5-haiku": {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheWrite: 1,
  },
  "claude-3-opus": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
  "claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.3,
  },
  // OpenAI — GPT-4.1 family
  "gpt-4.1": { input: 2, output: 8, cacheRead: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cacheRead: 0.1 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, cacheRead: 0.025 },
  // OpenAI — GPT-4o family
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  // OpenAI — o-series reasoning
  o3: { input: 2, output: 8, cacheRead: 0.5 },
  "o4-mini": { input: 1.1, output: 4.4, cacheRead: 0.275 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Google — Gemini
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-pro": { input: 1.25, output: 5 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
};

// Fuzzy match model names (handles suffixes like dates, versions)
function findModel(model: string): ModelPricing | null {
  // Exact match
  if (PRICING[model]) return PRICING[model];

  // Prefix match (e.g., "claude-sonnet-4-6-20260301" → "claude-sonnet-4-6")
  // Sort keys longest-first so "claude-haiku-4-5" matches before "claude-3-haiku"
  const sortedKeys = Object.keys(PRICING).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (model.startsWith(key)) return PRICING[key];
  }

  // Contains match (e.g., "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
  for (const key of sortedKeys) {
    if (model.includes(key)) return PRICING[key];
  }

  return null;
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): {
  inputCost: number;
  outputCost: number;
  cacheCost: number;
  totalCost: number;
} {
  const pricing = findModel(model);

  if (!pricing) {
    // Unknown model — estimate at $3/$15 per million (Sonnet-tier default)
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputCost = (outputTokens / 1_000_000) * 15;
    return {
      inputCost,
      outputCost,
      cacheCost: 0,
      totalCost: inputCost + outputCost,
    };
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cacheReadCost =
    (cacheReadTokens / 1_000_000) * (pricing.cacheRead ?? pricing.input);
  const cacheWriteCost =
    (cacheWriteTokens / 1_000_000) * (pricing.cacheWrite ?? pricing.input);
  const cacheCost = cacheReadCost + cacheWriteCost;
  const totalCost = inputCost + outputCost + cacheCost;

  return { inputCost, outputCost, cacheCost, totalCost };
}

export function detectProvider(
  model: string,
): "anthropic" | "openai" | "google" | "unknown" {
  if (model.includes("claude")) return "anthropic";
  if (
    model.includes("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4")
  )
    return "openai";
  if (model.includes("gemini")) return "google";
  return "unknown";
}

export function listModels(): string[] {
  return Object.keys(PRICING);
}

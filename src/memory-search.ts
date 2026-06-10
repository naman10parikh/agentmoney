// memory-search.ts — a REAL queryable index over THIS repo's own corpus.
//
// Ports the *intent* of energy/scripts/memory-search.sh (term-frequency x source
// weight) into code, but upgrades grep-counting to a genuine BM25 ranking with
// an inverted index. The corpus is this repo's own knowledge: brain/, memory/,
// docs/, plus the root harness docs (MEMORY.md, AGENTS.md, README.md, CLAUDE.md).
//
// BM25 (Okapi) is the standard sparse-retrieval ranking function: it rewards
// term frequency with diminishing returns (k1) and normalizes by document
// length (b), then scales each term by its inverse document frequency (IDF).
// grep alone (flat substring counts) cannot do IDF or length-normalization;
// this can.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

// ---- Tunable BM25 constants (standard defaults) -------------------------------
const K1 = 1.5; // term-frequency saturation
const B = 0.75; // length normalization strength

/** A document in the index: a markdown file from this repo's corpus. */
interface Doc {
  path: string; // repo-relative path
  /** token -> count in this doc */
  termFreq: Map<string, number>;
  length: number; // total tokens
  mtimeMs: number;
  sourceWeight: number; // authority multiplier (rules/memory > nav)
}

/** A single search hit. */
export interface SearchHit {
  path: string;
  score: number;
  /** Best-matching snippet (the highest-scoring line). */
  snippet: string;
}

/** Directories (relative to repo root) whose .md files form the corpus. */
const CORPUS_DIRS = ["brain", "memory", "docs", ".claude/rules", "identity"];
/** Individual root files that are part of the corpus. */
const CORPUS_FILES = [
  "MEMORY.md",
  "AGENTS.md",
  "README.md",
  "CLAUDE.md",
  "CONTEXT.md",
  "QUICKSTART.md",
];

/** Source authority weight — mirrors the .sh script's weight_for_source(). */
function sourceWeight(repoRelPath: string): number {
  if (repoRelPath.startsWith(".claude/rules/")) return 5;
  if (repoRelPath.includes("memory/LEARNINGS")) return 4;
  if (repoRelPath.startsWith("memory/topics/")) return 4;
  if (repoRelPath === "memory/MEMORY.md" || repoRelPath === "MEMORY.md") return 4;
  if (repoRelPath.startsWith("memory/daily/")) return 3;
  if (repoRelPath.startsWith("brain/")) return 2;
  return 1;
}

/** Tokenize text into lowercase alphanumeric word tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** Recursively collect *.md files under a directory. */
function collectMarkdown(dir: string, root: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return; // dir missing — skip silently
  }
  for (const name of entries) {
    if (name.startsWith(".") && name !== ".claude") continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      collectMarkdown(full, root, out);
    } else if (extname(name) === ".md") {
      out.push(full);
    }
  }
}

/**
 * Build the BM25 index over the repo corpus.
 * @param root absolute path to the repo root.
 */
export function buildIndex(root: string): {
  docs: Doc[];
  df: Map<string, number>; // document frequency per term
  avgLen: number;
} {
  const files: string[] = [];
  for (const d of CORPUS_DIRS) collectMarkdown(join(root, d), root, files);
  for (const f of CORPUS_FILES) {
    const full = join(root, f);
    if (existsSync(full)) files.push(full);
  }

  const docs: Doc[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const tokens = tokenize(raw);
    if (tokens.length === 0) continue;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);

    const repoRel = relative(root, file);
    docs.push({
      path: repoRel,
      termFreq: tf,
      length: tokens.length,
      mtimeMs: statSync(file).mtimeMs,
      sourceWeight: sourceWeight(repoRel),
    });
    totalLen += tokens.length;
  }

  return { docs, df, avgLen: docs.length ? totalLen / docs.length : 0 };
}

/** IDF with the standard BM25 (+0.5 smoothing) formula. */
function idf(termDf: number, n: number): number {
  return Math.log(1 + (n - termDf + 0.5) / (termDf + 0.5));
}

/** Pull the highest-scoring single line from a file for the snippet. */
function bestSnippet(absPath: string, queryTerms: string[]): string {
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return "";
  }
  let best = "";
  let bestScore = -1;
  for (const line of raw.split("\n")) {
    const lineTokens = new Set(tokenize(line));
    let s = 0;
    for (const q of queryTerms) if (lineTokens.has(q)) s++;
    if (s > bestScore && line.trim().length > 0) {
      bestScore = s;
      best = line.trim();
    }
  }
  return best.length > 200 ? best.slice(0, 197) + "..." : best;
}

/**
 * Search the corpus with BM25, blended with the source-authority weight.
 * @returns hits sorted by score, highest first.
 */
export function search(
  query: string,
  root: string,
  limit = 5,
): SearchHit[] {
  const { docs, df, avgLen } = buildIndex(root);
  const n = docs.length;
  if (n === 0) return [];
  const qTerms = [...new Set(tokenize(query))];
  if (qTerms.length === 0) return [];

  const scored: SearchHit[] = [];
  for (const doc of docs) {
    let score = 0;
    for (const term of qTerms) {
      const tf = doc.termFreq.get(term);
      if (!tf) continue;
      const termIdf = idf(df.get(term) ?? 0, n);
      const denom = tf + K1 * (1 - B + B * (doc.length / (avgLen || 1)));
      score += termIdf * ((tf * (K1 + 1)) / denom);
    }
    if (score <= 0) continue;
    // Blend in source authority (multiplicative, like the .sh script).
    score *= doc.sourceWeight;
    scored.push({
      path: doc.path,
      score,
      snippet: bestSnippet(join(root, doc.path), qTerms),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Intelligent Document Analysis and Knowledge Extraction Engine
 * Issue #42 (AI-14)
 */

export interface ExtractedKnowledge {
  summary: string;
  category: string;
  keyEntities: string[];
  metrics: {
    totalLines: number;
    headingCount: number;
    characterCount: number;
    wordCount: number;
  };
  completenessScore: number;
}

export function analyzeDocument(content: string): ExtractedKnowledge {
  if (!content || content.trim().length === 0) {
    throw new Error("Document content cannot be empty.");
  }

  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const headings = lines.filter((l) => l.startsWith("#"));
  const words = content.trim().split(/\s+/);

  // Stellar & Soroban domain keyword extraction
  const keywords = [
    "Soroban",
    "Stellar",
    "RPC",
    "Horizon",
    "XDR",
    "Smart Contract",
    "Transaction",
    "SDK",
    "Rust",
    "Wasm",
  ];

  const foundEntities = keywords.filter((kw) =>
    new RegExp(`\\b${kw}\\b`, "i").test(content)
  );

  // Completeness scoring algorithm (0 - 100)
  let score = 40;
  if (headings.length >= 2) score += 20;
  if (foundEntities.length >= 2) score += 20;
  if (words.length >= 100) score += 20;

  return {
    summary: lines[0]?.replace(/^#+\s*/, "").trim() || "Document Summary",
    category: foundEntities.includes("Soroban")
      ? "Soroban Smart Contracts"
      : foundEntities.includes("Stellar")
      ? "Stellar Core Architecture"
      : "General Documentation",
    keyEntities: Array.from(new Set(foundEntities)),
    metrics: {
      totalLines: lines.length,
      headingCount: headings.length,
      characterCount: content.length,
      wordCount: words.length,
    },
    completenessScore: Math.min(score, 100),
  };
}

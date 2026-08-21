import type {
  CodeExample,
  KnowledgeGraphSnapshot,
  ProcessedDocument,
  SearchResponse,
  SearchResult,
} from '../../types/documentAnalysis';
import { tokenize } from './extraction';
import { expandConcepts, nodeIdFor } from './knowledgeGraph';

const K1 = 1.4;
const B = 0.72;
const GRAPH_BOOST_PER_CONCEPT = 0.35;
const MAX_GRAPH_BOOST = 1.05;

export interface PassageRecord {
  documentId: string;
  documentTitle: string;
  sectionId: string;
  heading: string;
  text: string;
  url?: string;
  language: ProcessedDocument['language'];
  termFreq: Map<string, number>;
  length: number;
  concepts: string[];
}

export interface SearchIndex {
  passages: PassageRecord[];
  documentFrequency: Map<string, number>;
  averageLength: number;
}

export function buildIndex(documents: ProcessedDocument[]): SearchIndex {
  const passages: PassageRecord[] = [];
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const section of document.sections) {
      const tokens = tokenize(`${section.heading} ${section.text}`, document.language);
      if (!tokens.length) continue;
      const termFreq = new Map<string, number>();
      const seen = new Set<string>();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
        seen.add(token);
      }
      for (const token of seen) {
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
      passages.push({
        documentId: document.id,
        documentTitle: document.title,
        sectionId: section.id,
        heading: section.heading,
        text: section.text,
        url: document.url,
        language: document.language,
        termFreq,
        length: tokens.length,
        concepts: document.concepts.map((concept) => concept.toLowerCase()),
      });
    }
  }
  const averageLength =
    passages.reduce((sum, passage) => sum + passage.length, 0) / Math.max(1, passages.length);
  return { passages, documentFrequency, averageLength };
}

function bm25(
  index: SearchIndex,
  passage: PassageRecord,
  queryTokens: string[],
  totalPassages: number
): number {
  let score = 0;
  for (const token of new Set(queryTokens)) {
    const tf = passage.termFreq.get(token) ?? 0;
    if (!tf) continue;
    const df = index.documentFrequency.get(token) ?? 1;
    const idf = Math.log(1 + (totalPassages - df + 0.5) / (df + 0.5));
    const denominator = tf + K1 * (1 - B + B * (passage.length / Math.max(1, index.averageLength)));
    score += idf * ((tf * (K1 + 1)) / denominator);
  }
  return score;
}

export function buildSnippet(text: string, queryTokens: string[], width = 220): string {
  const lower = text.toLowerCase();
  let position = -1;
  for (const token of queryTokens) {
    position = lower.indexOf(token);
    if (position >= 0) break;
  }
  if (position < 0) return `${text.slice(0, width).trim()}${text.length > width ? '…' : ''}`;
  const start = Math.max(0, position - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

interface SearchOptions {
  limit?: number;
  boostTerms?: string[];
}

export function search(
  index: SearchIndex,
  snapshot: KnowledgeGraphSnapshot,
  query: string,
  options: SearchOptions = {}
): SearchResponse {
  const startedAt = Date.now();
  const limit = options.limit ?? 8;
  const trimmedQuery = query.trim();
  if (!trimmedQuery || !index.passages.length) {
    return { query: trimmedQuery, results: [], tookMs: Date.now() - startedAt, totalMatches: 0 };
  }
  const queryTokens = tokenize(trimmedQuery);
  const totalPassages = index.passages.length;

  const seedIds = snapshot.nodes
    .filter((node) => {
      const label = node.label.toLowerCase();
      return (
        queryTokens.includes(label) ||
        queryTokens.some((token) => label.split(/\s+/).includes(token)) ||
        label.split(/\s+/).every((word) => word.length > 2 && queryTokens.includes(word))
      );
    })
    .map((node) => node.id);
  const expandedIds = seedIds.length ? expandConcepts(snapshot, seedIds, 1) : seedIds;
  const expandedLabels = new Set(
    snapshot.nodes
      .filter((node) => expandedIds.includes(node.id))
      .flatMap((node) => [node.label.toLowerCase(), ...node.label.toLowerCase().split(/\s+/)])
  );

  const boostTerms = (options.boostTerms ?? []).map((term) => term.toLowerCase());
  const scored: Array<{ result: SearchResult; raw: number }> = [];
  for (const passage of index.passages) {
    const base = bm25(index, passage, queryTokens, totalPassages);
    if (base <= 0) continue;
    let graphBoost = 0;
    const matchedConcepts: string[] = [];
    for (const concept of passage.concepts) {
      if (expandedLabels.has(concept)) {
        graphBoost += GRAPH_BOOST_PER_CONCEPT;
        matchedConcepts.push(concept);
      }
    }
    graphBoost = Math.min(graphBoost, MAX_GRAPH_BOOST);
    const phraseBoost = boostTerms.some((term) => passage.text.toLowerCase().includes(term))
      ? 0.4
      : 0;
    const raw = base + graphBoost + phraseBoost;
    const normalized = raw / (raw + 3);
    scored.push({
      raw,
      result: {
        documentId: passage.documentId,
        documentTitle: passage.documentTitle,
        sectionId: passage.sectionId,
        heading: passage.heading,
        snippet: buildSnippet(passage.text, queryTokens),
        score: Math.round(normalized * 100) / 100,
        matchedConcepts: [...new Set(matchedConcepts)].slice(0, 4),
        explanation: buildExplanation(base, graphBoost, phraseBoost, matchedConcepts),
        citation: {
          documentId: passage.documentId,
          documentTitle: passage.documentTitle,
          sectionId: passage.sectionId,
          heading: passage.heading,
          url: passage.url,
        },
      },
    });
  }
  scored.sort((a, b) => b.raw - a.raw || a.result.documentId.localeCompare(b.result.documentId));
  const relevant = scored.filter((item) => item.raw > 0.35);
  return {
    query: trimmedQuery,
    results: relevant.slice(0, limit).map((item) => item.result),
    tookMs: Date.now() - startedAt,
    totalMatches: relevant.length,
  };
}

function buildExplanation(
  base: number,
  graphBoost: number,
  phraseBoost: number,
  matchedConcepts: string[]
): string {
  const parts = [`keyword relevance ${base.toFixed(2)}`];
  if (graphBoost > 0 && matchedConcepts.length) {
    parts.push(`graph expansion via ${matchedConcepts.slice(0, 2).join(', ')}`);
  }
  if (phraseBoost > 0) parts.push('troubleshooting context');
  return parts.join(' + ');
}

export function searchCodeExamples(
  documents: ProcessedDocument[],
  query: string,
  limit = 5
): Array<CodeExample & { documentId: string; documentTitle: string }> {
  const queryTokens = tokenize(query);
  const scored: Array<{ example: CodeExample & { documentId: string; documentTitle: string }; score: number }> = [];
  for (const document of documents) {
    for (const example of document.codeExamples) {
      const haystack = tokenize(
        `${example.title ?? ''} ${example.relatedConcepts.join(' ')} ${example.language} ${example.code}`
      );
      const haystackSet = new Set(haystack);
      let score = 0;
      for (const token of queryTokens) {
        if (haystackSet.has(token)) score += 1;
        else if (example.code.toLowerCase().includes(token)) score += 0.4;
      }
      if (score > 0) {
        scored.push({
          example: { ...example, documentId: document.id, documentTitle: document.title },
          score,
        });
      }
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.example.id.localeCompare(b.example.id))
    .slice(0, limit)
    .map((item) => item.example);
}

export { nodeIdFor };

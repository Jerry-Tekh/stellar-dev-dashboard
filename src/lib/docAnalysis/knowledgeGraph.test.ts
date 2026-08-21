import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../../types/documentAnalysis';
import { processDocument } from './extraction';
import {
  addDocumentToGraph,
  clusterTopics,
  computeExperts,
  computeTrends,
  createGraph,
  detectKnowledgeGaps,
  expandConcepts,
  finalizeGraph,
  nodeIdFor,
  upsertEdge,
} from './knowledgeGraph';

function doc(
  title: string,
  markdown: string,
  overrides: Partial<ProcessedDocument> = {}
): ProcessedDocument {
  return processDocument(
    {
      title,
      format: 'markdown',
      source: 'docs',
      content: markdown,
      ...overrides,
    },
    null,
    '2026-08-01T00:00:00.000Z'
  );
}

const PAYMENT_DOC = () =>
  doc(
    'Payments Guide',
    `# Payments\n\nThe payment operation moves value between accounts.\nA payment requires a trustline for issued assets.\nHorizon uses Stellar Core for consensus.`,
    { publishedAt: '2026-07-01T00:00:00.000Z' }
  );

const SOROBAN_DOC = () =>
  doc(
    'Soroban Guide',
    `# Soroban\n\nSoroban requires a Footprint for invocation.\nSmart contracts use WebAssembly.`,
    { publishedAt: '2026-07-02T00:00:00.000Z' }
  );

describe('graph construction', () => {
  it('creates nodes with provenance and deterministic ids', () => {
    const graph = createGraph();
    addDocumentToGraph(graph, PAYMENT_DOC());
    const snapshot = finalizeGraph(graph, [PAYMENT_DOC()], '2026-08-20T00:00:00.000Z');
    expect(snapshot.stats.documentCount).toBe(1);
    expect(snapshot.nodes.length).toBeGreaterThan(3);
    const payment = snapshot.nodes.find((node) => node.label === 'payment operation');
    expect(payment?.id).toBe(nodeIdFor('payment operation'));
    expect(payment?.sourceDocIds).toContain('payments-guide-' + PAYMENT_DOC().checksum);
  });

  it('merges duplicate entities across documents without duplicating nodes', () => {
    const graph = createGraph();
    const first = PAYMENT_DOC();
    const second = doc(
      'Payments Followup',
      '# Payments Again\n\nThe payment operation appears again here with a trustline.'
    );
    addDocumentToGraph(graph, first);
    addDocumentToGraph(graph, second);
    const snapshot = finalizeGraph(graph, [first, second]);
    const paymentNodes = snapshot.nodes.filter((node) => node.label === 'payment operation');
    expect(paymentNodes).toHaveLength(1);
    expect(paymentNodes[0].sourceDocIds).toHaveLength(2);
    expect(paymentNodes[0].mentions).toBeGreaterThanOrEqual(2);
  });

  it('extracts typed edges between known entities', () => {
    const graph = createGraph();
    const document = PAYMENT_DOC();
    addDocumentToGraph(graph, document);
    const snapshot = finalizeGraph(graph, [document]);
    const depends = snapshot.edges.filter((edge) => edge.type === 'depends-on');
    expect(depends.length).toBeGreaterThan(0);
    expect(depends[0].sourceDocIds).toContain(document.id);
  });

  it('deduplicates repeated edges by increasing weight', () => {
    const graph = createGraph();
    const document = PAYMENT_DOC();
    addDocumentToGraph(graph, document);
    addDocumentToGraph(graph, document);
    const edges = [...graph.edges.values()];
    expect(edges.every((edge) => edge.weight >= 2)).toBe(true);
  });

  it('ignores self edges', () => {
    const graph = createGraph();
    upsertEdge(graph, 'a', 'a', 'relates-to', 'doc', '2026-01-01');
    expect(graph.edges.size).toBe(0);
  });
});

describe('expandConcepts', () => {
  it('returns multi-hop neighbors deterministically', () => {
    const graph = createGraph();
    const documents = [PAYMENT_DOC(), SOROBAN_DOC()];
    documents.forEach((document) => addDocumentToGraph(graph, document));
    const snapshot = finalizeGraph(graph, documents);
    const seed = nodeIdFor('payment operation');
    const oneHop = expandConcepts(snapshot, [seed], 1);
    expect(oneHop).toContain(seed);
    const twoHops = expandConcepts(snapshot, [seed], 2);
    expect(twoHops.length).toBeGreaterThanOrEqual(oneHop.length);
    expect([...twoHops].sort()).toEqual(twoHops);
  });
});

describe('clusterTopics', () => {
  it('groups connected nodes and labels clusters deterministically', () => {
    const graph = createGraph();
    const documents = [PAYMENT_DOC(), SOROBAN_DOC()];
    documents.forEach((document) => addDocumentToGraph(graph, document));
    const snapshot = finalizeGraph(graph, documents);
    expect(snapshot.clusters.length).toBeGreaterThan(0);
    for (const cluster of snapshot.clusters) {
      expect(cluster.nodeIds).toHaveLength(cluster.nodeIds.length);
      expect(cluster.topTerms.length).toBeGreaterThan(0);
      expect(cluster.cohesion).toBeGreaterThanOrEqual(0);
      expect(cluster.cohesion).toBeLessThanOrEqual(1);
    }
  });
});

describe('computeTrends', () => {
  it('buckets concept mentions by period and computes direction', () => {
    const early = doc(
      'Early',
      '# Early\n\nThe payment operation is discussed.',
      { publishedAt: '2026-06-01T00:00:00.000Z' }
    );
    const late = doc(
      'Late',
      '# Late\n\nThe payment operation is discussed again.',
      { publishedAt: '2026-08-01T00:00:00.000Z' }
    );
    const trends = computeTrends([early, late]);
    const payment = trends.find((trend) => trend.concept === 'payment operation');
    expect(payment).toBeDefined();
    expect(payment?.points.map((point) => point.period)).toEqual(['2026-06-01', '2026-08-01']);
    expect(['rising', 'falling', 'stable']).toContain(payment?.direction);
  });
});

describe('detectKnowledgeGaps', () => {
  it('flags orphan and thin concepts', () => {
    const graph = createGraph();
    const documents = [
      doc('A', '# A\n\nThe inflation operation is mentioned once.'),
      doc('B', '# B\n\nThe ledger stores data. The ledger is immutable.'),
    ];
    documents.forEach((document) => addDocumentToGraph(graph, document));
    const snapshot = finalizeGraph(graph, documents);
    const gaps = detectKnowledgeGaps(snapshot, documents);
    expect(gaps.length).toBeGreaterThan(0);
    const reasons = new Set(gaps.map((gap) => gap.reason));
    expect(reasons.size).toBeGreaterThan(0);
    for (const gap of gaps) expect(gap.suggestion).toContain(gap.concept);
  });
});

describe('computeExperts', () => {
  it('ranks community authors by contribution score', () => {
    const forumDoc = processDocument({
      title: 'Forum post',
      format: 'markdown',
      source: 'forum',
      author: 'alice',
      content:
        '# Post\n\nThe payment operation failed with a trustline error. The trustline was missing for the asset.',
    });
    const experts = computeExperts([forumDoc]);
    expect(experts[0]?.author).toBe('alice');
    expect(experts[0]?.contributions).toBe(1);
    expect(experts[0]?.concepts.length).toBeGreaterThan(0);
  });
});

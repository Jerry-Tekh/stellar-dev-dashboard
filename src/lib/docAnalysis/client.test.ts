import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RawDocumentInput } from '../../types/documentAnalysis';
import {
  analyzeAndPersist,
  analyzeDocuments,
  askQuestionFromSnapshot,
  clearPersistedAnalysis,
  DocAnalysisError,
  loadPersistedAnalysis,
  loadValidations,
  saveValidations,
  searchSnapshot,
} from './client';

const DOC_A: RawDocumentInput = {
  title: 'Payments Explained',
  format: 'markdown',
  source: 'docs',
  publishedAt: '2026-06-01T00:00:00.000Z',
  content: `# Payments\n\nThe payment operation moves value between accounts.\nA payment requires a trustline for issued assets.`,
};

const DOC_B: RawDocumentInput = {
  title: 'Trustlines',
  format: 'markdown',
  source: 'docs',
  author: 'carol_builds',
  publishedAt: '2026-07-01T00:00:00.000Z',
  content: `# Trustlines\n\nA trustline authorizes an asset for an account.\nThe ledger records every trustline change.`,
};

describe('analyzeDocuments', () => {
  it('builds a full snapshot from raw inputs', async () => {
    const snapshot = await analyzeDocuments([DOC_A, DOC_B]);
    expect(snapshot.documents).toHaveLength(2);
    expect(snapshot.graph.stats.nodeCount).toBeGreaterThan(3);
    expect(snapshot.graph.stats.edgeCount).toBeGreaterThan(0);
    expect(snapshot.insights.learningPaths).toHaveLength(3);
    expect(snapshot.methodologyVersion).toBe('doc-analysis-v1');
  });

  it('is deterministic for identical inputs', async () => {
    const first = await analyzeDocuments([DOC_A, DOC_B]);
    const second = await analyzeDocuments([DOC_A, DOC_B]);
    expect(first.graph.nodes.map((node) => node.id)).toEqual(
      second.graph.nodes.map((node) => node.id)
    );
    expect(first.documents[0].checksum).toBe(second.documents[0].checksum);
  });

  it('deduplicates identical documents', async () => {
    const snapshot = await analyzeDocuments([DOC_A, { ...DOC_A }]);
    expect(snapshot.documents).toHaveLength(1);
  });

  it('rejects invalid batches with typed errors', async () => {
    await expect(analyzeDocuments([])).rejects.toThrow(DocAnalysisError);
    await expect(
      analyzeDocuments([{ title: '', format: 'text', source: 'docs', content: 'x' }])
    ).rejects.toMatchObject({ code: 'invalid-document' });
    await expect(
      analyzeDocuments([{ title: 'Empty', format: 'text', source: 'docs', content: '   ' }])
    ).rejects.toMatchObject({ code: 'invalid-document' });
  });
});

describe('persistence', () => {
  beforeEach(async () => {
    await clearPersistedAnalysis();
  });

  it('round-trips analysis through IndexedDB', async () => {
    expect(await loadPersistedAnalysis()).toBeNull();
    const { snapshot, persisted } = await analyzeAndPersist([DOC_A, DOC_B]);
    expect(persisted).toBe(true);
    const loaded = await loadPersistedAnalysis();
    expect(loaded?.snapshot.generatedAt).toBe(snapshot.generatedAt);
    expect(loaded?.rawInputs).toHaveLength(2);
    expect(loaded?.usingFixtures).toBe(false);
  });

  it('clears persisted analysis', async () => {
    await analyzeAndPersist([DOC_A]);
    await clearPersistedAnalysis();
    expect(await loadPersistedAnalysis()).toBeNull();
  });
});

describe('query surfaces', () => {
  it('answers questions and searches over a snapshot', async () => {
    const { snapshot } = await analyzeAndPersist([DOC_A, DOC_B]);
    const answer = askQuestionFromSnapshot(snapshot, 'What is a trustline?');
    expect(answer.answer.length).toBeGreaterThan(10);
    expect(answer.citations.length).toBeGreaterThan(0);
    const results = searchSnapshot(snapshot, 'payment operation');
    expect(results.results.length).toBeGreaterThan(0);
    expect(results.results[0].matchedConcepts.length).toBeGreaterThan(0);
  });
});

describe('fact validations', () => {
  it('persists community validation state', async () => {
    await saveValidations([
      { key: 'demo-payments-guide:payment operation', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
    ]);
    const stored = await loadValidations();
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('confirmed');
  });

  it('ignores malformed stored validations', async () => {
    await saveValidations([{ bogus: true } as never]);
    expect(await loadValidations()).toHaveLength(0);
  });
});

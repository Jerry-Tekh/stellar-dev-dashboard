import { describe, expect, it } from 'vitest';
import type { ProcessedDocument } from '../../types/documentAnalysis';
import { processDocument } from './extraction';
import { addDocumentToGraph, createGraph, finalizeGraph } from './knowledgeGraph';
import { generateLearningPaths } from './learningPaths';
import { answerQuestion, classifyQuestion } from './qaEngine';
import { buildIndex, search, searchCodeExamples } from './searchEngine';

function buildCorpus(): ProcessedDocument[] {
  const inputs: Array<{ title: string; content: string; publishedAt?: string }> = [
    {
      title: 'Accounts and Payments',
      publishedAt: '2026-07-01T00:00:00.000Z',
      content: `# Accounts\n\nAn account holds a balance of XLM on the Stellar network.\nEvery account requires a sequence number.\n\n# Payments\n\nThe payment operation moves value between accounts.\nA payment requires a trustline when using issued assets.`,
    },
    {
      title: 'Trustlines Deep Dive',
      publishedAt: '2026-07-05T00:00:00.000Z',
      content: `# Trustlines\n\nA trustline authorizes an asset for an account.\nThe trustline requires a base reserve.\nIssued assets such as USDC need a trustline before payment.`,
    },
    {
      title: 'Soroban Contracts',
      publishedAt: '2026-07-20T00:00:00.000Z',
      content: `# Soroban\n\nSoroban is the smart contracts platform.\nSoroban requires a Footprint for every invocation.\nBudget metering limits instruction usage.\n\n## Example\n\n\`\`\`js\nconst contract = await deployContract();\n\`\`\``,
    },
    {
      title: 'Consensus Protocol',
      publishedAt: '2026-08-01T00:00:00.000Z',
      content: `# Consensus\n\nThe Stellar Consensus Protocol reaches agreement without proof of work.\nQuorum slices determine safety.\nHorizon uses Stellar Core for validation.`,
    },
  ];
  return inputs.map((input) =>
    processDocument(
      {
        title: input.title,
        format: 'markdown',
        source: 'docs',
        content: input.content,
        publishedAt: input.publishedAt,
      },
      null,
      '2026-08-10T00:00:00.000Z'
    )
  );
}

function buildSnapshot(documents: ProcessedDocument[]) {
  const graph = createGraph();
  documents.forEach((document) => addDocumentToGraph(graph, document));
  return finalizeGraph(graph, documents, '2026-08-20T00:00:00.000Z');
}

describe('searchEngine', () => {
  const documents = buildCorpus();
  const snapshot = buildSnapshot(documents);
  const index = buildIndex(documents);

  it('ranks the most relevant passage first', () => {
    const response = search(index, snapshot, 'how does a trustline work');
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0].documentTitle).toBe('Trustlines Deep Dive');
    expect(response.results[0].score).toBeGreaterThan(0);
    expect(response.results[0].snippet).toContain('rustline');
    expect(response.tookMs).toBeGreaterThanOrEqual(0);
  });

  it('returns contextual snippets and explanations', () => {
    const response = search(index, snapshot, 'payment operation');
    const first = response.results[0];
    expect(first.explanation).toMatch(/keyword relevance/);
    expect(first.citation.documentId).toBe(first.documentId);
    expect(first.citation.heading).toBeTruthy();
  });

  it('uses graph expansion to surface related passages', () => {
    const direct = search(index, snapshot, 'trustline', { limit: 8 });
    expect(direct.results.some((result) => result.documentTitle === 'Accounts and Payments')).toBe(
      true
    );
  });

  it('handles empty and unknown queries gracefully', () => {
    expect(search(index, snapshot, '').results).toHaveLength(0);
    const response = search(index, snapshot, 'zeppelin quantum blockchain');
    expect(response.totalMatches).toBe(0);
  });

  it('finds code examples by concept', () => {
    const examples = searchCodeExamples(documents, 'deploy contract example');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0].language).toBe('js');
    expect(examples[0].documentTitle).toBe('Soroban Contracts');
  });
});

describe('qaEngine', () => {
  const documents = buildCorpus();
  const snapshot = buildSnapshot(documents);
  const index = buildIndex(documents);

  it('classifies question intents', () => {
    expect(classifyQuestion('What is a trustline?')).toBe('what-is');
    expect(classifyQuestion('How do I deploy a contract?')).toBe('how-to');
    expect(classifyQuestion('My payment failed with an error')).toBe('troubleshooting');
    expect(classifyQuestion('Show me a code example')).toBe('code-example');
    expect(classifyQuestion('Soroban versus Ethereum contracts')).toBe('comparison');
    expect(classifyQuestion('Stellar fees')).toBe('general');
  });

  it('answers what-is questions with citations and confidence', () => {
    const answer = answerQuestion(index, snapshot, documents, 'What is a trustline?');
    expect(answer.questionType).toBe('what-is');
    expect(answer.answer.length).toBeGreaterThan(10);
    expect(answer.confidence).toBeGreaterThan(0.1);
    expect(answer.confidence).toBeLessThanOrEqual(0.97);
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.citations[0].documentTitle).toBeTruthy();
  });

  it('routes troubleshooting questions toward failure context', () => {
    const answer = answerQuestion(
      index,
      snapshot,
      documents,
      'payment error because trustline is missing'
    );
    expect(answer.questionType).toBe('troubleshooting');
    expect(answer.citations.length).toBeGreaterThan(0);
  });

  it('returns code examples for code questions', () => {
    const answer = answerQuestion(index, snapshot, documents, 'contract deployment code example');
    expect(answer.questionType).toBe('code-example');
    expect(answer.codeExamples?.length ?? 0).toBeGreaterThan(0);
  });

  it('admits ignorance when nothing matches', () => {
    const answer = answerQuestion(index, snapshot, documents, 'quantum zeppelins on mars');
    expect(answer.confidence).toBeLessThanOrEqual(0.1);
    expect(answer.citations).toHaveLength(0);
  });
});

describe('learningPaths', () => {
  const documents = buildCorpus();
  const snapshot = buildSnapshot(documents);

  it('generates ordered paths with cited steps per level', () => {
    const paths = generateLearningPaths(snapshot, documents);
    expect(paths.map((path) => path.level)).toEqual(['beginner', 'intermediate', 'advanced']);
    const beginner = paths[0];
    expect(beginner.steps.length).toBeGreaterThan(0);
    for (const step of beginner.steps) {
      expect(step.documentTitle).toBeTruthy();
      expect(step.description.length).toBeGreaterThan(10);
      expect(step.concepts.length).toBeGreaterThan(0);
    }
  });

  it('places dependency prerequisites before dependents', () => {
    const paths = generateLearningPaths(snapshot, documents);
    const allSteps = paths.flatMap((path) => path.steps.map((step) => step.concepts[0]));
    if (allSteps.includes('trustline') && allSteps.includes('payment operation')) {
      expect(allSteps.indexOf('trustline')).toBeLessThan(allSteps.indexOf('payment operation'));
    }
  });
});

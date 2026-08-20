import type {
  AnswerResponse,
  DocAnalysisApiError,
  DocAnalysisInsights,
  DocAnalysisSnapshot,
  FactValidationStatus,
  ProcessedDocument,
  RawDocumentInput,
  SearchResponse,
} from '../../types/documentAnalysis';
import { getStoredValue, removeStoredValue, setStoredValue } from '../storage';
import {
  buildCorpusStatistics,
  fnv1a,
  processDocument,
} from './extraction';
import { createDemoCorpus } from './fixtures';
import {
  addDocumentToGraph,
  computeExperts,
  computeTrends,
  createGraph,
  detectKnowledgeGaps,
  finalizeGraph,
} from './knowledgeGraph';
import { generateLearningPaths } from './learningPaths';
import { answerQuestion } from './qaEngine';
import { buildIndex, search } from './searchEngine';

export const METHODOLOGY_VERSION = 'doc-analysis-v1';

const SNAPSHOT_STORE_KEY = 'doc-analysis:snapshot-v1';
const VALIDATIONS_KEY = 'stellar:doc-analysis:validations';
const MAX_DOCUMENTS = 500;

export class DocAnalysisError extends Error implements DocAnalysisApiError {
  code: DocAnalysisApiError['code'];
  retryable: boolean;
  requestId?: string;
  constructor(error: DocAnalysisApiError) {
    super(error.message);
    this.name = 'DocAnalysisError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.requestId = error.requestId;
  }
}

const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `doc-analysis-${Date.now()}`;

interface PersistedAnalysis {
  version: 1;
  rawInputs: RawDocumentInput[];
  snapshot: DocAnalysisSnapshot;
  usingFixtures: boolean;
}

function isValidRawInput(value: unknown): value is RawDocumentInput {
  const input = value as RawDocumentInput;
  return Boolean(
    input &&
      typeof input === 'object' &&
      typeof input.title === 'string' &&
      typeof input.content === 'string' &&
      ['markdown', 'html', 'text'].includes(input.format) &&
      ['docs', 'whitepaper', 'specification', 'forum', 'community'].includes(input.source)
  );
}

export function isSnapshot(value: unknown): value is DocAnalysisSnapshot {
  const snapshot = value as DocAnalysisSnapshot;
  return Boolean(
    snapshot &&
      typeof snapshot === 'object' &&
      Array.isArray(snapshot.documents) &&
      Array.isArray(snapshot.graph?.nodes) &&
      Array.isArray(snapshot.graph?.edges) &&
      typeof snapshot.insights === 'object'
  );
}

function validateInputs(inputs: RawDocumentInput[]): void {
  if (!Array.isArray(inputs) || !inputs.length) {
    throw new DocAnalysisError({
      code: 'invalid-document',
      message: 'At least one document is required.',
      retryable: false,
    });
  }
  if (inputs.length > MAX_DOCUMENTS) {
    throw new DocAnalysisError({
      code: 'invalid-document',
      message: `Batch limited to ${MAX_DOCUMENTS} documents.`,
      retryable: false,
    });
  }
  for (const input of inputs) {
    if (!isValidRawInput(input)) {
      throw new DocAnalysisError({
        code: 'invalid-document',
        message: 'Each document needs a title, content, format, and source.',
        retryable: false,
      });
    }
    if (!input.title.trim()) {
      throw new DocAnalysisError({
        code: 'invalid-document',
        message: 'A document title is empty.',
        retryable: false,
      });
    }
    if (!input.content.trim()) {
      throw new DocAnalysisError({
        code: 'invalid-document',
        message: `"${input.title}" has no content.`,
        retryable: false,
      });
    }
  }
}

function dedupeByChecksum(inputs: RawDocumentInput[]): RawDocumentInput[] {
  const seen = new Set<string>();
  const unique: RawDocumentInput[] = [];
  for (const input of inputs) {
    const key = `${input.title}|${fnv1a(`${input.title}|${input.content.slice(0, 5000)}`)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(input);
  }
  return unique;
}

function buildInsights(
  documents: ProcessedDocument[],
  graphNodes: DocAnalysisSnapshot['graph']['nodes'],
  graphEdges: DocAnalysisSnapshot['graph']['edges'],
  generatedAt: string
): DocAnalysisInsights {
  const snapshotForInsights = { nodes: graphNodes, edges: graphEdges };
  return {
    generatedAt,
    trends: computeTrends(documents),
    gaps: detectKnowledgeGaps(
      { nodes: graphNodes, edges: graphEdges } as DocAnalysisSnapshot['graph'],
      documents
    ),
    experts: computeExperts(documents),
    learningPaths: generateLearningPaths(
      snapshotForInsights as DocAnalysisSnapshot['graph'],
      documents
    ),
  };
}

export async function analyzeDocuments(
  inputs: RawDocumentInput[],
  options: { signal?: AbortSignal } = {}
): Promise<DocAnalysisSnapshot> {
  validateInputs(inputs);
  const unique = dedupeByChecksum(inputs);
  const ingestedAt = new Date().toISOString();
  const documents: ProcessedDocument[] = [];
  try {
    const preliminary = unique.map((input) => processDocument(input, null, ingestedAt));
    const corpus = buildCorpusStatistics(preliminary);
    for (let index = 0; index < unique.length; index += 1) {
      if (options.signal?.aborted) {
        throw new DocAnalysisError({
          code: 'processing-failed',
          message: 'Analysis was cancelled.',
          retryable: false,
        });
      }
      documents.push(processDocument(unique[index], corpus, ingestedAt));
    }
  } catch (error) {
    if (error instanceof DocAnalysisError) throw error;
    throw new DocAnalysisError({
      code: 'processing-failed',
      message: error instanceof Error ? error.message : 'Document processing failed.',
      retryable: false,
      requestId: requestId(),
    });
  }

  const graph = createGraph();
  for (const document of documents) addDocumentToGraph(graph, document);
  const generatedAt = new Date().toISOString();
  const finalized = finalizeGraph(graph, documents, generatedAt);
  const insights = buildInsights(documents, finalized.nodes, finalized.edges, generatedAt);

  return {
    generatedAt,
    methodologyVersion: METHODOLOGY_VERSION,
    documents,
    graph: finalized,
    insights,
  };
}

async function persist(record: PersistedAnalysis): Promise<boolean> {
  try {
    await setStoredValue(SNAPSHOT_STORE_KEY, record);
    return true;
  } catch {
    return false;
  }
}

export async function loadPersistedAnalysis(): Promise<{
  snapshot: DocAnalysisSnapshot;
  rawInputs: RawDocumentInput[];
  usingFixtures: boolean;
} | null> {
  try {
    const record = (await getStoredValue(SNAPSHOT_STORE_KEY)) as PersistedAnalysis | null;
    if (!record || record.version !== 1 || !isSnapshot(record.snapshot)) return null;
    return {
      snapshot: record.snapshot,
      rawInputs: (record.rawInputs ?? []).filter(isValidRawInput),
      usingFixtures: Boolean(record.usingFixtures),
    };
  } catch {
    return null;
  }
}

export async function clearPersistedAnalysis(): Promise<void> {
  try {
    await removeStoredValue(SNAPSHOT_STORE_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

export async function analyzeAndPersist(
  inputs: RawDocumentInput[],
  options: { signal?: AbortSignal; usingFixtures?: boolean } = {}
): Promise<{ snapshot: DocAnalysisSnapshot; persisted: boolean }> {
  const snapshot = await analyzeDocuments(inputs, options);
  const persisted = await persist({
    version: 1,
    rawInputs: inputs,
    snapshot,
    usingFixtures: Boolean(options.usingFixtures),
  });
  return { snapshot, persisted };
}

export async function analyzeDemoCorpus(options: { signal?: AbortSignal } = {}) {
  return analyzeAndPersist(createDemoCorpus(), { ...options, usingFixtures: true });
}

export function askQuestionFromSnapshot(
  snapshot: DocAnalysisSnapshot,
  question: string
): AnswerResponse {
  return answerQuestion(buildIndex(snapshot.documents), snapshot.graph, snapshot.documents, question);
}

export function searchSnapshot(snapshot: DocAnalysisSnapshot, query: string): SearchResponse {
  return search(buildIndex(snapshot.documents), snapshot.graph, query, {
    limit: 10,
  });
}

const EMPTY_VALIDATIONS: FactValidationStatus[] = [];

export async function loadValidations(): Promise<FactValidationStatus[]> {
  try {
    const stored = await getStoredValue(VALIDATIONS_KEY);
    if (!Array.isArray(stored)) return EMPTY_VALIDATIONS;
    return stored.filter(
      (item): item is FactValidationStatus =>
        item &&
        typeof item.key === 'string' &&
        (item.status === 'confirmed' || item.status === 'flagged')
    );
  } catch {
    return EMPTY_VALIDATIONS;
  }
}

export async function saveValidations(validations: FactValidationStatus[]): Promise<void> {
  try {
    await setStoredValue(VALIDATIONS_KEY, validations);
  } catch {
    /* storage may be unavailable */
  }
}

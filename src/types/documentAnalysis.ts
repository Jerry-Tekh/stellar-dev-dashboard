export type DocumentFormat = 'markdown' | 'html' | 'text';

export type DocumentSourceKind =
  | 'docs'
  | 'whitepaper'
  | 'specification'
  | 'forum'
  | 'community';

export type SupportedLanguage =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'pt'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'unknown';

export interface RawDocumentInput {
  id?: string;
  title: string;
  format: DocumentFormat;
  source: DocumentSourceKind;
  content: string;
  url?: string;
  author?: string;
  publishedAt?: string;
}

export type EntityType =
  | 'concept'
  | 'component'
  | 'operation'
  | 'endpoint'
  | 'asset'
  | 'code-artifact'
  | 'account'
  | 'contract'
  | 'transaction';

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  mentions: number;
  confidence: number;
}

export interface DocumentSection {
  id: string;
  heading: string;
  level: number;
  text: string;
}

export interface CodeExample {
  id: string;
  language: string;
  code: string;
  title?: string;
  sectionId?: string;
  relatedConcepts: string[];
}

export interface Recommendation {
  text: string;
  category: 'best-practice' | 'security';
  sectionId?: string;
}

export interface ProcessedDocument {
  id: string;
  title: string;
  format: DocumentFormat;
  source: DocumentSourceKind;
  language: SupportedLanguage;
  wordCount: number;
  url?: string;
  author?: string;
  publishedAt?: string;
  ingestedAt: string;
  checksum: string;
  summary: string[];
  sections: DocumentSection[];
  entities: ExtractedEntity[];
  concepts: string[];
  codeExamples: CodeExample[];
  recommendations: Recommendation[];
}

export type NodeType = EntityType;

export interface KnowledgeNode {
  id: string;
  label: string;
  type: NodeType;
  mentions: number;
  confidence: number;
  sourceDocIds: string[];
  firstSeenAt: string;
  lastSeenAt: string;
}

export type EdgeType =
  | 'relates-to'
  | 'depends-on'
  | 'part-of'
  | 'example-of'
  | 'documented-in'
  | 'supersedes';

export interface KnowledgeEdge {
  id: string;
  fromId: string;
  toId: string;
  type: EdgeType;
  weight: number;
  observedAt: string;
  sourceDocIds: string[];
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  documentCount: number;
  conceptCount: number;
  generatedAt: string;
}

export interface TopicCluster {
  id: string;
  label: string;
  nodeIds: string[];
  documentCount: number;
  topTerms: string[];
  cohesion: number;
}

export interface KnowledgeGraphSnapshot {
  generatedAt: string;
  stats: GraphStats;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  clusters: TopicCluster[];
}

export interface AnswerCitation {
  documentId: string;
  documentTitle: string;
  sectionId?: string;
  heading?: string;
  url?: string;
}

export interface SearchResult {
  documentId: string;
  documentTitle: string;
  sectionId: string;
  heading: string;
  snippet: string;
  score: number;
  matchedConcepts: string[];
  explanation: string;
  citation: AnswerCitation;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  tookMs: number;
  totalMatches: number;
}

export type QuestionType =
  | 'what-is'
  | 'how-to'
  | 'troubleshooting'
  | 'code-example'
  | 'comparison'
  | 'general';

export interface AnswerResponse {
  question: string;
  questionType: QuestionType;
  answer: string;
  confidence: number;
  citations: AnswerCitation[];
  relatedConcepts: string[];
  codeExamples?: CodeExample[];
}

export interface TrendPoint {
  period: string;
  mentions: number;
  documents: number;
}

export interface ConceptTrend {
  concept: string;
  points: TrendPoint[];
  direction: 'rising' | 'falling' | 'stable';
  changePct: number;
}

export interface KnowledgeGap {
  concept: string;
  reason: 'orphan-concept' | 'thin-coverage' | 'single-source';
  mentionCount: number;
  suggestion: string;
}

export interface ExpertProfile {
  author: string;
  contributions: number;
  score: number;
  concepts: Array<{ concept: string; mentions: number }>;
}

export interface LearningPathStep {
  title: string;
  description: string;
  documentId: string;
  documentTitle: string;
  sectionId?: string;
  heading?: string;
  concepts: string[];
}

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface LearningPath {
  id: string;
  level: SkillLevel;
  title: string;
  description: string;
  steps: LearningPathStep[];
}

export interface FactValidationStatus {
  key: string;
  status: 'confirmed' | 'flagged';
  updatedAt: string;
}

export interface DocAnalysisInsights {
  generatedAt: string;
  trends: ConceptTrend[];
  gaps: KnowledgeGap[];
  experts: ExpertProfile[];
  learningPaths: LearningPath[];
}

export interface DocAnalysisSnapshot {
  generatedAt: string;
  methodologyVersion: string;
  documents: ProcessedDocument[];
  graph: KnowledgeGraphSnapshot;
  insights: DocAnalysisInsights;
}

export type DocAnalysisErrorCode =
  | 'invalid-document'
  | 'processing-failed'
  | 'storage-unavailable'
  | 'not-found';

export interface DocAnalysisApiError {
  code: DocAnalysisErrorCode;
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface DocAnalysisPreferences {
  minimumConfidence: number;
  includeFixtures: boolean;
  maxSearchResults: number;
}

export interface AnalysisSummary {
  documentCount: number;
  nodeCount: number;
  edgeCount: number;
  codeExampleCount: number;
  recommendationCount: number;
  languageCount: number;
}

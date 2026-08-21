export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'access-control'
  | 'arithmetic'
  | 'panic-safety'
  | 'reentrancy'
  | 'resource-usage'
  | 'storage-growth';

export type ParamKind =
  | 'Address'
  | 'Symbol'
  | 'String'
  | 'Bytes'
  | 'BytesN'
  | 'Vec'
  | 'Map'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'i32'
  | 'i64'
  | 'i128'
  | 'bool'
  | 'unknown';

export interface ContractParam {
  name: string;
  type: string;
  kind: ParamKind;
}

export interface ContractFunction {
  name: string;
  params: ContractParam[];
  returnType: string | null;
  line: number;
  isPublic: boolean;
  hasAuthCheck: boolean;
  hasUncheckedArithmetic: boolean;
  hasPanicRisk: boolean;
  hasExternalCall: boolean;
  hasStorageWrite: boolean;
  mutatesState: boolean;
  branchCount: number;
}

export interface ContractTypeDef {
  name: string;
  kind: 'struct' | 'enum';
  line: number;
}

export interface ParsedContract {
  contractName: string;
  functions: ContractFunction[];
  types: ContractTypeDef[];
  lineCount: number;
  usesStorage: boolean;
  usesCrossContractCalls: boolean;
}

export interface StaticFinding {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  functionName: string | null;
  line: number | null;
  message: string;
  recommendation: string;
}

export interface DerivedInvariant {
  id: string;
  functionName: string;
  description: string;
  expression: string;
}

export type GeneratedTestKind = 'unit' | 'property' | 'fuzz' | 'regression';

export interface GeneratedTestCase {
  id: string;
  kind: GeneratedTestKind;
  name: string;
  functionName: string;
  description: string;
  code: string;
  estimatedCoverageGain: number;
}

export interface GeneratedTestSuite {
  contractName: string;
  generatedAt: string;
  totalTestCases: number;
  byKind: Record<GeneratedTestKind, number>;
  testCases: GeneratedTestCase[];
}

export interface CoverageReport {
  totalFunctions: number;
  coveredFunctions: number;
  totalBranches: number;
  coveredBranches: number;
  estimatedFunctionCoveragePct: number;
  estimatedBranchCoveragePct: number;
  estimatedPathCoveragePct: number;
  uncoveredFunctions: string[];
}

export type MutationOperator =
  | 'arithmetic-operator-flip'
  | 'comparison-boundary-flip'
  | 'auth-check-negation'
  | 'return-value-negation';

export interface MutantResult {
  id: string;
  functionName: string;
  operator: MutationOperator;
  description: string;
  likelyKilled: boolean;
}

export interface MutationReport {
  totalMutants: number;
  likelyKilled: number;
  likelySurvived: number;
  estimatedMutationScorePct: number;
  mutants: MutantResult[];
}

export type VerificationStatus = 'pass' | 'fail' | 'needs-review';

export interface VerificationObligation {
  id: string;
  functionName: string;
  property: string;
  category: FindingCategory;
  status: VerificationStatus;
  rationale: string;
}

export interface VerificationReport {
  methodology: 'heuristic-static-analysis';
  disclaimer: string;
  obligations: VerificationObligation[];
  passCount: number;
  failCount: number;
  needsReviewCount: number;
}

export interface AnalysisResult {
  requestId: string;
  generatedAt: string;
  state: 'live' | 'degraded' | 'offline' | 'simulation';
  contract: ParsedContract;
  findings: StaticFinding[];
  invariants: DerivedInvariant[];
  testSuite: GeneratedTestSuite;
  coverage: CoverageReport;
  mutation: MutationReport;
  verification: VerificationReport;
  ciWorkflowYaml: string;
  durationMs: number;
}

export interface AnalysisHistoryEntry {
  requestId: string;
  contractName: string;
  generatedAt: string;
  findingsCount: number;
  criticalFindingsCount: number;
  estimatedPathCoveragePct: number;
  estimatedMutationScorePct: number;
}

export interface ContractTestingApiError {
  code:
    | 'empty-source'
    | 'source-too-large'
    | 'invalid-contract-name'
    | 'no-functions-found'
    | 'timeout'
    | 'unavailable'
    | 'invalid-response'
    | 'rate-limited'
    | 'aborted';
  message: string;
  retryable: boolean;
  requestId?: string;
}

export interface AnalyzeOptions {
  signal?: AbortSignal;
  contractName?: string;
}

export interface AnalysisResponse {
  data: AnalysisResult;
  requestId: string;
}

import type { EdgeType, EntityType, SupportedLanguage } from '../../types/documentAnalysis';

export interface LexiconEntry {
  term: string;
  type: EntityType;
  aliases?: string[];
}

export const STELLAR_LEXICON: LexiconEntry[] = [
  { term: 'Stellar', type: 'concept' },
  { term: 'Stellar Network', type: 'concept', aliases: ['stellar network'] },
  { term: 'Stellar Consensus Protocol', type: 'concept', aliases: ['scp'] },
  { term: 'Soroban', type: 'concept' },
  { term: 'Horizon', type: 'component', aliases: ['horizon api', 'horizon server'] },
  { term: 'Stellar Core', type: 'component' },
  { term: 'Soroban RPC', type: 'component', aliases: ['soroban rpc server'] },
  { term: 'Friendbot', type: 'component' },
  { term: 'Stellar Laboratory', type: 'component', aliases: ['laboratory'] },
  { term: 'Federation', type: 'concept', aliases: ['federation protocol'] },
  { term: 'Anchor', type: 'component', aliases: ['anchors'] },
  { term: 'Quorum', type: 'concept', aliases: ['quorum set', 'quorum slices'] },
  { term: 'Consensus', type: 'concept' },
  { term: 'Ledger', type: 'concept', aliases: ['ledgers', 'ledger entry', 'ledger entries'] },
  { term: 'Trustline', type: 'concept', aliases: ['trustlines', 'change trust'] },
  { term: 'Path Payment', type: 'operation', aliases: ['path payments'] },
  { term: 'Claimable Balance', type: 'operation', aliases: ['claimable balances'] },
  { term: 'Sponsorship', type: 'concept', aliases: ['sponsored reserves', 'reserve sponsorship'] },
  { term: 'Base Reserve', type: 'concept', aliases: ['base reserve lumens'] },
  { term: 'Multisig', type: 'concept', aliases: ['multi-signature', 'multiple signers'] },
  { term: 'Threshold', type: 'concept', aliases: ['thresholds', 'signing thresholds'] },
  { term: 'Signer', type: 'concept', aliases: ['signers'] },
  { term: 'Fee Bump', type: 'operation', aliases: ['fee bump transaction'] },
  { term: 'Pre-auth Transaction', type: 'concept', aliases: ['pre-auth signer'] },
  { term: 'Hash Signer', type: 'concept' },
  { term: 'Memo', type: 'concept', aliases: ['memos'] },
  { term: 'Time Bounds', type: 'concept', aliases: ['time bounds predicate'] },
  { term: 'Inflation', type: 'concept', aliases: ['inflation operation'] },
  { term: 'Liquidity Pool', type: 'concept', aliases: ['liquidity pools', 'constant product'] },
  { term: 'Clawback', type: 'operation', aliases: ['clawback operation'] },
  { term: 'Offer', type: 'operation', aliases: ['offers', 'manage sell offer', 'manage buy offer'] },
  { term: 'Create Account', type: 'operation', aliases: ['create account operation'] },
  { term: 'Payment', type: 'operation', aliases: ['payment operation', 'payments'] },
  { term: 'Set Options', type: 'operation', aliases: ['set options operation'] },
  { term: 'Account Merge', type: 'operation', aliases: ['account merge operation'] },
  { term: 'Manage Data', type: 'operation', aliases: ['manage data operation'] },
  { term: 'Bump Sequence', type: 'operation', aliases: ['bump sequence operation'] },
  { term: 'Allow Trust', type: 'operation', aliases: ['allow trust operation'] },
  { term: 'Invoke Host Function', type: 'operation', aliases: ['invokehostfunction'] },
  { term: 'Upload Contract Wasm', type: 'operation', aliases: ['uploadcontractwasm'] },
  { term: 'Smart Contract', type: 'concept', aliases: ['smart contracts'] },
  { term: 'Contract Deployment', type: 'concept', aliases: ['deploy contracts', 'contract deployment'] },
  { term: 'WebAssembly', type: 'code-artifact', aliases: ['wasm'] },
  { term: 'XDR', type: 'code-artifact', aliases: ['external data representation'] },
  { term: 'Transaction Envelope', type: 'code-artifact', aliases: ['transaction envelopes'] },
  { term: 'Asset Code', type: 'code-artifact', aliases: ['asset codes'] },
  { term: 'Native Asset', type: 'asset', aliases: ['native asset'] },
  { term: 'XLM', type: 'asset', aliases: ['lumens', 'lumen'] },
  { term: 'USDC', type: 'asset' },
  { term: 'SEP-1', type: 'concept', aliases: ['sep 1'] },
  { term: 'SEP-10', type: 'concept', aliases: ['sep 10'] },
  { term: 'SEP-31', type: 'concept' },
  { term: 'CAP-15', type: 'concept' },
  { term: 'CAP-40', type: 'concept' },
  { term: 'JS SDK', type: 'code-artifact', aliases: ['javascript sdk', 'stellar sdk', 'stellar-sdk'] },
  { term: 'Go SDK', type: 'code-artifact', aliases: ['go sdk'] },
  { term: 'Python SDK', type: 'code-artifact', aliases: ['python sdk', 'py-stellar-base'] },
  { term: 'Java SDK', type: 'code-artifact', aliases: ['java stellar sdk'] },
  { term: 'Freighter', type: 'component' },
  { term: 'Testnet', type: 'concept', aliases: ['test network'] },
  { term: 'Futurenet', type: 'concept' },
  { term: 'Mainnet', type: 'concept', aliases: ['public network', 'main network'] },
  { term: 'Account', type: 'concept', aliases: ['accounts'] },
  { term: 'Transaction', type: 'concept', aliases: ['transactions'] },
  { term: 'Operation', type: 'concept', aliases: ['operations'] },
  { term: 'Effect', type: 'concept', aliases: ['effects'] },
  { term: 'Order Book', type: 'concept', aliases: ['order books', 'orderbook'] },
  { term: 'Streaming', type: 'concept', aliases: ['streaming endpoint', 'cursor streaming'] },
  { term: 'Cursor', type: 'concept', aliases: ['cursors', 'paging token'] },
  { term: 'Rate Limit', type: 'concept', aliases: ['rate limits', 'rate limiting'] },
  { term: 'Fee Stat', type: 'endpoint', aliases: ['fee stats', '/fee_stats'] },
  { term: 'Accounts Endpoint', type: 'endpoint', aliases: ['/accounts'] },
  { term: 'Transactions Endpoint', type: 'endpoint', aliases: ['/transactions'] },
  { term: 'Operations Endpoint', type: 'endpoint', aliases: ['/operations'] },
  { term: 'Payments Endpoint', type: 'endpoint', aliases: ['/payments'] },
  { term: 'Effects Endpoint', type: 'endpoint', aliases: ['/effects'] },
  { term: 'Offers Endpoint', type: 'endpoint', aliases: ['/offers'] },
  { term: 'Order Book Endpoint', type: 'endpoint', aliases: ['/order_book'] },
  { term: 'Paths Endpoint', type: 'endpoint', aliases: ['/paths'] },
  { term: 'Assets Endpoint', type: 'endpoint', aliases: ['/assets'] },
  { term: 'Trade Aggregations', type: 'endpoint', aliases: ['/trade_aggregations'] },
  { term: 'Host Functions', type: 'code-artifact', aliases: ['host function'] },
  { term: 'Guest Environment', type: 'concept', aliases: ['guest vm'] },
  { term: 'Budget Metering', type: 'concept', aliases: ['metering', 'instruction budget'] },
  { term: 'Footprint', type: 'concept', aliases: ['contract footprint', 'ledger footprint'] },
  { term: 'Persistent Storage', type: 'concept', aliases: ['persistent contract storage'] },
  { term: 'Instance Storage', type: 'concept', aliases: ['contract instance storage'] },
  { term: 'Authorization Entry', type: 'concept', aliases: ['authorization entries'] },
  { term: 'Soroban Authorization', type: 'concept', aliases: ['contract authorization'] },
  { term: 'Simulation', type: 'concept', aliases: ['transaction simulation', 'simulate transaction'] },
  { term: 'Source Account', type: 'concept', aliases: ['source accounts'] },
  { term: 'Sequence Number', type: 'concept', aliases: ['sequence numbers'] },
  { term: 'Network Passphrase', type: 'concept', aliases: ['passphrase'] },
];

export interface EntityPattern {
  type: EntityType;
  pattern: RegExp;
  confidence: number;
}

export const ENTITY_PATTERNS: EntityPattern[] = [
  { type: 'account', pattern: /\bG[A-Z2-7]{55}\b/g, confidence: 0.99 },
  { type: 'contract', pattern: /\bC[A-Z2-7]{55}\b/g, confidence: 0.97 },
  { type: 'transaction', pattern: /\b[a-f0-9]{64}\b/g, confidence: 0.95 },
  {
    type: 'asset',
    pattern: /\b[A-Z0-9]{1,12}-[A-Z2-7]{55}\b/g,
    confidence: 0.9,
  },
];

export const SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/g;
export const SECRET_REPLACEMENT = '[REDACTED SECRET]';

export interface RelationPattern {
  pattern: RegExp;
  edgeType: EdgeType;
}

export const RELATION_PATTERNS: RelationPattern[] = [
  {
    pattern:
      /\b([A-Za-z][\w-]*(?:\s[\w-]+){0,3})\s+(?:requires?|depends on|needs?|relies on)\s+([A-Za-z][\w-]*(?:\s[\w-]+){0,3})/i,
    edgeType: 'depends-on',
  },
  {
    pattern: /\b([A-Za-z][\w-]*(?:\s[\w-]+){0,3})\s+(?:is|are)\s+(?:a|an|the)?\s*(?:part|component|subcomponent) of\s+([A-Za-z][\w-]*(?:\s[\w-]+){0,3})/i,
    edgeType: 'part-of',
  },
  {
    pattern: /\b([A-Za-z][\w-]*(?:\s[\w-]+){0,3})\s+(?:uses?|utilizes?|leverages?|builds? on)\s+([A-Za-z][\w-]*(?:\s[\w-]+){0,3})/i,
    edgeType: 'relates-to',
  },
  {
    pattern: /\b([A-Za-z][\w-]*(?:\s[\w-]+){0,3})\s+(?:supersedes?|replaces?|deprecates?)\s+([A-Za-z][\w-]*(?:\s[\w-]+){0,3})/i,
    edgeType: 'supersedes',
  },
  {
    pattern: /\b(?:such as|for example|for instance|e\.g\.?,?)\s+([A-Za-z][\w-]*(?:\s[\w-]+){0,3})/i,
    edgeType: 'example-of',
  },
  {
    pattern: /\b([A-Za-z][\w-]*(?:\s[\w-]+){0,3})\s+(?:is|are)\s+documented (?:in|at)\s+([\w/-]+)/i,
    edgeType: 'documented-in',
  },
];

export const BEST_PRACTICE_CUES =
  /\b(never|always|avoid|do not|don't|recommended|best practice|make sure|ensure|should be|it is important)\b/i;

export const SECURITY_CUES =
  /\b(secret|seed|private key|security|securely|sanitize|validat(e|ing) input|authorization|authentication|rate limit|https|phishing|scam|compromis\w+|leak\w*|expos\w+)\b/i;

export const STRONG_SECURITY_CUES =
  /\b(secret|seed|private key|phishing|scam|compromis\w+|leak\w*|exploit\w*|malicious|unauthorized)\b/i;

export const SCRIPT_RANGES: Array<{ code: SupportedLanguage; re: RegExp }> = [
  { code: 'ja', re: /[\u3040-\u30ff]/g },
  { code: 'zh', re: /[\u4e00-\u9fff]/g },
  { code: 'ko', re: /[\uac00-\ud7af\u1100-\u11ff]/g },
  { code: 'ar', re: /[\u0600-\u06ff]/g },
];

export const STOPWORDS: Partial<Record<SupportedLanguage, Set<string>>> = {
  en: new Set([
    'the','a','an','and','or','but','if','then','of','to','in','on','for','with','as','by','at',
    'from','is','are','was','were','be','been','being','this','that','these','those','it','its',
    'can','will','would','should','could','may','might','must','shall','do','does','did','have',
    'has','had','not','no','you','your','we','our','they','their','he','she','his','her','which',
    'what','when','where','how','who','whom','into','about','than','more','most','other','some',
    'such','only','also','very','just','each','any','all','both','between','over','under','again',
    'using','use','used','one','two','new','like','get','set',
  ]),
  es: new Set([
    'el','la','los','las','un','una','unos','unas','y','o','pero','si','de','del','al','en','con',
    'por','para','como','es','son','ser','este','esta','esto','que','se','su','sus','más','pero',
    'cuando','donde','quien','cual','puede','pueden','hacer','tiene','han','hay','no','ni','todo',
    'todos','cada','entre','sobre','también','uso','usar','usado','uno','dos',
  ]),
  fr: new Set([
    'le','la','les','un','une','des','et','ou','mais','si','de','du','au','aux','en','avec','par',
    'pour','comme','est','sont','être','ce','cet','cette','que','qui','se','sa','son','ses','peut',
    'peuvent','faire','a','ont','ne','pas','tout','tous','chaque','entre','sur','aussi','utiliser',
    'utilisé','un','deux','lorsque','où',
  ]),
  de: new Set([
    'der','die','das','ein','eine','einen','und','oder','aber','wenn','von','zu','in','auf','mit',
    'für','als','ist','sind','sein','dieser','diese','dieses','der','die','das','werden','kann',
    'können','machen','hat','haben','nicht','kein','alle','jede','zwischen','über','auch','verwenden',
    'verwendet','eins','zwei','wo','wann',
  ]),
  pt: new Set([
    'o','a','os','as','um','uma','uns','umas','e','ou','mas','se','de','do','da','em','com','por',
    'para','como','é','são','ser','este','esta','isto','que','se','seu','sua','pode','podem','fazer',
    'tem','têm','não','nem','todo','todos','cada','entre','sobre','também','usar','usado','um','dois',
    'onde','quando',
  ]),
};

const LEXICON_INDEX: Map<string, { label: string; type: EntityType }> = (() => {
  const index = new Map<string, { label: string; type: EntityType }>();
  const add = (phrase: string, label: string, type: EntityType) => {
    const key = phrase.toLowerCase().trim();
    if (!key) return;
    if (!index.has(key)) index.set(key, { label, type });
  };
  for (const entry of STELLAR_LEXICON) {
    add(entry.term, entry.term, entry.type);
    for (const alias of entry.aliases ?? []) add(alias, entry.term, entry.type);
  }
  return index;
})();

export function lookupLexicon(phrase: string): { label: string; type: EntityType } | null {
  return LEXICON_INDEX.get(phrase.toLowerCase().trim()) ?? null;
}

export function lexiconSize(): number {
  return LEXICON_INDEX.size;
}

import type {
  AnalyzedSentiment,
  AspectSentiment,
  CorrelationResult,
  DirectionForecast,
  EntityMention,
  SentimentAlert,
  SentimentDocument,
  SentimentLabel,
  SentimentSource,
  SentimentTrendPoint,
  SourceSentiment,
  ViralSignal,
} from '../../types/marketSentiment';

const MODEL_VERSION = 'stellar-lexicon-ensemble-1.0.0';
const POSITIVE = new Set<string>([
  'adoption',
  'approve',
  'approved',
  'breakout',
  'bullish',
  'buy',
  'efficient',
  'fast',
  'gain',
  'gains',
  'good',
  'great',
  'growth',
  'improve',
  'launch',
  'partnership',
  'positive',
  'rally',
  'reliable',
  'secure',
  'strong',
  'surge',
  'upgrade',
  'win',
]);
const NEGATIVE = new Set<string>([
  'attack',
  'bearish',
  'breach',
  'congestion',
  'crash',
  'delay',
  'down',
  'drop',
  'exploit',
  'fail',
  'failed',
  'fear',
  'fraud',
  'hack',
  'loss',
  'negative',
  'outage',
  'risk',
  'scam',
  'sell',
  'slow',
  'spam',
  'weak',
]);
const NEGATIONS = new Set<string>(['not', 'never', 'no', 'hardly', 'without']);
const AMPLIFIERS = new Set<string>(['very', 'extremely', 'massive', 'major', 'strongly', 'highly']);
const EMOJI: Record<string, number> = {
  '🚀': 1.5,
  '📈': 1,
  '🔥': 0.8,
  '💚': 0.8,
  '📉': -1,
  '💀': -1,
  '⚠️': -0.6,
};
const SOURCE_CREDIBILITY: Record<SentimentSource, number> = {
  x: 0.58,
  reddit: 0.62,
  discord: 0.55,
  telegram: 0.5,
  news: 0.82,
  research: 0.9,
  'on-chain': 0.92,
  market: 0.88,
};
const ASPECT_TERMS: Record<AspectSentiment['aspect'], string[]> = {
  price: ['price', 'xlm', 'market', 'trade', 'rally', 'sell', 'buy'],
  network: ['network', 'ledger', 'validator', 'soroban', 'horizon', 'transaction'],
  ecosystem: ['ecosystem', 'developer', 'project', 'adoption', 'community'],
  defi: ['defi', 'dex', 'liquidity', 'amm', 'yield'],
  payments: ['payment', 'remittance', 'anchor', 'stablecoin', 'usdc'],
  regulation: ['regulation', 'regulator', 'sec', 'compliance', 'policy'],
};
const ENTITY_PATTERNS: Array<[RegExp, string, EntityMention['type']]> = [
  [/\b(xlm|stellar lumens?)\b/i, 'XLM', 'asset'],
  [/\bstellar\b/i, 'Stellar', 'project'],
  [/\bsoroban\b/i, 'Soroban', 'project'],
  [/\busdc\b/i, 'USDC', 'asset'],
  [/\bstellar development foundation|\bsdf\b/i, 'SDF', 'organization'],
];
const TRANSLATIONS: Record<string, Record<string, number>> = {
  es: { bueno: 1, crecimiento: 1, seguro: 1, rápido: 1, malo: -1, riesgo: -1, caída: -1 },
  fr: { bon: 1, croissance: 1, sûr: 1, rapide: 1, mauvais: -1, risque: -1, baisse: -1 },
  de: { gut: 1, wachstum: 1, sicher: 1, schnell: 1, schlecht: -1, risiko: -1, absturz: -1 },
  pt: { bom: 1, crescimento: 1, seguro: 1, rápido: 1, ruim: -1, risco: -1, queda: -1 },
  zh: { 看涨: 1, 增长: 1, 安全: 1, 上涨: 1, 看跌: -1, 风险: -1, 下跌: -1 },
  ja: { 強気: 1, 成長: 1, 安全: 1, 上昇: 1, 弱気: -1, リスク: -1, 下落: -1 },
  ko: { 강세: 1, 성장: 1, 안전: 1, 상승: 1, 약세: -1, 위험: -1, 하락: -1 },
  ar: { صعود: 1, نمو: 1, آمن: 1, هبوط: -1, خطر: -1 },
  it: { buono: 1, crescita: 1, sicuro: 1, rialzo: 1, cattivo: -1, rischio: -1, calo: -1 },
  nl: { goed: 1, groei: 1, veilig: 1, stijging: 1, slecht: -1, risico: -1, daling: -1 },
  pl: { dobry: 1, wzrost: 1, bezpieczny: 1, hossa: 1, zły: -1, ryzyko: -1, spadek: -1 },
  ru: { рост: 1, безопасный: 1, ростом: 1, падение: -1, риск: -1, плохой: -1 },
  uk: { зростання: 1, безпечний: 1, підйом: 1, падіння: -1, ризик: -1 },
  hi: { तेजी: 1, वृद्धि: 1, सुरक्षित: 1, मंदी: -1, जोखिम: -1, गिरावट: -1 },
  tr: { iyi: 1, büyüme: 1, güvenli: 1, yükseliş: 1, kötü: -1, risk: -1, düşüş: -1 },
  id: { baik: 1, pertumbuhan: 1, aman: 1, naik: 1, buruk: -1, risiko: -1, turun: -1 },
  vi: { tốt: 1, tăng: 1, an_toàn: 1, xấu: -1, rủi_ro: -1, giảm: -1 },
  th: { ดี: 1, เติบโต: 1, ปลอดภัย: 1, แย่: -1, เสี่ยง: -1, ลดลง: -1 },
  sw: { nzuri: 1, ukuaji: 1, salama: 1, kupanda: 1, mbaya: -1, hatari: -1, kushuka: -1 },
  tl: { mabuti: 1, paglago: 1, ligtas: 1, taas: 1, masama: -1, panganib: -1, bagsak: -1 },
};

export const SUPPORTED_SENTIMENT_LANGUAGES = Object.freeze(['en', ...Object.keys(TRANSLATIONS)]);

const clamp = (value: number, min = -1, max = 1) => Math.min(max, Math.max(min, value));
const round = (value: number, places = 3) => Number(value.toFixed(places));
const tokens = (text: string): string[] =>
  Array.from(text.toLocaleLowerCase().match(/[\p{L}\p{N}_'-]+|[🚀📈🔥💚📉💀]/gu) ?? []);
export const labelScore = (score: number): SentimentLabel =>
  score >= 0.18 ? 'bullish' : score <= -0.18 ? 'bearish' : 'neutral';

export function estimateSpam(document: SentimentDocument): number {
  const words = tokens(document.text);
  if (!words.length) return 1;
  const uniqueRatio = new Set(words).size / words.length;
  const links = (document.text.match(/https?:\/\//g) ?? []).length;
  const uppercase =
    document.text.replace(/[^A-Z]/g, '').length /
    Math.max(1, document.text.replace(/[^A-Za-z]/g, '').length);
  const repeated = /(.)\1{5,}|\b(.{2,15})(?:\s+\2){3,}/i.test(document.text) ? 0.35 : 0;
  const duplicate = document.duplicateOf ? 0.55 : 0;
  return round(
    clamp(
      (1 - uniqueRatio) * 0.45 +
        Math.min(0.3, links * 0.12) +
        Math.max(0, uppercase - 0.65) * 0.4 +
        repeated +
        duplicate,
      0,
      1
    )
  );
}

export function analyzeDocument(document: SentimentDocument): AnalyzedSentiment {
  const words = tokens(document.text);
  let raw = 0;
  let hits = 0;
  const rationale: string[] = [];
  words.forEach((word, index) => {
    let weight = POSITIVE.has(word)
      ? 1
      : NEGATIVE.has(word)
        ? -1
        : (EMOJI[word] ?? TRANSLATIONS[document.language]?.[word] ?? 0);
    if (!weight) return;
    if (NEGATIONS.has(words[index - 1])) weight *= -1;
    if (AMPLIFIERS.has(words[index - 1])) weight *= 1.5;
    raw += weight;
    hits += 1;
  });
  if (/not (?:only|just).+(?:but|also)/i.test(document.text)) raw *= 0.8;
  const spamProbability = estimateSpam(document);
  const credibility = clamp(
    SOURCE_CREDIBILITY[document.source] + (document.verified ? 0.08 : 0) - spamProbability * 0.35,
    0,
    1
  );
  const engagement = Math.log10(Math.max(1, (document.engagement ?? 0) + 1)) / 5;
  const followers = Math.log10(Math.max(1, (document.authorFollowers ?? 0) + 1)) / 7;
  const influence = round(clamp(credibility * 0.6 + engagement * 0.25 + followers * 0.15, 0, 1));
  const score = round(clamp(raw / Math.max(2, Math.sqrt(words.length) + hits)));
  const languagePenalty = SUPPORTED_SENTIMENT_LANGUAGES.includes(document.language) ? 0 : 0.18;
  const confidence = round(
    clamp(
      0.28 + hits * 0.12 + credibility * 0.35 - spamProbability * 0.35 - languagePenalty,
      0,
      0.98
    )
  );
  if (hits) rationale.push(`${hits} contextual sentiment signal${hits === 1 ? '' : 's'}`);
  if (spamProbability >= 0.55)
    rationale.push('down-weighted as probable spam or duplicate content');
  if (document.verified) rationale.push('verified publisher signal');
  const aspects = Object.entries(ASPECT_TERMS).flatMap(([aspect, terms]) => {
    const mentions = (terms as string[]).filter((term) => words.includes(term)).length;
    return mentions ? [{ aspect: aspect as AspectSentiment['aspect'], score, mentions }] : [];
  });
  const entities = ENTITY_PATTERNS.flatMap(([pattern, entity, type]) =>
    pattern.test(document.text) ? [{ entity, type, mentions: 1, score }] : []
  );
  return {
    ...document,
    score,
    confidence,
    label: labelScore(score),
    credibility: round(credibility),
    spamProbability,
    influence,
    aspects,
    entities,
    translated: document.language !== 'en',
    modelVersion: MODEL_VERSION,
    rationale,
  };
}

export function analyzeBatch(documents: SentimentDocument[]): AnalyzedSentiment[] {
  const seen = new Set<string>();
  return documents.map((document) => {
    const fingerprint = document.text.toLocaleLowerCase().replace(/\W/g, '').slice(0, 160);
    const analyzed = analyzeDocument({
      ...document,
      duplicateOf: document.duplicateOf ?? (seen.has(fingerprint) ? 'batch-duplicate' : undefined),
    });
    seen.add(fingerprint);
    return analyzed;
  });
}

export function weightedScore(items: AnalyzedSentiment[]): {
  score: number;
  confidence: number;
  filtered: number;
} {
  const accepted = items.filter((item) => item.spamProbability < 0.75);
  const weights = accepted.map(
    (item) => item.credibility * item.confidence * (0.5 + item.influence)
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  return {
    score: round(
      total ? accepted.reduce((sum, item, i) => sum + item.score * weights[i], 0) / total : 0
    ),
    confidence: round(clamp(total / Math.max(1, accepted.length))),
    filtered: items.length - accepted.length,
  };
}

export function aggregateSources(
  items: AnalyzedSentiment[],
  previous: Partial<Record<SentimentSource, number>> = {}
): SourceSentiment[] {
  return [...new Set(items.map((item) => item.source))]
    .map((source) => {
      const sourceItems = items.filter((item) => item.source === source);
      const aggregate = weightedScore(sourceItems);
      return {
        source,
        score: aggregate.score,
        volume: sourceItems.length,
        credibility: round(sourceItems.reduce((s, x) => s + x.credibility, 0) / sourceItems.length),
        change24h: round(aggregate.score - (previous[source] ?? aggregate.score)),
      };
    })
    .sort((a, b) => b.volume - a.volume);
}

function aggregateNamed<T extends { score: number }>(values: T[], key: (_value: T) => string) {
  const groups = new Map<string, T[]>();
  values.forEach((value) => groups.set(key(value), [...(groups.get(key(value)) ?? []), value]));
  return [...groups.entries()].map(([name, group]) => ({
    name,
    score: round(group.reduce((s, x) => s + x.score, 0) / group.length),
    mentions: group.length,
  }));
}
export function aggregateAspects(items: AnalyzedSentiment[]): AspectSentiment[] {
  return aggregateNamed(
    items.flatMap((item) => item.aspects),
    (value) => value.aspect
  )
    .map((value) => ({
      aspect: value.name as AspectSentiment['aspect'],
      score: value.score,
      mentions: value.mentions,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}
export function aggregateEntities(items: AnalyzedSentiment[]): EntityMention[] {
  const flattened = items.flatMap((item) => item.entities);
  return aggregateNamed(flattened, (value) => value.entity)
    .map((value) => ({
      entity: value.name,
      type: flattened.find((x) => x.entity === value.name)?.type ?? 'project',
      score: value.score,
      mentions: value.mentions,
    }))
    .sort((a, b) => b.mentions - a.mentions);
}

export function pearsonCorrelation(trend: SentimentTrendPoint[], lagHours = 0): CorrelationResult {
  const lag = Math.max(0, Math.round(lagHours));
  const pairs = trend
    .slice(0, Math.max(0, trend.length - lag))
    .map((point, index) => [point.score, trend[index + lag]?.priceUsd] as const)
    .filter((pair) => Number.isFinite(pair[1]));
  if (pairs.length < 3)
    return {
      coefficient: 0,
      sampleSize: pairs.length,
      lagHours: lag,
      pValueEstimate: 1,
      statisticallySignificant: false,
      interpretation: 'Insufficient observations for correlation analysis.',
    };
  const meanX = pairs.reduce((s, p) => s + p[0], 0) / pairs.length,
    meanY = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  const covariance = pairs.reduce((s, p) => s + (p[0] - meanX) * (p[1] - meanY), 0);
  const denominator = Math.sqrt(
    pairs.reduce((s, p) => s + (p[0] - meanX) ** 2, 0) *
      pairs.reduce((s, p) => s + (p[1] - meanY) ** 2, 0)
  );
  const coefficient = round(denominator ? covariance / denominator : 0);
  const pValueEstimate = round(
    Math.max(0.001, Math.min(1, Math.exp(-Math.abs(coefficient) * Math.sqrt(pairs.length) * 1.8)))
  );
  const statisticallySignificant = pairs.length >= 20 && pValueEstimate < 0.05;
  return {
    coefficient,
    sampleSize: pairs.length,
    lagHours: lag,
    pValueEstimate,
    statisticallySignificant,
    interpretation: statisticallySignificant
      ? `${coefficient > 0 ? 'Positive' : 'Negative'} association detected; correlation does not establish causation.`
      : 'No statistically significant association in the available window.',
  };
}

export function detectAlerts(trend: SentimentTrendPoint[], now = new Date()): SentimentAlert[] {
  if (trend.length < 5) return [];
  const baseline = trend.slice(0, -1).map((point) => point.score),
    current = trend[trend.length - 1];
  const mean = baseline.reduce((s, x) => s + x, 0) / baseline.length;
  const deviation =
    Math.sqrt(baseline.reduce((s, x) => s + (x - mean) ** 2, 0) / baseline.length) || 0.05;
  const zScore = round((current.score - mean) / deviation),
    change = round(current.score - mean);
  if (Math.abs(zScore) < 2 && Math.abs(change) < 0.25) return [];
  return [
    {
      id: `sentiment-shift-${now.getTime()}`,
      title: `${change > 0 ? 'Positive' : 'Negative'} sentiment shift`,
      message: `Composite sentiment moved ${(Math.abs(change) * 100).toFixed(0)} points beyond its rolling baseline.`,
      severity: Math.abs(zScore) >= 3 ? 'critical' : 'warning',
      status: 'active',
      createdAt: now.toISOString(),
      change,
      zScore,
      sources: ['x', 'reddit', 'news'],
      recommendation:
        'Verify the leading narratives across independent sources before making operational or market decisions.',
    },
  ];
}

export function detectViralSignals(items: AnalyzedSentiment[], now = new Date()): ViralSignal[] {
  const topics = new Map<string, AnalyzedSentiment[]>();
  items.forEach((item) =>
    item.entities.forEach((entity) =>
      topics.set(entity.entity, [...(topics.get(entity.entity) ?? []), item])
    )
  );
  return [...topics.entries()]
    .map(([topic, mentions]) => ({
      id: `viral-${topic.toLowerCase()}`,
      topic,
      velocity: round((mentions.length / Math.max(1, items.length)) * 100, 1),
      engagement: mentions.reduce((s, x) => s + (x.engagement ?? 0), 0),
      score: weightedScore(mentions).score,
      source: mentions[0].source,
      detectedAt: now.toISOString(),
    }))
    .filter((signal) => signal.velocity >= 15 || signal.engagement >= 1000)
    .sort((a, b) => b.velocity - a.velocity);
}

export function forecastDirection(
  trend: SentimentTrendPoint[],
  correlation: CorrelationResult
): DirectionForecast {
  const recent = trend.slice(-6),
    momentum = recent.length > 1 ? recent[recent.length - 1].score - recent[0].score : 0;
  const volumeShift =
    recent.length > 1
      ? (recent[recent.length - 1].volume - recent[0].volume) / Math.max(1, recent[0].volume)
      : 0;
  const signal = clamp(momentum * 0.65 + correlation.coefficient * 0.25 + clamp(volumeShift) * 0.1);
  const probability = round(0.5 + Math.abs(signal) * 0.38);
  return {
    direction: labelScore(signal),
    probability,
    confidence: round(
      clamp(
        0.35 + Math.min(1, trend.length / 48) * 0.25 + Math.abs(correlation.coefficient) * 0.2,
        0,
        0.85
      )
    ),
    horizonHours: 24,
    modelVersion: 'direction-ensemble-1.0.0',
    drivers: [
      `Sentiment momentum ${momentum >= 0 ? 'increased' : 'decreased'} by ${Math.abs(momentum * 100).toFixed(0)} points`,
      `Price correlation is ${correlation.coefficient.toFixed(2)}`,
      `Mention volume changed ${(volumeShift * 100).toFixed(0)}%`,
    ],
    disclaimer:
      'Experimental directional indicator, not financial advice. Validate against labeled out-of-sample market data.',
  };
}

export function updateSentimentAlert(
  alerts: SentimentAlert[],
  id: string,
  status: SentimentAlert['status']
) {
  return alerts.map((alert) => (alert.id === id ? { ...alert, status } : alert));
}

import type {
  SentimentDocument,
  SentimentSnapshot,
  SentimentSource,
  SentimentTrendPoint,
  SourceProfile,
} from '../../types/marketSentiment';
import {
  aggregateAspects,
  aggregateEntities,
  aggregateSources,
  analyzeBatch,
  detectAlerts,
  detectViralSignals,
  forecastDirection,
  labelScore,
  pearsonCorrelation,
  weightedScore,
} from './analysis';

const CONTENT: Array<[SentimentSource, string, string]> = [
  ['news', 'en', 'Stellar network adoption grows after a major payments partnership launch'],
  ['x', 'en', 'XLM looks bullish as network transactions surge 🚀'],
  ['reddit', 'en', 'Soroban upgrade is fast and reliable, great ecosystem progress'],
  ['discord', 'es', 'Buen crecimiento de Stellar, pagos rápidos y seguros'],
  ['telegram', 'pt', 'XLM com crescimento forte, mas existe risco de mercado'],
  ['research', 'fr', 'La croissance du réseau Stellar améliore les paiements mondiaux'],
  ['news', 'de', 'Stellar Netzwerk Wachstum bleibt stark trotz Markt Risiko'],
  ['x', 'ja', 'XLM 上昇、Stellar エコシステムは成長'],
  ['reddit', 'ko', 'Stellar 네트워크 성장과 XLM 상승 기대'],
  ['telegram', 'ar', 'نمو Stellar و صعود XLM مع خطر السوق'],
  ['on-chain', 'en', 'Network transaction volume and new account growth remain strong'],
  ['market', 'en', 'XLM trading volume gains while order book liquidity improves'],
  ['news', 'zh', 'Stellar 网络增长，XLM 上涨，但仍有风险'],
  ['x', 'en', 'WARNING BUY BUY BUY XLM 🚀🚀🚀 http://spam.test http://spam.test'],
  ['reddit', 'en', 'Not bullish on short term price, but network adoption is strong'],
  ['research', 'en', 'Regulatory compliance improves institutional payment adoption'],
  ['discord', 'en', 'Soroban DeFi liquidity growth is good for the ecosystem'],
  ['news', 'en', 'Stablecoin and remittance partnership expands Stellar payments'],
];

export function createSentimentDocuments(now = new Date()): SentimentDocument[] {
  return CONTENT.map(([source, language, text], index) => ({
    id: `document-${index + 1}`,
    source,
    language,
    text,
    publishedAt: new Date(now.getTime() - index * 180_000).toISOString(),
    collectedAt: new Date(now.getTime() - index * 180_000 + 2_000).toISOString(),
    authorId: `publisher-${index % 7}`,
    authorFollowers: 500 + index * 1700,
    engagement: 25 + index * 83,
    verified:
      source === 'news' || source === 'research' || source === 'on-chain' || source === 'market',
    url: source === 'news' ? `https://example.invalid/article/${index}` : undefined,
  }));
}

export function createSentimentTrend(now = new Date(), incident = false): SentimentTrendPoint[] {
  return Array.from({ length: 48 }, (_, index) => {
    const wave = Math.sin(index / 5) * 0.16,
      drift = index * 0.003,
      shock = incident && index > 43 ? -(index - 43) * 0.2 : 0;
    const score = Math.max(-0.95, Math.min(0.95, 0.12 + wave + drift + shock));
    return {
      timestamp: new Date(now.getTime() - (47 - index) * 3_600_000).toISOString(),
      score: Number(score.toFixed(3)),
      volume: 2200 + index * 38 + (incident && index > 43 ? index * 80 : 0),
      priceUsd: Number((0.31 + index * 0.0008 + score * 0.025).toFixed(4)),
      onChainActivity: 90000 + index * 750,
      positiveShare: Number(Math.max(0.05, 0.5 + score * 0.35).toFixed(3)),
      negativeShare: Number(Math.max(0.05, 0.28 - score * 0.25).toFixed(3)),
    };
  });
}

export function createSourceProfiles(now = new Date()): SourceProfile[] {
  const profiles: Array<[SentimentSource, string, number, boolean]> = [
    ['x', 'X / Twitter', 0.58, false],
    ['reddit', 'Reddit', 0.62, true],
    ['discord', 'Discord', 0.55, false],
    ['telegram', 'Telegram', 0.5, false],
    ['news', 'Crypto news', 0.82, true],
    ['research', 'Research', 0.9, true],
    ['on-chain', 'Stellar on-chain', 0.92, true],
    ['market', 'Market data', 0.88, true],
  ];
  return profiles.map(([source, label, credibility, live], index) => ({
    source,
    label,
    enabled: true,
    live,
    credibility,
    sampleCount: 1200 + index * 730,
    lastCollectedAt: new Date(now.getTime() - index * 7_000).toISOString(),
    latencySeconds: live ? 12 + index * 3 : undefined,
    error: live
      ? undefined
      : 'Connector credentials not configured; using labeled demonstration data',
  }));
}

export function createSentimentSnapshot(
  network = 'public',
  incident = false,
  now = new Date()
): SentimentSnapshot {
  const documents = analyzeBatch(
    createSentimentDocuments(now).map((document, index) =>
      incident && index < 6
        ? {
            ...document,
            text: `Stellar network outage risk and XLM bearish crash concern ${index}`,
          }
        : document
    )
  );
  const trend = createSentimentTrend(now, incident),
    aggregate = weightedScore(documents),
    correlation = pearsonCorrelation(trend, 1);
  const languages = [...new Set(documents.map((item) => item.language))]
    .map((language) => {
      const items = documents.filter((item) => item.language === language);
      return {
        language,
        score: weightedScore(items).score,
        volume: items.length,
        coverage: Number((items.length / documents.length).toFixed(3)),
      };
    })
    .sort((a, b) => b.volume - a.volume);
  const change24h = Number(
    (trend[trend.length - 1].score - trend[trend.length - 25].score).toFixed(3)
  );
  return {
    generatedAt: now.toISOString(),
    state: 'simulation',
    network,
    summary: {
      score: aggregate.score,
      label: labelScore(aggregate.score),
      confidence: aggregate.confidence,
      change24h,
      mentionVolume24h: trend.slice(-24).reduce((s, p) => s + p.volume, 0),
      processedToday: 100_000 + documents.length * 83,
      spamFiltered: aggregate.filtered,
      dataFreshnessSeconds: 12,
    },
    sources: createSourceProfiles(now),
    sourceBreakdown: aggregateSources(documents),
    languageBreakdown: languages,
    aspects: aggregateAspects(documents),
    entities: aggregateEntities(documents),
    trend,
    recentDocuments: documents.slice(0, 12),
    alerts: detectAlerts(trend, now),
    viralSignals: detectViralSignals(documents, now),
    forecast: forecastDirection(trend, correlation),
    priceCorrelation: correlation,
    retentionDays: 730,
    methodologyVersion: 'sentiment-methodology-1.0.0',
    caveats: [
      'Demonstration data is labeled and must not be interpreted as live market intelligence.',
      'Sarcasm, coordinated campaigns, deleted content, and translation ambiguity can reduce model accuracy.',
      'Correlation and forecasts do not establish causation and are not financial advice.',
    ],
  };
}

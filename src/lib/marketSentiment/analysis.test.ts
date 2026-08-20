import { describe, expect, it } from 'vitest';
import type { SentimentDocument, SentimentTrendPoint } from '../../types/marketSentiment';
import {
  aggregateAspects,
  aggregateEntities,
  aggregateSources,
  analyzeBatch,
  analyzeDocument,
  detectAlerts,
  detectViralSignals,
  estimateSpam,
  forecastDirection,
  labelScore,
  pearsonCorrelation,
  SUPPORTED_SENTIMENT_LANGUAGES,
  updateSentimentAlert,
  weightedScore,
} from './analysis';
const document = (patch: Partial<SentimentDocument> = {}): SentimentDocument => ({
  id: 'one',
  source: 'news',
  language: 'en',
  text: 'Stellar adoption growth is strong and secure',
  publishedAt: '2026-08-20T10:00:00Z',
  collectedAt: '2026-08-20T10:00:02Z',
  verified: true,
  engagement: 100,
  ...patch,
});
const trend = (scores: number[]): SentimentTrendPoint[] =>
  scores.map((score, index) => ({
    timestamp: new Date(Date.UTC(2026, 7, 20, index)).toISOString(),
    score,
    volume: 100 + index * 5,
    priceUsd: 0.3 + score * 0.1,
    onChainActivity: 1000,
    positiveShare: 0.5,
    negativeShare: 0.2,
  }));
describe('market sentiment analysis', () => {
  it('classifies contextual positive, negative, and neutral content', () => {
    expect(analyzeDocument(document()).label).toBe('bullish');
    expect(
      analyzeDocument(document({ text: 'XLM crash risk and bearish sell pressure' })).label
    ).toBe('bearish');
    expect(labelScore(0.01)).toBe('neutral');
  });
  it('handles negation and multilingual fallback signals', () => {
    expect(SUPPORTED_SENTIMENT_LANGUAGES.length).toBeGreaterThanOrEqual(20);
    expect(analyzeDocument(document({ text: 'Stellar is not weak' })).score).toBeGreaterThan(0);
    const spanish = analyzeDocument(
      document({ language: 'es', text: 'Stellar tiene buen crecimiento y pagos seguros' })
    );
    expect(spanish.label).toBe('bullish');
    expect(spanish.translated).toBe(true);
    const unsupported = analyzeDocument(
      document({ language: 'und', text: 'Stellar growth is strong' })
    );
    expect(unsupported.confidence).toBeLessThan(
      analyzeDocument(document({ text: 'Stellar growth is strong' })).confidence
    );
  });
  it('detects spam, duplicate content, and down-weights credibility', () => {
    const spam = document({
      source: 'x',
      text: 'BUY BUY BUY BUY BUY BUY XLM http://x.test http://x.test',
      duplicateOf: 'x',
    });
    expect(estimateSpam(spam)).toBeGreaterThan(0.5);
    expect(analyzeDocument(spam).credibility).toBeLessThan(0.5);
    const batch = analyzeBatch([document(), document({ id: 'two' })]);
    expect(batch[1].spamProbability).toBeGreaterThan(batch[0].spamProbability);
  });
  it('extracts aspects and known Stellar entities', () => {
    const item = analyzeDocument(
      document({ text: 'Soroban DeFi liquidity growth and Stellar payment adoption' })
    );
    expect(item.aspects.map((x) => x.aspect)).toEqual(
      expect.arrayContaining(['defi', 'payments', 'ecosystem'])
    );
    expect(item.entities.map((x) => x.entity)).toEqual(
      expect.arrayContaining(['Stellar', 'Soroban'])
    );
  });
  it('aggregates with confidence and source credibility weights', () => {
    const items = analyzeBatch([
      document(),
      document({ id: 'two', source: 'x', verified: false, text: 'XLM bearish crash' }),
      document({ id: 'three', source: 'research', text: 'Stellar network growth is reliable' }),
    ]);
    const aggregate = weightedScore(items);
    expect(aggregate.score).toBeGreaterThan(0);
    expect(aggregate.confidence).toBeGreaterThan(0);
    expect(aggregateSources(items)).toHaveLength(3);
    expect(aggregateAspects(items).length).toBeGreaterThan(0);
    expect(aggregateEntities(items).length).toBeGreaterThan(0);
  });
  it('calculates lagged correlation and guards insufficient data', () => {
    const result = pearsonCorrelation(trend(Array.from({ length: 30 }, (_, i) => i / 30)), 0);
    expect(result.coefficient).toBeGreaterThan(0.9);
    expect(result.statisticallySignificant).toBe(true);
    expect(pearsonCorrelation(trend([0, 0.1]))).toMatchObject({
      sampleSize: 2,
      statisticallySignificant: false,
    });
  });
  it('detects statistically unusual shifts and supports lifecycle changes', () => {
    const alerts = detectAlerts(
      trend([0.1, 0.11, 0.09, 0.1, 0.12, -0.8]),
      new Date('2026-08-20T12:00:00Z')
    );
    expect(alerts[0]).toMatchObject({ severity: 'critical', status: 'active' });
    expect(updateSentimentAlert(alerts, alerts[0].id, 'acknowledged')[0].status).toBe(
      'acknowledged'
    );
    expect(detectAlerts(trend([0.1, 0.11, 0.09, 0.1, 0.1]))).toEqual([]);
  });
  it('finds viral entities and creates bounded direction forecasts', () => {
    const items = analyzeBatch(
      Array.from({ length: 8 }, (_, i) =>
        document({
          id: `d-${i}`,
          source: 'reddit',
          text: 'Stellar XLM adoption growth is strong',
          engagement: 1000,
        })
      )
    );
    expect(detectViralSignals(items)[0].topic).toBeDefined();
    const series = trend(Array.from({ length: 30 }, (_, i) => i * 0.01));
    const forecast = forecastDirection(series, pearsonCorrelation(series));
    expect(forecast.direction).toBe('bullish');
    expect(forecast.probability).toBeLessThanOrEqual(1);
    expect(forecast.disclaimer).toMatch(/not financial advice/i);
  });
});

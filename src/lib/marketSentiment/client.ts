import type {
  SentimentApiError,
  SentimentSnapshot,
  SentimentSnapshotResponse,
} from '../../types/marketSentiment';
import { createSentimentSnapshot } from './fixtures';

const CACHE_TTL = 30_000,
  cache = new Map<string, { data: SentimentSnapshot; storedAt: number }>();
export class MarketSentimentError extends Error implements SentimentApiError {
  code: SentimentApiError['code'];
  retryable: boolean;
  requestId?: string;
  constructor(error: SentimentApiError) {
    super(error.message);
    this.name = 'MarketSentimentError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.requestId = error.requestId;
  }
}
const requestId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `sentiment-${Date.now()}`;
const isSnapshot = (value: unknown): value is SentimentSnapshot =>
  Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as SentimentSnapshot).trend) &&
    (value as SentimentSnapshot).summary
  );

export async function getSentimentSnapshot(
  network: string,
  options: { signal?: AbortSignal; force?: boolean; allowStale?: boolean } = {}
): Promise<SentimentSnapshotResponse> {
  const id = requestId(),
    existing = cache.get(network);
  if (!options.force && existing && Date.now() - existing.storedAt < CACHE_TTL)
    return { data: existing.data, requestId: id, cached: true };
  const endpoint = import.meta.env.VITE_SENTIMENT_API_URL as string | undefined;
  if (!endpoint) {
    const data = createSentimentSnapshot(network);
    cache.set(network, { data, storedAt: Date.now() });
    return { data, requestId: id, cached: false };
  }
  const controller = new AbortController(),
    abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, '')}/v1/sentiment/${encodeURIComponent(network)}/snapshot`,
      { headers: { Accept: 'application/json', 'X-Request-ID': id }, signal: controller.signal }
    );
    if (response.status === 429)
      throw new MarketSentimentError({
        code: 'rate-limited',
        message: 'Sentiment service rate limit reached.',
        retryable: true,
        requestId: id,
      });
    if (!response.ok)
      throw new MarketSentimentError({
        code: 'unavailable',
        message: `Sentiment service returned HTTP ${response.status}.`,
        retryable: response.status >= 500,
        requestId: id,
      });
    const payload: unknown = await response.json();
    if (!isSnapshot(payload))
      throw new MarketSentimentError({
        code: 'invalid-response',
        message: 'Sentiment service returned an invalid snapshot.',
        retryable: true,
        requestId: id,
      });
    const data = { ...payload, state: 'live' as const };
    cache.set(network, { data, storedAt: Date.now() });
    return { data, requestId: id, cached: false };
  } catch (error) {
    if (options.signal?.aborted)
      throw new MarketSentimentError({
        code: 'aborted',
        message: 'Sentiment request was cancelled.',
        retryable: false,
        requestId: id,
      });
    if (options.allowStale && existing)
      return { data: { ...existing.data, state: 'degraded' }, requestId: id, cached: true };
    if (error instanceof MarketSentimentError) throw error;
    throw new MarketSentimentError({
      code: controller.signal.aborted ? 'timeout' : 'unavailable',
      message: controller.signal.aborted
        ? 'Sentiment service did not respond in time.'
        : 'Unable to load sentiment intelligence.',
      retryable: true,
      requestId: id,
    });
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
export const createDemonstrationSentiment = (network: string, incident = false, now = new Date()) =>
  createSentimentSnapshot(network, incident, now);

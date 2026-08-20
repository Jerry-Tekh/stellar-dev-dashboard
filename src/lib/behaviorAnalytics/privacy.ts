import type {
  AnalyticsProperty,
  BehaviorEvent,
  PrivateAggregate,
  TrackEventInput,
} from '../../types/behaviorAnalytics';

export const RETENTION_DAYS = 30;
export const MAX_EVENTS = 2_000;
export const DIFFERENTIAL_PRIVACY_EPSILON = 1;

const SAFE_PROPERTY_KEYS = new Set([
  'tab',
  'feature',
  'workflow',
  'outcome',
  'durationBucket',
  'step',
  'level',
  'topic',
  'network',
  'source',
  'rating',
  'variant',
]);

const SENSITIVE_KEY_PATTERN =
  /(?:address|account|public.?key|private.?key|secret|seed|signature|hash|memo|token|email|name|ip|wallet)/i;
const STELLAR_ADDRESS_PATTERN = /\bG[A-Z2-7]{55}\b/;
const SECRET_SEED_PATTERN = /\bS[A-Z2-7]{55}\b/;
const TX_HASH_PATTERN = /\b[a-f\d]{64}\b/i;

export function containsSensitiveValue(value: string): boolean {
  return (
    STELLAR_ADDRESS_PATTERN.test(value) ||
    SECRET_SEED_PATTERN.test(value) ||
    TX_HASH_PATTERN.test(value)
  );
}

export function sanitizeEventProperties(
  properties: Record<string, unknown> = {}
): Record<string, AnalyticsProperty> {
  const sanitized: Record<string, AnalyticsProperty> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_PROPERTY_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (typeof value === 'string') {
      if (value.length > 80 || containsSensitiveValue(value)) continue;
      sanitized[key] = value;
      continue;
    }
    sanitized[key] = value as number | boolean;
  }

  return sanitized;
}

export function sanitizeEventName(name: string): string {
  if (containsSensitiveValue(name)) return 'sensitive_value_removed';
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || 'unknown';
}

export function isValidTrackInput(input: TrackEventInput): boolean {
  return Boolean(input && input.type && typeof input.name === 'string' && input.name.trim());
}

export function pruneEvents(
  events: BehaviorEvent[],
  now = Date.now(),
  retentionDays = RETENTION_DAYS
): BehaviorEvent[] {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1_000;
  return events
    .filter((event) => {
      const time = Date.parse(event.occurredAt);
      return Number.isFinite(time) && time >= cutoff && time <= now + 60_000;
    })
    .slice(-MAX_EVENTS);
}

/** Laplace mechanism for count metrics with a sensitivity of one. */
export function addLaplaceNoise(
  value: number,
  epsilon = DIFFERENTIAL_PRIVACY_EPSILON,
  random = Math.random
): number {
  if (!Number.isFinite(value) || epsilon <= 0) return 0;
  const uniform = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, random())) - 0.5;
  const noise = -(1 / epsilon) * Math.sign(uniform) * Math.log(1 - 2 * Math.abs(uniform));
  return Math.max(0, Math.round(value + noise));
}

export function buildPrivateAggregates(
  events: BehaviorEvent[],
  epsilon = DIFFERENTIAL_PRIVACY_EPSILON,
  random = Math.random
): PrivateAggregate[] {
  const sessions = new Set(events.map((event) => event.sessionId)).size;
  const navigation = events.filter((event) => event.type === 'navigation').length;
  const successfulWorkflows = events.filter(
    (event) => event.type === 'transaction_workflow' && event.properties.outcome === 'success'
  ).length;

  return [
    {
      metric: 'events',
      value: addLaplaceNoise(events.length, epsilon, random),
      noiseApplied: true,
      epsilon,
    },
    {
      metric: 'sessions',
      value: addLaplaceNoise(sessions, epsilon, random),
      noiseApplied: true,
      epsilon,
    },
    {
      metric: 'navigation',
      value: addLaplaceNoise(navigation, epsilon, random),
      noiseApplied: true,
      epsilon,
    },
    {
      metric: 'successful_workflows',
      value: addLaplaceNoise(successfulWorkflows, epsilon, random),
      noiseApplied: true,
      epsilon,
    },
  ];
}

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const EVENT_TYPES = new Set([
  'navigation',
  'feature_use',
  'transaction_workflow',
  'preference_change',
  'learning_progress',
  'collaboration',
  'feedback',
]);

export const SAFE_PROPERTIES = new Set([
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

const SENSITIVE_KEY =
  /(?:address|account|public.?key|private.?key|secret|seed|signature|hash|memo|token|email|name|ip|wallet)/i;
const SENSITIVE_VALUE = /(?:\b[GS][A-Z2-7]{55}\b|\b[a-f\d]{64}\b)/i;
const SUBJECT_PATTERN = /^[a-f\d]{64}$/;

export function deriveSubjectId(clientId, salt) {
  if (typeof clientId !== 'string' || clientId.length < 8 || clientId.length > 160) return null;
  return createHash('sha256').update(`${salt}:${clientId}`).digest('hex');
}

export function isSubjectId(value) {
  return typeof value === 'string' && SUBJECT_PATTERN.test(value);
}

export function sanitizeProperties(properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  const safe = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!SAFE_PROPERTIES.has(key) || SENSITIVE_KEY.test(key)) continue;
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (typeof value === 'string' && (value.length > 80 || SENSITIVE_VALUE.test(value))) continue;
    safe[key] = value;
  }
  return safe;
}

export function sanitizeName(value) {
  if (typeof value !== 'string' || SENSITIVE_VALUE.test(value)) return 'sensitive_value_removed';
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64) || 'unknown'
  );
}

export function sanitizeEvent(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || !EVENT_TYPES.has(value.type)) return null;
  const occurredAt = Date.parse(value.occurredAt);
  if (!Number.isFinite(occurredAt) || occurredAt > now + 60_000) return null;
  if (occurredAt < now - 31 * 24 * 60 * 60 * 1000) return null;
  const sourceId =
    typeof value.id === 'string' ? value.id.slice(0, 100) : randomBytes(12).toString('hex');
  return {
    id: createHash('sha256').update(sourceId).digest('hex').slice(0, 32),
    type: value.type,
    name: sanitizeName(value.name),
    occurredAt: new Date(occurredAt).toISOString(),
    sessionId: createHash('sha256')
      .update(String(value.sessionId || 'unknown'))
      .digest('hex')
      .slice(0, 24),
    properties: sanitizeProperties(value.properties),
  };
}

export function laplace(value, epsilon = 1, random = Math.random) {
  const u = Math.min(1 - Number.EPSILON, Math.max(Number.EPSILON, random())) - 0.5;
  const noise = -(1 / epsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.max(0, Math.round(value + noise));
}

export function constantTimeTokenMatch(provided, expected) {
  if (!expected) return false;
  const left = createHash('sha256')
    .update(String(provided || ''))
    .digest();
  const right = createHash('sha256').update(String(expected)).digest();
  return left.length === right.length && timingSafeEqual(left, right);
}

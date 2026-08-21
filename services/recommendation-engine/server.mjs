import http from 'node:http';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8791);
const MAX_BODY = 128 * 1024;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Number(process.env.RECOMMENDATION_RATE_LIMIT || 600);
const allowedOrigins = (process.env.RECOMMENDATION_ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const requestBuckets = new Map();
const aggregates = new Map();
const metrics = { requests: 0, failures: 0, feedback: 0, latencyMs: 0, startedAt: Date.now() };

const catalog = [
  [
    'account-sdf',
    'account',
    'Stellar Development Foundation',
    'Protocol releases, grants, and ecosystem operations.',
    'https://stellar.org',
    ['protocol', 'grants', 'network', 'builders'],
    ['build', 'learn'],
    'conservative',
    0.98,
    0.99,
    0.16,
    { builder: 0.96, learner: 0.91, payments: 0.65 },
    { verified: true, sector: 'infrastructure' },
  ],
  [
    'account-soroban',
    'account',
    'Soroban Developers',
    'Smart contract updates and examples for Stellar builders.',
    'https://developers.stellar.org/docs/build/smart-contracts',
    ['soroban', 'rust', 'contracts', 'builders'],
    ['build', 'learn'],
    'balanced',
    0.82,
    0.96,
    0.42,
    { builder: 0.99, learner: 0.8, defi: 0.62 },
    { verified: true, sector: 'developer-tools' },
  ],
  [
    'asset-xlm',
    'asset',
    'Stellar Lumens (XLM)',
    'Native asset for fees, balances, and network liquidity.',
    'https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/assets',
    ['xlm', 'native', 'liquidity', 'fees'],
    ['invest', 'payments', 'learn'],
    'balanced',
    1,
    0.97,
    0.08,
    { investor: 0.92, payments: 0.9, learner: 0.96 },
    { verified: true, network: 'both', sector: 'native' },
  ],
  [
    'asset-usdc',
    'asset',
    'USDC on Stellar',
    'Dollar stablecoin for payment and treasury workflows.',
    'https://stellar.org/usdc',
    ['usdc', 'stablecoin', 'payments', 'treasury'],
    ['payments', 'defi', 'invest'],
    'conservative',
    0.94,
    0.96,
    0.2,
    { payments: 0.99, investor: 0.78, defi: 0.83 },
    { verified: true, network: 'mainnet', sector: 'stablecoin' },
  ],
  [
    'asset-aqua',
    'asset',
    'AQUA',
    'Liquidity incentives and ecosystem governance.',
    'https://aqua.network',
    ['aqua', 'liquidity', 'dex', 'governance'],
    ['defi', 'invest'],
    'growth',
    0.66,
    0.72,
    0.68,
    { defi: 0.91, investor: 0.7 },
    { network: 'mainnet', sector: 'defi' },
  ],
  [
    'contract-blend',
    'contract',
    'Blend Protocol',
    'Soroban lending and borrowing liquidity markets.',
    'https://blend.capital',
    ['soroban', 'defi', 'lending', 'liquidity'],
    ['defi', 'build', 'invest'],
    'growth',
    0.77,
    0.84,
    0.7,
    { defi: 0.98, builder: 0.71, investor: 0.7 },
    { network: 'mainnet', sector: 'defi', securityScore: 86 },
  ],
  [
    'contract-token',
    'contract',
    'Soroban Token Example',
    'Reviewed reference for token interfaces and authorization.',
    'https://developers.stellar.org/docs/build/smart-contracts/example-contracts/token',
    ['soroban', 'token', 'rust', 'security'],
    ['build', 'learn'],
    'conservative',
    0.72,
    0.95,
    0.44,
    { builder: 0.97, learner: 0.9 },
    { verified: true, network: 'both', sector: 'developer-tools', securityScore: 94 },
  ],
  [
    'contract-amm',
    'contract',
    'Soroban AMM Example',
    'Open reference implementation for AMM mechanics.',
    'https://developers.stellar.org/docs/build/smart-contracts/example-contracts/amm',
    ['soroban', 'amm', 'dex', 'rust'],
    ['build', 'defi', 'learn'],
    'balanced',
    0.64,
    0.9,
    0.58,
    { builder: 0.91, defi: 0.89, learner: 0.75 },
    { verified: true, network: 'both', sector: 'defi', securityScore: 90 },
  ],
  [
    'service-freighter',
    'service',
    'Freighter Wallet',
    'Browser wallet for accounts, assets, and Soroban applications.',
    'https://www.freighter.app',
    ['wallet', 'soroban', 'security', 'builders'],
    ['build', 'defi', 'payments', 'learn'],
    'conservative',
    0.94,
    0.95,
    0.24,
    { builder: 0.96, learner: 0.87, defi: 0.82, payments: 0.7 },
    { verified: true, network: 'both', sector: 'wallet' },
  ],
  [
    'service-lab',
    'service',
    'Stellar Laboratory',
    'Build transactions, inspect XDR, and call Horizon.',
    'https://lab.stellar.org',
    ['developer-tools', 'xdr', 'transactions', 'horizon'],
    ['build', 'learn'],
    'conservative',
    0.89,
    0.98,
    0.32,
    { builder: 1, learner: 0.86 },
    { verified: true, network: 'both', sector: 'developer-tools' },
  ],
  [
    'service-expert',
    'service',
    'StellarExpert',
    'Explore accounts, assets, contracts, and network analytics.',
    'https://stellar.expert',
    ['explorer', 'analytics', 'assets', 'contracts'],
    ['invest', 'build', 'learn'],
    'conservative',
    0.91,
    0.92,
    0.28,
    { investor: 0.88, builder: 0.82, learner: 0.78 },
    { network: 'both', sector: 'analytics' },
  ],
  [
    'service-anchor',
    'service',
    'Anchor Platform',
    'Deploy SEP-compliant payment infrastructure.',
    'https://developers.stellar.org/platforms/anchor-platform',
    ['anchor', 'sep', 'payments', 'builders'],
    ['build', 'payments'],
    'balanced',
    0.61,
    0.94,
    0.63,
    { builder: 0.94, payments: 0.96 },
    { verified: true, network: 'both', sector: 'payments' },
  ],
].map(
  ([
    id,
    category,
    title,
    description,
    url,
    tags,
    goals,
    risk,
    popularity,
    quality,
    novelty,
    collaborativeSignals,
    metadata,
  ]) => ({
    id,
    category,
    title,
    description,
    url,
    tags,
    goals,
    risk,
    popularity,
    quality,
    novelty,
    collaborativeSignals,
    metadata,
  })
);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 1000) / 1000;
function fraction(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
function experiment(id) {
  const value = fraction(`ecosystem-ranking-v1:${id}`);
  return {
    id: 'ecosystem-ranking-v1',
    variant: value < 0.34 ? 'relevance' : value < 0.67 ? 'balanced' : 'discovery',
  };
}
function overlap(left, right) {
  const a = new Set(left.map((value) => String(value).toLowerCase())),
    b = new Set(right.map((value) => String(value).toLowerCase())),
    union = new Set([...a, ...b]);
  if (!union.size) return 0;
  return [...a].filter((value) => b.has(value)).length / union.size;
}
const cohort = {
  build: 'builder',
  invest: 'investor',
  payments: 'payments',
  defi: 'defi',
  learn: 'learner',
};
const weights = {
  relevance: { content: 0.38, collaborative: 0.27, quality: 0.22, context: 0.06, novelty: 0.07 },
  balanced: { content: 0.3, collaborative: 0.24, quality: 0.2, context: 0.08, novelty: 0.18 },
  discovery: { content: 0.22, collaborative: 0.2, quality: 0.18, context: 0.08, novelty: 0.32 },
};
function rank(request) {
  const started = performance.now(),
    profile = request.profile,
    assignment = request.experiment || experiment(profile.pseudonymousId),
    selectedWeights = weights[assignment.variant] || weights.balanced;
  const excluded = new Set([...(request.excludeIds || []), ...(profile.usedItems || [])]),
    categories = new Set(profile.preferences.categories);
  const risk = ['conservative', 'balanced', 'growth'],
    preferredRisk = risk.indexOf(profile.preferences.riskTolerance);
  const feedback = new Map(profile.feedback.map((entry) => [entry.itemId, entry.value]));
  let items = catalog
    .filter(
      (item) =>
        categories.has(item.category) &&
        (!request.category || item.category === request.category) &&
        !excluded.has(item.id) &&
        feedback.get(item.id) !== 'dismissed'
    )
    .map((item) => {
      const goals = profile.preferences.goals,
        content = clamp(
          overlap([...profile.interests, ...profile.heldAssets], item.tags) * 0.48 +
            overlap(goals, item.goals) * 0.38 +
            (1 - Math.abs(preferredRisk - risk.indexOf(item.risk)) * 0.42) * 0.14
        );
      const collaborative = goals.length
        ? goals.reduce((sum, goal) => sum + (item.collaborativeSignals[cohort[goal]] || 0), 0) /
          goals.length
        : item.popularity;
      const context =
        !item.metadata.network ||
        item.metadata.network === 'both' ||
        item.metadata.network === request.context.network
          ? 1
          : 0.2;
      const novelty =
        item.novelty * profile.preferences.discovery +
        item.popularity * (1 - profile.preferences.discovery);
      const feedbackBoost =
        feedback.get(item.id) === 'accepted' ? 0.28 : feedback.get(item.id) === 'saved' ? 0.18 : 0;
      const score = clamp(
        content * selectedWeights.content +
          collaborative * selectedWeights.collaborative +
          item.quality * selectedWeights.quality +
          context * selectedWeights.context +
          novelty * selectedWeights.novelty +
          feedbackBoost
      );
      const matchingGoals = item.goals.filter((goal) => goals.includes(goal)),
        reasons = [];
      if (matchingGoals.length)
        reasons.push(`Supports your ${matchingGoals.slice(0, 2).join(' and ')} goals`);
      if (collaborative >= 0.8) reasons.push('Popular with people pursuing similar workflows');
      if (item.metadata.verified) reasons.push('Verified ecosystem resource');
      return {
        item,
        score,
        confidence: clamp(0.48 + item.quality * 0.25 + (content + collaborative) * 0.14),
        reasons: reasons.slice(0, 3),
        breakdown: {
          content,
          collaborative,
          quality: item.quality,
          context,
          novelty,
          feedback: feedbackBoost,
          diversityPenalty: 0,
        },
        rank: 0,
      };
    })
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id));
  const selected = [],
    limit = clamp(request.limit || 8, 1, 20);
  while (items.length && selected.length < limit) {
    let winner = 0,
      utility = -1;
    items.forEach((candidate, index) => {
      const penalty = selected.length
        ? Math.max(
            ...selected.map(
              (choice) =>
                (choice.item.category === candidate.item.category ? 0.35 : 0) +
                overlap(choice.item.tags, candidate.item.tags) * 0.4
            )
          ) *
          profile.preferences.diversity *
          0.34
        : 0;
      if (candidate.score - penalty > utility) {
        utility = candidate.score - penalty;
        winner = index;
      }
    });
    const [choice] = items.splice(winner, 1),
      penalty = choice.score - utility;
    selected.push({
      ...choice,
      score: round(clamp(utility)),
      confidence: round(choice.confidence),
      breakdown: { ...choice.breakdown, diversityPenalty: round(penalty) },
      rank: selected.length + 1,
    });
  }
  return {
    recommendations: selected,
    generatedAt: new Date().toISOString(),
    modelVersion: 'hybrid-service-1.0.0',
    state: 'live',
    experiment: assignment,
    processingMs: round(performance.now() - started),
    coldStart: !profile.feedback.length && !profile.interests.length,
  };
}
function validate(value) {
  if (!value || typeof value !== 'object') return 'body must be an object';
  const profile = value.profile,
    context = value.context;
  if (
    !profile ||
    typeof profile.pseudonymousId !== 'string' ||
    profile.pseudonymousId.length < 8 ||
    profile.pseudonymousId.length > 80
  )
    return 'profile.pseudonymousId must contain 8-80 characters';
  if (
    !profile.preferences ||
    !Array.isArray(profile.preferences.goals) ||
    !Array.isArray(profile.preferences.categories)
  )
    return 'profile.preferences is invalid';
  if (
    ![profile.interests, profile.heldAssets, profile.usedItems, profile.feedback].every(
      Array.isArray
    )
  )
    return 'profile collections must be arrays';
  if (
    [...profile.interests, ...profile.heldAssets].some(
      (value) => typeof value !== 'string' || value.length > 32 || /^[GS][A-Z2-7]{55}$/.test(value)
    )
  )
    return 'profile contains an invalid or sensitive feature';
  if (profile.feedback.length > 100) return 'profile.feedback exceeds 100 entries';
  if (!context || typeof context.network !== 'string' || typeof context.online !== 'boolean')
    return 'context is invalid';
  if (value.limit && (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 20))
    return 'limit must be between 1 and 20';
  return null;
}
function cors(req) {
  const origin = req.headers.origin;
  return origin && allowedOrigins.includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'content-type,x-request-id',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        vary: 'Origin',
      }
    : {};
}
function json(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}
function limited(req) {
  const key = req.socket.remoteAddress || 'unknown',
    now = Date.now(),
    bucket = requestBuckets.get(key);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    requestBuckets.set(key, { start: now, count: 1 });
    return false;
  }
  bucket.count++;
  return bucket.count > RATE_LIMIT;
}
async function body(req) {
  return new Promise((resolve, reject) => {
    let text = '',
      size = 0;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body exceeds 128 KB'), { status: 413 }));
        req.destroy();
      } else text += chunk;
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('malformed JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
export function createRecommendationServer() {
  return http.createServer(async (req, res) => {
    const headers = cors(req),
      url = new URL(req.url, 'http://localhost');
    metrics.requests++;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }
    if (limited(req))
      return json(
        res,
        429,
        { error: { code: 'rate_limited', message: 'Too many requests.' } },
        headers
      );
    if (req.method === 'GET' && url.pathname === '/healthz')
      return json(
        res,
        200,
        { status: 'ok', modelVersion: 'hybrid-service-1.0.0', catalogSize: catalog.length },
        headers
      );
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const text = `recommendation_requests_total ${metrics.requests}\nrecommendation_failures_total ${metrics.failures}\nrecommendation_feedback_total ${metrics.feedback}\nrecommendation_latency_ms_total ${metrics.latencyMs.toFixed(3)}\n`;
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4', ...headers });
      return res.end(text);
    }
    if (req.method === 'GET' && url.pathname === '/api/v1/catalog')
      return json(
        res,
        200,
        { items: catalog.map(({ collaborativeSignals, ...item }) => item), count: catalog.length },
        headers
      );
    try {
      if (req.method === 'POST' && url.pathname === '/api/v1/recommendations') {
        const input = await body(req),
          error = validate(input);
        if (error) {
          metrics.failures++;
          return json(res, 400, { error: { code: 'invalid_request', message: error } }, headers);
        }
        const result = rank(input);
        metrics.latencyMs += result.processingMs;
        return json(res, 200, result, headers);
      }
      if (req.method === 'POST' && url.pathname === '/api/v1/feedback') {
        const input = await body(req);
        if (
          !input ||
          !['account', 'asset', 'contract', 'service'].includes(input.category) ||
          !['accepted', 'dismissed', 'saved'].includes(input.value) ||
          !['relevance', 'balanced', 'discovery'].includes(input.variant)
        ) {
          metrics.failures++;
          return json(
            res,
            400,
            {
              error: {
                code: 'invalid_feedback',
                message: 'Only category, value, and variant aggregates are accepted.',
              },
            },
            headers
          );
        }
        const key = `${input.category}:${input.value}:${input.variant}`;
        aggregates.set(key, (aggregates.get(key) || 0) + 1);
        metrics.feedback++;
        return json(res, 202, { accepted: true }, headers);
      }
      return json(res, 404, { error: { code: 'not_found', message: 'Route not found.' } }, headers);
    } catch (error) {
      metrics.failures++;
      return json(
        res,
        error.status || 500,
        {
          error: {
            code: error.status === 413 ? 'payload_too_large' : 'invalid_json',
            message: error.message,
          },
        },
        headers
      );
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createRecommendationServer().listen(PORT, () =>
    console.info(`Recommendation service listening on ${PORT}`)
  );
}

export { catalog, rank, validate };

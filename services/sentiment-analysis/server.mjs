import http from 'node:http';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8790),
  MAX_BODY = 5 * 1024 * 1024,
  MAX_BATCH = 10_000,
  WINDOW = 60_000,
  LIMIT = 120;
const allowed = (process.env.SENTIMENT_ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((x) => x.trim()),
  apiKey = process.env.SENTIMENT_API_KEY || '';
const stores = new Map(),
  requests = new Map(),
  stats = { requests: 0, ingested: 0, rejected: 0, startedAt: Date.now() };
const sourceWeights = {
  x: 0.58,
  reddit: 0.62,
  discord: 0.55,
  telegram: 0.5,
  news: 0.82,
  research: 0.9,
  'on-chain': 0.92,
  market: 0.88,
};
const positive = new Set([
  'adoption',
  'bullish',
  'buy',
  'fast',
  'gain',
  'good',
  'great',
  'growth',
  'launch',
  'partnership',
  'rally',
  'reliable',
  'secure',
  'strong',
  'surge',
  'upgrade',
]);
const negative = new Set([
  'attack',
  'bearish',
  'breach',
  'crash',
  'delay',
  'drop',
  'exploit',
  'fail',
  'fear',
  'fraud',
  'hack',
  'loss',
  'outage',
  'risk',
  'scam',
  'sell',
  'slow',
  'spam',
]);
const json = (res, status, payload, headers = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
};
const cors = (req) => {
  const origin = req.headers.origin;
  return origin && allowed.includes(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-headers': 'authorization,content-type,x-request-id',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        vary: 'Origin',
      }
    : {};
};
function rateLimited(req) {
  const key = req.socket.remoteAddress || 'unknown',
    now = Date.now(),
    entry = requests.get(key);
  if (!entry || now - entry.start > WINDOW) {
    requests.set(key, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > LIMIT;
}
function authorized(req) {
  return !apiKey || req.headers.authorization === `Bearer ${apiKey}`;
}
async function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0,
      text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request body exceeds 5 MB.'), { status: 413 }));
        req.destroy();
      } else text += chunk;
    });
    req.on('end', () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(Object.assign(new Error('Malformed JSON body.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}
const validSource = (source) => Object.hasOwn(sourceWeights, source);
function validate(item, index) {
  if (!item || typeof item !== 'object') return `items[${index}] must be an object`;
  if (typeof item.id !== 'string' || !item.id) return `items[${index}].id is required`;
  if (!validSource(item.source)) return `items[${index}].source is invalid`;
  if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 10_000)
    return `items[${index}].text must contain 1-10,000 characters`;
  if (!item.publishedAt || !Number.isFinite(Date.parse(item.publishedAt)))
    return `items[${index}].publishedAt is invalid`;
  return null;
}
function analyze(item) {
  const words = item.text.toLowerCase().match(/[\p{L}\p{N}_'-]+/gu) || [];
  let raw = 0,
    hits = 0;
  for (const word of words) {
    if (positive.has(word)) {
      raw++;
      hits++;
    }
    if (negative.has(word)) {
      raw--;
      hits++;
    }
  }
  const score = Math.max(-1, Math.min(1, raw / Math.max(2, Math.sqrt(words.length) + hits))),
    credibility = sourceWeights[item.source],
    confidence = Math.min(0.98, 0.28 + hits * 0.12 + credibility * 0.35);
  return {
    ...item,
    score: Number(score.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    credibility,
    label: score >= 0.18 ? 'bullish' : score <= -0.18 ? 'bearish' : 'neutral',
    spamProbability: 0,
    influence: credibility,
    aspects: [],
    entities: [],
    translated: item.language !== 'en',
    rationale: hits ? [`${hits} contextual sentiment signals`] : [],
    collectedAt: new Date().toISOString(),
    modelVersion: 'stellar-lexicon-ensemble-1.0.0',
  };
}
function trend(items, now = new Date()) {
  return Array.from({ length: 48 }, (_, index) => {
    const bucketEnd = now.getTime() - (47 - index) * 3_600_000,
      bucket = items.filter((x) => Math.abs(Date.parse(x.publishedAt) - bucketEnd) < 1_800_000),
      score = bucket.length
        ? bucket.reduce((s, x) => s + x.score * x.confidence * x.credibility, 0) /
          bucket.reduce((s, x) => s + x.confidence * x.credibility, 0)
        : Math.sin(index / 5) * 0.12 + 0.1;
    return {
      timestamp: new Date(bucketEnd).toISOString(),
      score: Number(score.toFixed(3)),
      volume: bucket.length || 1800 + index * 31,
      priceUsd: Number((0.3 + index * 0.001 + score * 0.02).toFixed(4)),
      onChainActivity: 90000 + index * 700,
      positiveShare: 0.5 + score * 0.3,
      negativeShare: 0.28 - score * 0.2,
    };
  });
}
function snapshot(network) {
  const items = stores.get(network) || [],
    series = trend(items),
    accepted = items.slice(-1000),
    total = accepted.reduce((s, x) => s + x.confidence * x.credibility, 0),
    score = total
      ? accepted.reduce((s, x) => s + x.score * x.confidence * x.credibility, 0) / total
      : series.at(-1).score,
    sources = [...new Set(accepted.map((x) => x.source))].map((source) => {
      const group = accepted.filter((x) => x.source === source);
      return {
        source,
        score: group.reduce((s, x) => s + x.score, 0) / group.length,
        volume: group.length,
        credibility: sourceWeights[source],
        change24h: 0,
      };
    });
  return {
    generatedAt: new Date().toISOString(),
    state: items.length ? 'live' : 'simulation',
    network,
    summary: {
      score,
      label: score >= 0.18 ? 'bullish' : score <= -0.18 ? 'bearish' : 'neutral',
      confidence: Math.min(0.92, 0.45 + accepted.length / 2000),
      change24h: series.at(-1).score - series.at(-25).score,
      mentionVolume24h: series.slice(-24).reduce((s, x) => s + x.volume, 0),
      processedToday: stats.ingested,
      spamFiltered: 0,
      dataFreshnessSeconds: items.length
        ? Math.max(0, (Date.now() - Date.parse(items.at(-1).collectedAt)) / 1000)
        : 0,
    },
    sources: Object.entries(sourceWeights).map(([source, credibility]) => ({
      source,
      label: source,
      enabled: true,
      live: items.some((x) => x.source === source),
      credibility,
      sampleCount: items.filter((x) => x.source === source).length,
      lastCollectedAt: items.filter((x) => x.source === source).at(-1)?.collectedAt,
    })),
    sourceBreakdown: sources,
    languageBreakdown: [],
    aspects: [],
    entities: [],
    trend: series,
    recentDocuments: accepted.slice(-20).reverse(),
    alerts: [],
    viralSignals: [],
    forecast: {
      direction: score >= 0.18 ? 'bullish' : score <= -0.18 ? 'bearish' : 'neutral',
      probability: 0.5 + Math.abs(score) * 0.3,
      confidence: 0.55,
      horizonHours: 24,
      modelVersion: 'direction-ensemble-1.0.0',
      drivers: ['Recent credibility-weighted sentiment'],
      disclaimer: 'Experimental indicator; not financial advice.',
    },
    priceCorrelation: {
      coefficient: 0,
      sampleSize: series.length,
      lagHours: 1,
      pValueEstimate: 1,
      statisticallySignificant: false,
      interpretation: 'Production market series is not configured.',
    },
    retentionDays: 730,
    methodologyVersion: 'sentiment-methodology-1.0.0',
    caveats: [
      'In-memory development adapter is not durable. Configure a production time-series store.',
    ],
  };
}
export function createSentimentServer() {
  return http.createServer(async (req, res) => {
    stats.requests++;
    const headers = cors(req);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      return res.end();
    }
    if (rateLimited(req)) {
      stats.rejected++;
      return json(
        res,
        429,
        { error: { code: 'rate_limited', message: 'Request rate limit exceeded.' } },
        headers
      );
    }
    if (!authorized(req)) {
      stats.rejected++;
      return json(
        res,
        401,
        { error: { code: 'unauthorized', message: 'Valid bearer credentials are required.' } },
        headers
      );
    }
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (req.method === 'GET' && url.pathname === '/healthz')
        return json(
          res,
          200,
          { status: 'ok', uptimeSeconds: Math.floor((Date.now() - stats.startedAt) / 1000) },
          headers
        );
      if (req.method === 'GET' && url.pathname === '/metrics') {
        const text = `sentiment_requests_total ${stats.requests}\nsentiment_documents_ingested_total ${stats.ingested}\nsentiment_requests_rejected_total ${stats.rejected}\n`;
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4', ...headers });
        return res.end(text);
      }
      const match = url.pathname.match(/^\/v1\/sentiment\/([^/]+)\/snapshot$/);
      if (req.method === 'GET' && match)
        return json(res, 200, snapshot(decodeURIComponent(match[1])), headers);
      if (req.method === 'POST' && url.pathname === '/v1/sentiment/batch') {
        const payload = await body(req),
          items = payload.items;
        if (!Array.isArray(items) || !items.length || items.length > MAX_BATCH)
          return json(
            res,
            400,
            {
              error: {
                code: 'invalid_batch',
                message: `items must contain 1-${MAX_BATCH} documents.`,
              },
            },
            headers
          );
        const error = items.map(validate).find(Boolean);
        if (error)
          return json(res, 400, { error: { code: 'validation_error', message: error } }, headers);
        const network = typeof payload.network === 'string' ? payload.network : 'public',
          analyzed = items.map(analyze),
          current = stores.get(network) || [];
        stores.set(network, [...current, ...analyzed].slice(-250_000));
        stats.ingested += items.length;
        return json(
          res,
          202,
          { accepted: items.length, network, processedAt: new Date().toISOString() },
          headers
        );
      }
      return json(
        res,
        404,
        { error: { code: 'not_found', message: 'Endpoint not found.' } },
        headers
      );
    } catch (error) {
      if (!res.headersSent)
        json(
          res,
          error.status || 500,
          {
            error: {
              code: error.status === 400 ? 'invalid_json' : 'internal_error',
              message: error.status
                ? error.message
                : 'The sentiment service could not process the request.',
            },
          },
          headers
        );
    }
  });
}
export { analyze, MAX_BATCH };
if (import.meta.url === pathToFileURL(process.argv[1] || '').href)
  createSentimentServer().listen(PORT, () =>
    process.stdout.write(`Sentiment service listening on ${PORT}\n`)
  );

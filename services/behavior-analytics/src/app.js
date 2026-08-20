import express from 'express';
import cors from 'cors';
import { analyzeFeedback, assignVariant } from './engine.js';
import { AnalyticsStore } from './store.js';
import { constantTimeTokenMatch, deriveSubjectId, isSubjectId } from './privacy.js';

const MAX_BATCH_SIZE = 500;

export function createApp(options = {}) {
  const store = options.store || new AnalyticsStore();
  const salt = options.salt || process.env.ANALYTICS_PSEUDONYM_SALT || 'development-only-change-me';
  const adminToken = options.adminToken ?? process.env.ANALYTICS_ADMIN_TOKEN;
  if (
    process.env.NODE_ENV === 'production' &&
    (!adminToken || salt === 'development-only-change-me' || salt === 'replace-in-production')
  ) {
    throw new Error('Production analytics secrets must be configured.');
  }
  const configuredOrigins =
    options.allowedOrigins || process.env.ANALYTICS_ALLOWED_ORIGINS || 'http://localhost:5173';
  const allowedOrigins = Array.isArray(configuredOrigins)
    ? configuredOrigins
    : configuredOrigins.split(',').map((origin) => origin.trim());
  const app = express();
  const startedAt = Date.now();

  app.disable('x-powered-by');
  app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'DELETE'] }));
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    store.recordRequest();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  const subject = (req) => {
    if (isSubjectId(req.header('x-analytics-subject'))) return req.header('x-analytics-subject');
    return deriveSubjectId(req.header('x-analytics-client'), salt);
  };
  const requireSubject = (req, res, next) => {
    req.subjectId = subject(req);
    if (!req.subjectId)
      return res.status(400).json({ error: 'A valid analytics client identifier is required.' });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (
      !constantTimeTokenMatch(req.header('authorization')?.replace(/^Bearer\s+/i, ''), adminToken)
    )
      return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  app.get('/health', (_req, res) =>
    res.json({
      status: 'ok',
      service: 'behavior-analytics',
      uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      ...store.operationalMetrics(),
    })
  );

  app.post('/api/v1/consent', requireSubject, (req, res) => {
    const consent = store.setConsent(req.subjectId, req.body || {});
    res.json({ consent, subjectId: req.subjectId });
  });

  app.post('/api/v1/events/batch', requireSubject, (req, res) => {
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length > MAX_BATCH_SIZE)
      return res
        .status(400)
        .json({ error: `events must be an array of at most ${MAX_BATCH_SIZE} items` });
    const result = store.ingest(req.subjectId, events);
    if (result.reason === 'consent_required') return res.status(403).json(result);
    res.status(202).json(result);
  });

  app.get('/api/v1/profile', requireSubject, (req, res) => {
    const profile = store.profile(req.subjectId);
    if (!profile) return res.status(404).json({ error: 'No consented analytics profile exists.' });
    res.json(profile);
  });

  app.get('/api/v1/data-export', requireSubject, (req, res) => {
    const data = store.exportSubject(req.subjectId);
    if (!data) return res.status(404).json({ error: 'No analytics data exists.' });
    res.json({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...data });
  });

  app.delete('/api/v1/data', requireSubject, (req, res) => {
    store.erase(req.subjectId);
    res.status(204).end();
  });

  app.post('/api/v1/experiments/assign', requireSubject, (req, res) => {
    const experiment = req.body;
    if (!experiment?.id || !Array.isArray(experiment.variants))
      return res.status(400).json({ error: 'A valid experiment is required.' });
    const assignment = store.assignment(req.subjectId, experiment, assignVariant);
    if (!assignment) return res.status(403).json({ error: 'Personalization consent is required.' });
    res.json({ assignment });
  });

  app.post('/api/v1/feedback/analyze', requireSubject, (req, res) => {
    if (!store.hasUsageConsent(req.subjectId))
      return res.status(403).json({ error: 'Usage analytics consent is required.' });
    if (typeof req.body?.text !== 'string' || req.body.text.length > 2_000)
      return res.status(400).json({ error: 'Feedback text must be at most 2,000 characters.' });
    res.json(analyzeFeedback(req.body.text));
  });

  app.get('/api/v1/aggregates', requireAdmin, (_req, res) => res.json(store.aggregate(1)));
  app.get('/api/v1/experiments/:id/results', requireAdmin, (req, res) =>
    res.json({ experimentId: req.params.id, variants: store.experiments(req.params.id) })
  );
  app.get('/metrics', requireAdmin, (_req, res) => res.json(store.operationalMetrics()));

  app.use((error, _req, res, _next) => {
    store.recordError();
    console.error('analytics request failed', error instanceof Error ? error.message : 'unknown');
    res.status(500).json({ error: 'Analytics request failed.' });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  return app;
}

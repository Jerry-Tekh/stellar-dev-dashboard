import {
  featureUsage,
  friction,
  segment,
  recommendations,
  experimentReport,
  predictChurn,
  workflowSequences,
} from './engine.js';
import { laplace, sanitizeEvent } from './privacy.js';

const DAY_MS = 86_400_000;

export class AnalyticsStore {
  constructor({ retentionDays = 30, maxEventsPerSubject = 2_000, maxSubjects = 100_000 } = {}) {
    this.retentionMs = retentionDays * DAY_MS;
    this.maxEventsPerSubject = maxEventsPerSubject;
    this.maxSubjects = maxSubjects;
    this.subjects = new Map();
    this.metrics = { accepted: 0, rejected: 0, duplicates: 0, requests: 0, errors: 0 };
  }

  recordRequest() {
    this.metrics.requests += 1;
  }
  recordError() {
    this.metrics.errors += 1;
  }

  hasUsageConsent(subjectId) {
    return Boolean(this.subjects.get(subjectId)?.consent.usage);
  }

  setConsent(subjectId, consent, now = Date.now()) {
    if (!consent?.usage) {
      this.subjects.delete(subjectId);
      return {
        status: 'denied',
        usage: false,
        personalization: false,
        updatedAt: new Date(now).toISOString(),
      };
    }
    const record = this.#getOrCreate(subjectId, now);
    record.consent = {
      status: 'granted',
      usage: true,
      personalization: Boolean(consent.personalization),
      updatedAt: new Date(now).toISOString(),
    };
    return { ...record.consent };
  }

  ingest(subjectId, input, now = Date.now()) {
    const record = this.subjects.get(subjectId);
    if (!record?.consent.usage)
      return { accepted: 0, rejected: input.length, duplicates: 0, reason: 'consent_required' };
    const existing = new Set(record.events.map((event) => event.id));
    let accepted = 0;
    let rejected = 0;
    let duplicates = 0;
    for (const value of input) {
      const event = sanitizeEvent(value, now);
      if (!event) {
        rejected += 1;
        continue;
      }
      if (existing.has(event.id)) {
        duplicates += 1;
        continue;
      }
      record.events.push(event);
      existing.add(event.id);
      accepted += 1;
    }
    const cutoff = now - this.retentionMs;
    record.events = record.events
      .filter((event) => Date.parse(event.occurredAt) >= cutoff)
      .slice(-this.maxEventsPerSubject);
    record.updatedAt = now;
    this.metrics.accepted += accepted;
    this.metrics.rejected += rejected;
    this.metrics.duplicates += duplicates;
    return { accepted, rejected, duplicates };
  }

  profile(subjectId, now = Date.now()) {
    const record = this.subjects.get(subjectId);
    if (!record?.consent.usage) return null;
    const userSegment = segment(record.events, now);
    return {
      segment: userSegment,
      topFeatures: featureUsage(record.events).slice(0, 8),
      frictionPoints: friction(record.events),
      recommendations: record.consent.personalization
        ? recommendations(record.events, userSegment)
        : [],
      churnPrediction: predictChurn(record.events, now),
      workflowSequences: workflowSequences(record.events),
      eventCount: record.events.length,
      sessionCount: new Set(record.events.map((event) => event.sessionId)).size,
      generatedAt: new Date(now).toISOString(),
    };
  }

  exportSubject(subjectId) {
    const record = this.subjects.get(subjectId);
    if (!record) return null;
    return {
      consent: { ...record.consent },
      events: record.events.map((event) => ({ ...event, properties: { ...event.properties } })),
      assignments: Object.fromEntries(record.assignments),
    };
  }

  erase(subjectId) {
    return this.subjects.delete(subjectId);
  }

  assignment(subjectId, experiment, assigner) {
    const record = this.subjects.get(subjectId);
    if (!record?.consent.personalization) return null;
    if (record.assignments.has(experiment.id)) return record.assignments.get(experiment.id);
    const variantId = assigner(experiment, subjectId);
    if (!variantId) return null;
    const assignment = {
      experimentId: experiment.id,
      variantId,
      assignedAt: new Date().toISOString(),
    };
    record.assignments.set(experiment.id, assignment);
    return assignment;
  }

  aggregate(epsilon = 1) {
    const allEvents = [...this.subjects.values()].flatMap((record) => record.events);
    const personas = {};
    for (const record of this.subjects.values()) {
      const persona = segment(record.events).persona;
      personas[persona] = (personas[persona] || 0) + 1;
    }
    return {
      epsilon,
      noiseApplied: true,
      subjects: laplace(this.subjects.size, epsilon),
      events: laplace(allEvents.length, epsilon),
      sessions: laplace(new Set(allEvents.map((event) => event.sessionId)).size, epsilon),
      personas: Object.fromEntries(
        Object.entries(personas).map(([key, value]) => [key, laplace(value, epsilon)])
      ),
    };
  }

  experiments(experimentId) {
    return experimentReport(
      [...this.subjects.values()].flatMap((record) => record.events),
      experimentId
    );
  }

  operationalMetrics() {
    const eventCount = [...this.subjects.values()].reduce(
      (sum, record) => sum + record.events.length,
      0
    );
    return {
      ...this.metrics,
      subjects: this.subjects.size,
      retainedEvents: eventCount,
      capacitySubjects: this.maxSubjects,
    };
  }

  prune(now = Date.now()) {
    const cutoff = now - this.retentionMs;
    for (const [subjectId, record] of this.subjects) {
      record.events = record.events.filter((event) => Date.parse(event.occurredAt) >= cutoff);
      if (!record.events.length && record.updatedAt < cutoff) this.subjects.delete(subjectId);
    }
  }

  #getOrCreate(subjectId, now) {
    let record = this.subjects.get(subjectId);
    if (record) return record;
    if (this.subjects.size >= this.maxSubjects) {
      const oldest = [...this.subjects.entries()].sort(
        (left, right) => left[1].updatedAt - right[1].updatedAt
      )[0];
      if (oldest) this.subjects.delete(oldest[0]);
    }
    record = {
      consent: { status: 'pending', usage: false, personalization: false, updatedAt: null },
      events: [],
      assignments: new Map(),
      updatedAt: now,
    };
    this.subjects.set(subjectId, record);
    return record;
  }
}

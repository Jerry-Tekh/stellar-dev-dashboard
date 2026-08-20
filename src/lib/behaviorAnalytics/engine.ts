import type {
  BehaviorEvent,
  BehaviorSummary,
  EngagementLevel,
  ExperimentAssignment,
  ExperimentDefinition,
  ExperimentResult,
  ExperienceLevel,
  FeatureUsage,
  FrictionPoint,
  PersonalizationRecommendation,
  UserPersona,
  UserSegment,
} from '../../types/behaviorAnalytics';

const PERSONA_FEATURES: Record<UserPersona, string[]> = {
  developer: [
    'builder',
    'contracts',
    'contractInteraction',
    'contractABI',
    'faucet',
    'multisig',
    'signer',
  ],
  trader: ['dex', 'pathExplorer', 'portfolio', 'assets', 'transactions'],
  validator: ['network', 'realtime', 'liveActivity', 'systemHealth', 'performance'],
  researcher: ['analytics', 'charts', 'search', 'dataExport', 'compare'],
  explorer: ['overview', 'account', 'explorers', 'claimableBalances', 'anchors'],
};

const ADVANCED_FEATURES = new Set([
  'builder',
  'contractInteraction',
  'contractABI',
  'multisig',
  'signer',
  'pathExplorer',
  'dataExport',
]);

function featureName(event: BehaviorEvent): string | null {
  if (event.type === 'navigation')
    return String(event.properties.tab || event.name.replace(/^view:/, ''));
  if (event.type === 'feature_use') return String(event.properties.feature || event.name);
  return null;
}

export function calculateFeatureUsage(events: BehaviorEvent[]): FeatureUsage[] {
  const counts = new Map<string, { count: number; lastUsedAt: string }>();
  for (const event of events) {
    const feature = featureName(event);
    if (!feature) continue;
    const current = counts.get(feature);
    counts.set(feature, {
      count: (current?.count || 0) + 1,
      lastUsedAt:
        !current || event.occurredAt > current.lastUsedAt ? event.occurredAt : current.lastUsedAt,
    });
  }

  const total = [...counts.values()].reduce((sum, item) => sum + item.count, 0);
  return [...counts.entries()]
    .map(([feature, value]) => ({
      feature,
      count: value.count,
      percentage: total ? Math.round((value.count / total) * 100) : 0,
      lastUsedAt: value.lastUsedAt,
    }))
    .sort((a, b) => b.count - a.count || a.feature.localeCompare(b.feature));
}

export function detectFrictionPoints(events: BehaviorEvent[]): FrictionPoint[] {
  const workflows = new Map<string, { attempts: number; failures: number; abandoned: number }>();
  for (const event of events) {
    if (event.type !== 'transaction_workflow') continue;
    const workflow = String(event.properties.workflow || event.name);
    const current = workflows.get(workflow) || { attempts: 0, failures: 0, abandoned: 0 };
    current.attempts += 1;
    if (event.properties.outcome === 'failure') current.failures += 1;
    if (event.properties.outcome === 'abandoned') current.abandoned += 1;
    workflows.set(workflow, current);
  }

  return [...workflows.entries()]
    .filter(([, value]) => value.attempts >= 2 && value.failures + value.abandoned > 0)
    .map(([workflow, value]) => {
      const abandonmentRate = (value.failures + value.abandoned) / value.attempts;
      return {
        workflow,
        attempts: value.attempts,
        failures: value.failures,
        abandonmentRate,
        severity: (abandonmentRate >= 0.6
          ? 'high'
          : abandonmentRate >= 0.3
            ? 'medium'
            : 'low') as FrictionPoint['severity'],
      };
    })
    .sort((a, b) => b.abandonmentRate - a.abandonmentRate);
}

function calculateExperience(events: BehaviorEvent[], usage: FeatureUsage[]): ExperienceLevel {
  const advancedFeatures = usage.filter((item) => ADVANCED_FEATURES.has(item.feature)).length;
  const successfulWorkflows = events.filter(
    (event) => event.type === 'transaction_workflow' && event.properties.outcome === 'success'
  ).length;
  const score =
    advancedFeatures * 2 +
    Math.min(successfulWorkflows, 5) +
    Math.min(Math.floor(events.length / 15), 5);
  if (score >= 9) return 'advanced';
  if (score >= 3) return 'intermediate';
  return 'new';
}

function calculateEngagement(events: BehaviorEvent[], now: number): EngagementLevel {
  if (!events.length) return 'casual';
  const activeDays = new Set(events.map((event) => event.occurredAt.slice(0, 10))).size;
  const lastEventTime = Math.max(...events.map((event) => Date.parse(event.occurredAt)));
  const daysSinceActive = (now - lastEventTime) / (24 * 60 * 60 * 1_000);
  if (events.length >= 8 && daysSinceActive >= 14) return 'at-risk';
  if (events.length >= 40 || activeDays >= 10) return 'power';
  if (events.length >= 10 || activeDays >= 3) return 'regular';
  return 'casual';
}

export function identifySegment(events: BehaviorEvent[], now = Date.now()): UserSegment {
  const usage = calculateFeatureUsage(events);
  const personaScores = (Object.keys(PERSONA_FEATURES) as UserPersona[]).map((persona) => ({
    persona,
    score: usage.reduce(
      (sum, item) => sum + (PERSONA_FEATURES[persona].includes(item.feature) ? item.count : 0),
      0
    ),
  }));
  personaScores.sort((a, b) => b.score - a.score);
  const winner = personaScores[0] || { persona: 'explorer' as UserPersona, score: 0 };
  const totalScore = personaScores.reduce((sum, item) => sum + item.score, 0);
  const persona = winner.score ? winner.persona : 'explorer';
  const confidence = totalScore ? Math.min(0.95, 0.5 + (winner.score / totalScore) * 0.45) : 0.5;
  const experience = calculateExperience(events, usage);
  const engagement = calculateEngagement(events, now);

  return {
    persona,
    experience,
    engagement,
    confidence,
    signals: [
      usage[0] ? `Most used: ${usage[0].feature}` : 'No dominant feature yet',
      `${new Set(events.map((event) => event.sessionId)).size} observed sessions`,
      `${events.length} consented events`,
    ],
    updatedAt: new Date(now).toISOString(),
  };
}

export function summarizeBehavior(events: BehaviorEvent[], now = Date.now()): BehaviorSummary {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return {
    eventCount: events.length,
    sessionCount: new Set(events.map((event) => event.sessionId)).size,
    activeDays: new Set(events.map((event) => event.occurredAt.slice(0, 10))).size,
    topFeatures: calculateFeatureUsage(events).slice(0, 8),
    frictionPoints: detectFrictionPoints(events),
    segment: identifySegment(events, now),
    firstEventAt: sorted[0]?.occurredAt || null,
    lastEventAt: sorted.length ? sorted[sorted.length - 1]!.occurredAt : null,
  };
}

export function buildRecommendations(summary: BehaviorSummary): PersonalizationRecommendation[] {
  const recommendations: PersonalizationRecommendation[] = [];
  const used = new Set(summary.topFeatures.map((item) => item.feature));
  const persona = summary.segment.persona;

  const personaRecommendation: Record<UserPersona, PersonalizationRecommendation> = {
    developer: {
      id: 'try-contract-builder',
      kind: 'feature',
      title: 'Build a Soroban contract call',
      reason: 'Contract tools match your developer workflow.',
      actionTab: 'builder',
      priority: 90,
    },
    trader: {
      id: 'try-path-explorer',
      kind: 'workflow',
      title: 'Compare payment paths',
      reason: 'Path discovery can streamline your asset workflows.',
      actionTab: 'pathExplorer',
      priority: 90,
    },
    validator: {
      id: 'try-live-ledgers',
      kind: 'feature',
      title: 'Monitor live ledger health',
      reason: 'Real-time network signals match your validator activity.',
      actionTab: 'realtime',
      priority: 90,
    },
    researcher: {
      id: 'try-export',
      kind: 'feature',
      title: 'Export a reusable dataset',
      reason: 'Export tools complement your analytics activity.',
      actionTab: 'dataExport',
      priority: 90,
    },
    explorer: {
      id: 'start-learning',
      kind: 'learning',
      title: 'Take the dashboard tour',
      reason: 'A short tour helps reveal the most useful Stellar tools.',
      actionTab: 'overview',
      priority: 90,
    },
  };
  const primary = personaRecommendation[persona];
  if (!used.has(primary.actionTab)) recommendations.push(primary);

  if (summary.segment.experience === 'new') {
    recommendations.push({
      id: 'learn-transactions',
      kind: 'learning',
      title: 'Learn transaction fundamentals',
      reason: 'Your dashboard activity suggests a guided introduction.',
      actionTab: 'transactions',
      priority: 80,
    });
  }
  if (summary.frictionPoints.length) {
    const friction = summary.frictionPoints[0];
    recommendations.push({
      id: `resolve-${friction.workflow}`,
      kind: 'workflow',
      title: `Review ${friction.workflow} workflow`,
      reason: `${Math.round(friction.abandonmentRate * 100)}% of observed attempts did not complete.`,
      actionTab: 'builder',
      priority: 100,
    });
  }
  if (summary.segment.engagement === 'at-risk') {
    recommendations.push({
      id: 'return-overview',
      kind: 'retention',
      title: 'See what changed on Stellar',
      reason: 'You have been away after previously active usage.',
      actionTab: 'overview',
      priority: 95,
    });
  }
  if (!used.has('multisig') && summary.segment.experience === 'advanced') {
    recommendations.push({
      id: 'discover-multisig',
      kind: 'feature',
      title: 'Try multi-signature coordination',
      reason: 'Advanced users often benefit from signer coordination.',
      actionTab: 'multisig',
      priority: 70,
    });
  }

  return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

function stableFraction(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

export function assignExperiment(
  experiment: ExperimentDefinition,
  pseudonymousId: string,
  existing: ExperimentAssignment[],
  now = Date.now()
): ExperimentAssignment | null {
  if (!experiment.active || !experiment.variants.length) return null;
  const previous = existing.find((assignment) => assignment.experimentId === experiment.id);
  if (previous && experiment.variants.some((variant) => variant.id === previous.variantId))
    return previous;
  const totalWeight = experiment.variants.reduce(
    (sum, variant) => sum + Math.max(0, variant.weight),
    0
  );
  if (!totalWeight) return null;
  let target = stableFraction(`${experiment.id}:${pseudonymousId}`) * totalWeight;
  for (const variant of experiment.variants) {
    target -= Math.max(0, variant.weight);
    if (target <= 0) {
      return {
        experimentId: experiment.id,
        variantId: variant.id,
        assignedAt: new Date(now).toISOString(),
      };
    }
  }
  const fallback = experiment.variants[experiment.variants.length - 1];
  return fallback
    ? {
        experimentId: experiment.id,
        variantId: fallback.id,
        assignedAt: new Date(now).toISOString(),
      }
    : null;
}

export function calculateExperimentResults(
  events: BehaviorEvent[],
  assignments: ExperimentAssignment[]
): ExperimentResult[] {
  return assignments.map((assignment) => {
    const matching = events.filter((event) => event.properties.variant === assignment.variantId);
    const exposures = matching.filter((event) =>
      event.name.startsWith('experiment_exposure:')
    ).length;
    const conversions = matching.filter((event) =>
      event.name.startsWith('experiment_conversion:')
    ).length;
    return {
      experimentId: assignment.experimentId,
      variantId: assignment.variantId,
      exposures,
      conversions,
      conversionRate: exposures ? conversions / exposures : 0,
    };
  });
}

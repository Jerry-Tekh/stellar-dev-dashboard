const PERSONA_FEATURES = {
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

const ADVANCED = new Set([
  'builder',
  'contractInteraction',
  'contractABI',
  'multisig',
  'signer',
  'pathExplorer',
  'dataExport',
]);
const POSITIVE = new Set([
  'helpful',
  'fast',
  'easy',
  'clear',
  'great',
  'good',
  'love',
  'useful',
  'success',
]);
const NEGATIVE = new Set([
  'slow',
  'hard',
  'confusing',
  'broken',
  'bad',
  'fail',
  'error',
  'stuck',
  'difficult',
]);
const PERSONAS = Object.keys(PERSONA_FEATURES);

function featureOf(event) {
  if (event.type === 'navigation')
    return String(event.properties.tab || event.name.replace(/^view:/, ''));
  if (event.type === 'feature_use') return String(event.properties.feature || event.name);
  return null;
}

export function featureUsage(events) {
  const values = new Map();
  for (const event of events) {
    const feature = featureOf(event);
    if (!feature) continue;
    const item = values.get(feature) || { feature, count: 0, lastUsedAt: event.occurredAt };
    item.count += 1;
    if (event.occurredAt > item.lastUsedAt) item.lastUsedAt = event.occurredAt;
    values.set(feature, item);
  }
  const total = [...values.values()].reduce((sum, item) => sum + item.count, 0);
  return [...values.values()]
    .map((item) => ({ ...item, percentage: total ? Math.round((item.count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.feature.localeCompare(b.feature));
}

/** Nearest-centroid clustering over normalized persona feature vectors. */
export function clusterPersona(events) {
  const usage = featureUsage(events);
  const total = usage.reduce((sum, item) => sum + item.count, 0) || 1;
  const vector = PERSONAS.map(
    (persona) =>
      usage.reduce(
        (sum, item) => sum + (PERSONA_FEATURES[persona].includes(item.feature) ? item.count : 0),
        0
      ) / total
  );
  let winner = { persona: 'explorer', distance: Number.POSITIVE_INFINITY };
  PERSONAS.forEach((persona, centroidIndex) => {
    const distance = Math.sqrt(
      vector.reduce((sum, value, index) => {
        const centroid = index === centroidIndex ? 1 : 0;
        return sum + (value - centroid) ** 2;
      }, 0)
    );
    if (distance < winner.distance) winner = { persona, distance };
  });
  return {
    persona: winner.persona,
    confidence: Math.max(0.5, Math.min(0.95, 1 - winner.distance / Math.sqrt(2))),
    vector,
  };
}

export function segment(events, now = Date.now()) {
  const usage = featureUsage(events);
  const cluster = clusterPersona(events);
  const successful = events.filter(
    (event) => event.type === 'transaction_workflow' && event.properties.outcome === 'success'
  ).length;
  const experienceScore =
    usage.filter((item) => ADVANCED.has(item.feature)).length * 2 +
    Math.min(successful, 5) +
    Math.min(Math.floor(events.length / 15), 5);
  const activeDays = new Set(events.map((event) => event.occurredAt.slice(0, 10))).size;
  const latest = events.length
    ? Math.max(...events.map((event) => Date.parse(event.occurredAt)))
    : now;
  const staleDays = (now - latest) / 86_400_000;
  const engagement =
    events.length >= 8 && staleDays >= 14
      ? 'at-risk'
      : events.length >= 40 || activeDays >= 10
        ? 'power'
        : events.length >= 10 || activeDays >= 3
          ? 'regular'
          : 'casual';
  return {
    persona: usage.length ? cluster.persona : 'explorer',
    experience: experienceScore >= 9 ? 'advanced' : experienceScore >= 3 ? 'intermediate' : 'new',
    engagement,
    confidence: usage.length ? cluster.confidence : 0.5,
    signals: [
      usage[0] ? `Most used: ${usage[0].feature}` : 'No dominant feature yet',
      `${activeDays} active days`,
      `${events.length} events`,
    ],
    updatedAt: new Date(now).toISOString(),
  };
}

export function predictChurn(events, now = Date.now()) {
  if (!events.length)
    return { probability: 0.5, risk: 'unknown', factors: ['insufficient_history'] };
  const activeDays = new Set(events.map((event) => event.occurredAt.slice(0, 10))).size;
  const latest = Math.max(...events.map((event) => Date.parse(event.occurredAt)));
  const daysSinceActive = Math.max(0, (now - latest) / 86_400_000);
  const failed = events.filter(
    (event) => event.properties.outcome === 'failure' || event.properties.outcome === 'abandoned'
  ).length;
  const failureRate = failed / Math.max(1, events.length);
  const raw = -2.4 + daysSinceActive * 0.14 + failureRate * 2.2 - Math.min(activeDays, 10) * 0.12;
  const probability = 1 / (1 + Math.exp(-raw));
  const factors = [];
  if (daysSinceActive >= 14) factors.push('inactive_14_days');
  if (failureRate >= 0.3) factors.push('workflow_friction');
  if (activeDays <= 2) factors.push('low_frequency');
  return {
    probability,
    risk: probability >= 0.7 ? 'high' : probability >= 0.4 ? 'medium' : 'low',
    factors,
  };
}

/** First-order sequence model used to surface the most common next workflow step. */
export function workflowSequences(events) {
  const sessions = new Map();
  for (const event of [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
    const feature = featureOf(event);
    if (!feature) continue;
    const sequence = sessions.get(event.sessionId) || [];
    sequence.push(feature);
    sessions.set(event.sessionId, sequence);
  }
  const transitions = new Map();
  for (const sequence of sessions.values()) {
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const key = `${sequence[index]}→${sequence[index + 1]}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
  }
  return [...transitions.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function friction(events) {
  const grouped = new Map();
  for (const event of events) {
    if (event.type !== 'transaction_workflow') continue;
    const workflow = String(event.properties.workflow || event.name);
    const item = grouped.get(workflow) || { workflow, attempts: 0, failures: 0, abandoned: 0 };
    item.attempts += 1;
    if (event.properties.outcome === 'failure') item.failures += 1;
    if (event.properties.outcome === 'abandoned') item.abandoned += 1;
    grouped.set(workflow, item);
  }
  return [...grouped.values()]
    .filter((item) => item.attempts >= 2 && item.failures + item.abandoned > 0)
    .map((item) => {
      const abandonmentRate = (item.failures + item.abandoned) / item.attempts;
      return {
        workflow: item.workflow,
        attempts: item.attempts,
        failures: item.failures,
        abandonmentRate,
        severity: abandonmentRate >= 0.6 ? 'high' : abandonmentRate >= 0.3 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.abandonmentRate - a.abandonmentRate);
}

export function recommendations(events, profile = segment(events)) {
  const used = new Set(featureUsage(events).map((item) => item.feature));
  const primary = {
    developer: ['builder', 'Build a Soroban contract call'],
    trader: ['pathExplorer', 'Compare payment paths'],
    validator: ['realtime', 'Monitor live ledger health'],
    researcher: ['dataExport', 'Export a reusable dataset'],
    explorer: ['overview', 'Take the dashboard tour'],
  }[profile.persona];
  const output = [];
  if (!used.has(primary[0]))
    output.push({
      id: `discover-${primary[0]}`,
      kind: 'feature',
      title: primary[1],
      reason: `Recommended for ${profile.persona} workflows.`,
      actionTab: primary[0],
      priority: 90,
    });
  const problem = friction(events)[0];
  if (problem)
    output.push({
      id: `resolve-${problem.workflow}`,
      kind: 'workflow',
      title: `Review ${problem.workflow} workflow`,
      reason: `${Math.round(problem.abandonmentRate * 100)}% of attempts did not complete.`,
      actionTab: 'builder',
      priority: 100,
    });
  if (profile.experience === 'new')
    output.push({
      id: 'learn-transactions',
      kind: 'learning',
      title: 'Learn transaction fundamentals',
      reason: 'A guided introduction matches your current experience.',
      actionTab: 'transactions',
      priority: 80,
    });
  if (profile.engagement === 'at-risk')
    output.push({
      id: 'retention-overview',
      kind: 'retention',
      title: 'See what changed on Stellar',
      reason: 'New dashboard activity is available since your last session.',
      actionTab: 'overview',
      priority: 95,
    });
  return output.sort((a, b) => b.priority - a.priority).slice(0, 4);
}

export function analyzeFeedback(text) {
  const tokens =
    String(text || '')
      .toLowerCase()
      .match(/[a-z]+/g) || [];
  let score = 0;
  for (const token of tokens) {
    if (POSITIVE.has(token)) score += 1;
    if (NEGATIVE.has(token)) score -= 1;
  }
  const topics = [
    'transaction',
    'wallet',
    'contract',
    'network',
    'performance',
    'documentation',
  ].filter((topic) => tokens.includes(topic));
  return { sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral', score, topics };
}

function hashFraction(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

export function assignVariant(experiment, subjectId) {
  if (!experiment?.active || !Array.isArray(experiment.variants)) return null;
  const variants = experiment.variants.filter(
    (item) => item && typeof item.id === 'string' && item.weight > 0
  );
  const total = variants.reduce((sum, item) => sum + item.weight, 0);
  let target = hashFraction(`${experiment.id}:${subjectId}`) * total;
  for (const variant of variants) {
    target -= variant.weight;
    if (target <= 0) return variant.id;
  }
  return variants.at(-1)?.id || null;
}

export function experimentReport(events, experimentId) {
  const variants = new Map();
  for (const event of events) {
    if (event.properties.feature !== experimentId) continue;
    const id = String(event.properties.variant || 'unknown');
    const item = variants.get(id) || { variantId: id, exposures: 0, conversions: 0 };
    if (event.name.startsWith('experiment_exposure:')) item.exposures += 1;
    if (event.name.startsWith('experiment_conversion:')) item.conversions += 1;
    variants.set(id, item);
  }
  const results = [...variants.values()].map((item) => ({
    ...item,
    conversionRate: item.exposures ? item.conversions / item.exposures : 0,
  }));
  const control = results.find((item) => item.variantId === 'control')?.conversionRate || 0;
  return results.map((item) => ({
    ...item,
    liftVsControl: control ? (item.conversionRate - control) / control : 0,
  }));
}

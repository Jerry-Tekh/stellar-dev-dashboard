import type {
  KnowledgeGraphSnapshot,
  LearningPath,
  LearningPathStep,
  ProcessedDocument,
  SkillLevel,
} from '../../types/documentAnalysis';
import { splitSentences } from './extraction';
import { nodeIdFor } from './knowledgeGraph';

const PATH_SEEDS: Record<SkillLevel, { title: string; description: string; concepts: string[] }> = {
  beginner: {
    title: 'Stellar fundamentals',
    description: 'Core primitives every Stellar developer starts with.',
    concepts: ['account', 'payment operation', 'trustline', 'xlm', 'testnet'],
  },
  intermediate: {
    title: 'Applied Stellar development',
    description: 'Build real integrations with contracts, swaps, and advanced operations.',
    concepts: [
      'soroban',
      'smart contract',
      'claimable balance',
      'path payment',
      'liquidity pool',
      'multisig',
    ],
  },
  advanced: {
    title: 'Protocol internals and operations',
    description: 'Deep protocol mechanics for operators and power users.',
    concepts: [
      'stellar consensus protocol',
      'quorum',
      'footprint',
      'budget metering',
      'clawback',
      'federation',
    ],
  },
};

const LEVEL_ORDER: SkillLevel[] = ['beginner', 'intermediate', 'advanced'];

function orderConcepts(
  conceptLabels: string[],
  snapshot: KnowledgeGraphSnapshot
): string[] {
  const ids = new Set(conceptLabels.map((label) => nodeIdFor(label)));
  const dependencyEdges = snapshot.edges.filter(
    (edge) => edge.type === 'depends-on' && ids.has(edge.fromId) && ids.has(edge.toId)
  );
  const mentions = new Map(snapshot.nodes.map((node) => [node.id, node.mentions]));
  const inDegree = new Map([...ids].map((id) => [id, 0]));
  for (const edge of dependencyEdges) {
    inDegree.set(edge.toId, (inDegree.get(edge.toId) ?? 0) + 1);
  }
  const ready = [...ids]
    .filter((id) => (inDegree.get(id) ?? 0) === 0)
    .sort((a, b) => (mentions.get(b) ?? 0) - (mentions.get(a) ?? 0) || a.localeCompare(b));
  const ordered: string[] = [];
  const remainingDeps = new Map<string, string[]>();
  for (const edge of dependencyEdges) {
    const list = remainingDeps.get(edge.toId) ?? [];
    list.push(edge.fromId);
    remainingDeps.set(edge.toId, list);
  }
  const queue = [...ready];
  while (queue.length) {
    const id = queue.shift() as string;
    if (!ids.has(id) || ordered.includes(id)) continue;
    ordered.push(id);
    for (const edge of dependencyEdges.filter((item) => item.fromId === id)) {
      const deps = (remainingDeps.get(edge.toId) ?? []).filter((dep) => dep !== id);
      remainingDeps.set(edge.toId, deps);
      if (!deps.length && !ordered.includes(edge.toId)) queue.push(edge.toId);
    }
  }
  for (const id of [...ids].sort()) if (!ordered.includes(id)) ordered.push(id);
  return ordered;
}

function findBestSection(
  conceptLabel: string,
  documents: ProcessedDocument[]
): { document: ProcessedDocument; sentence: string; sectionId?: string; heading?: string } | null {
  const lower = conceptLabel.toLowerCase();
  let best: { document: ProcessedDocument; sentence: string; sectionId?: string; heading?: string; hits: number } | null =
    null;
  for (const document of documents) {
    for (const section of document.sections) {
      const haystack = `${section.heading}\n${section.text}`.toLowerCase();
      const hits = haystack.split(lower).length - 1;
      if (!hits) continue;
      if (best && hits <= best.hits) continue;
      const sentence =
        splitSentences(section.text).find((candidate) =>
          candidate.toLowerCase().includes(lower)
        ) ?? section.text.slice(0, 200);
      best = {
        document,
        sentence: sentence.length > 240 ? `${sentence.slice(0, 237)}…` : sentence,
        sectionId: section.id,
        heading: section.heading,
        hits,
      };
    }
  }
  return best;
}

export function generateLearningPaths(
  snapshot: KnowledgeGraphSnapshot,
  documents: ProcessedDocument[]
): LearningPath[] {
  const nodeByLowerLabel = new Map(
    snapshot.nodes.map((node) => [node.label.toLowerCase(), node])
  );
  return LEVEL_ORDER.map((level) => {
    const seed = PATH_SEEDS[level];
    const available = seed.concepts.filter((concept) => nodeByLowerLabel.has(concept));
    const orderedIds = orderConcepts(available, snapshot);
    const labelById = new Map(
      snapshot.nodes.map((node) => [node.id, node.label] as const)
    );
    const steps: LearningPathStep[] = [];
    for (const id of orderedIds) {
      const label = labelById.get(id);
      if (!label) continue;
      const match = findBestSection(label, documents);
      if (!match) continue;
      steps.push({
        title: `Learn about ${label}`,
        description: match.sentence,
        documentId: match.document.id,
        documentTitle: match.document.title,
        sectionId: match.sectionId,
        heading: match.heading,
        concepts: [label],
      });
    }
    return {
      id: `path-${level}`,
      level,
      title: seed.title,
      description: seed.description,
      steps,
    };
  });
}

import type {
  ConceptTrend,
  ExpertProfile,
  ExtractedEntity,
  KnowledgeEdge,
  KnowledgeGap,
  KnowledgeGraphSnapshot,
  KnowledgeNode,
  ProcessedDocument,
  TopicCluster,
  TrendPoint,
} from '../../types/documentAnalysis';
import { extractRelations, slugify } from './extraction';

export interface MutableGraph {
  nodes: Map<string, KnowledgeNode>;
  edges: Map<string, KnowledgeEdge>;
}

export function createGraph(): MutableGraph {
  return { nodes: new Map(), edges: new Map() };
}

export const nodeIdFor = (label: string): string => slugify(label);

export function addEntityToGraph(
  graph: MutableGraph,
  entity: ExtractedEntity,
  documentId: string,
  observedAt: string
): string {
  const id = nodeIdFor(entity.text);
  const existing = graph.nodes.get(id);
  if (existing) {
    existing.mentions += entity.mentions;
    existing.confidence = Math.max(existing.confidence, entity.confidence);
    if (!existing.sourceDocIds.includes(documentId)) existing.sourceDocIds.push(documentId);
    existing.lastSeenAt = observedAt > existing.lastSeenAt ? observedAt : existing.lastSeenAt;
    if (observedAt < existing.firstSeenAt) existing.firstSeenAt = observedAt;
    return id;
  }
  graph.nodes.set(id, {
    id,
    label: entity.text,
    type: entity.type,
    mentions: entity.mentions,
    confidence: entity.confidence,
    sourceDocIds: [documentId],
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
  });
  return id;
}

export function upsertEdge(
  graph: MutableGraph,
  fromId: string,
  toId: string,
  type: KnowledgeEdge['type'],
  documentId: string,
  observedAt: string
): void {
  if (fromId === toId) return;
  const id = `${type}:${fromId}:${toId}`;
  const existing = graph.edges.get(id);
  if (existing) {
    existing.weight += 1;
    if (!existing.sourceDocIds.includes(documentId)) existing.sourceDocIds.push(documentId);
    if (observedAt > existing.observedAt) existing.observedAt = observedAt;
    return;
  }
  graph.edges.set(id, {
    id,
    fromId,
    toId,
    type,
    weight: 1,
    observedAt,
    sourceDocIds: [documentId],
  });
}

export function addDocumentToGraph(
  graph: MutableGraph,
  document: ProcessedDocument,
  observedAt: string = document.ingestedAt
): void {
  const idByLowerLabel = new Map<string, string>();
  for (const entity of document.entities) {
    const nodeId = addEntityToGraph(graph, entity, document.id, observedAt);
    idByLowerLabel.set(entity.text.toLowerCase(), nodeId);
  }
  const resolve = (label: string): string | null =>
    idByLowerLabel.get(label.toLowerCase()) ?? (graph.nodes.has(nodeIdFor(label)) ? nodeIdFor(label) : null);
  for (const relation of extractRelations(document.sections)) {
    const fromId = resolve(relation.fromLabel);
    const toId = resolve(relation.toLabel);
    if (!fromId || !toId) continue;
    upsertEdge(graph, fromId, toId, relation.type, document.id, observedAt);
  }
}

export function finalizeGraph(
  graph: MutableGraph,
  documents: ProcessedDocument[],
  generatedAt: string = new Date().toISOString()
): KnowledgeGraphSnapshot {
  const nodes = [...graph.nodes.values()].sort(
    (a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label)
  );
  const edges = [...graph.edges.values()].sort(
    (a, b) => b.weight - a.weight || a.id.localeCompare(b.id)
  );
  return {
    generatedAt,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      documentCount: documents.length,
      conceptCount: nodes.filter((node) => node.type === 'concept').length,
      generatedAt,
    },
    nodes,
    edges,
    clusters: clusterTopics(nodes, edges),
  };
}

export function buildAdjacency(snapshot: KnowledgeGraphSnapshot): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)?.add(b);
  };
  for (const node of snapshot.nodes) adjacency.set(node.id, new Set());
  for (const edge of snapshot.edges) {
    link(edge.fromId, edge.toId);
    link(edge.toId, edge.fromId);
  }
  return adjacency;
}

export function expandConcepts(
  snapshot: KnowledgeGraphSnapshot,
  seedIds: string[],
  hops = 1
): string[] {
  const adjacency = buildAdjacency(snapshot);
  const visited = new Set<string>();
  let frontier = seedIds.filter((id) => adjacency.has(id));
  frontier.forEach((id) => visited.add(id));
  for (let hop = 0; hop < hops; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return [...visited].sort();
}

export function clusterTopics(nodes: KnowledgeNode[], edges: KnowledgeEdge[]): TopicCluster[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current) ?? current;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const node of nodes) parent.set(node.id, node.id);
  for (const edge of edges) union(edge.fromId, edge.toId);

  const components = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const bucket = components.get(root) ?? [];
    bucket.push(node.id);
    components.set(root, bucket);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const clusters: TopicCluster[] = [];
  for (const memberIds of components.values()) {
    if (memberIds.length < 2) continue;
    const members = memberIds.map((id) => byId.get(id)).filter((n): n is KnowledgeNode => Boolean(n));
    const memberSet = new Set(memberIds);
    let internalWeight = 0;
    for (const edge of edges) {
      if (memberSet.has(edge.fromId) && memberSet.has(edge.toId)) internalWeight += edge.weight;
    }
    const possiblePairs = (members.length * (members.length - 1)) / 2;
    const labelNode = [...members].sort(
      (a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label)
    )[0];
    const termCounts = new Map<string, number>();
    for (const member of members) {
      for (const term of member.label.toLowerCase().split(/\s+/)) {
        if (term.length < 3) continue;
        termCounts.set(term, (termCounts.get(term) ?? 0) + 1);
      }
    }
    const topTerms = [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([term]) => term);
    clusters.push({
      id: `cluster-${slugify(labelNode.label)}`,
      label: labelNode.label,
      nodeIds: memberIds.sort(),
      documentCount: new Set(members.flatMap((member) => member.sourceDocIds)).size,
      topTerms,
      cohesion: possiblePairs ? Math.round((internalWeight / possiblePairs) * 100) / 100 : 0,
    });
  }
  return clusters
    .sort((a, b) => b.nodeIds.length - a.nodeIds.length || a.label.localeCompare(b.label))
    .slice(0, 12);
}

export function computeTrends(documents: ProcessedDocument[], maxConcepts = 8): ConceptTrend[] {
  const perConceptPeriods = new Map<string, Map<string, TrendPoint>>();
  const conceptTotals = new Map<string, number>();
  for (const document of documents) {
    const period = (document.publishedAt ?? document.ingestedAt).slice(0, 10);
    for (const concept of document.concepts) {
      const lower = concept.toLowerCase();
      conceptTotals.set(lower, (conceptTotals.get(lower) ?? 0) + 1);
      const periods = perConceptPeriods.get(lower) ?? new Map<string, TrendPoint>();
      const point = periods.get(period) ?? { period, mentions: 0, documents: 0 };
      point.documents += 1;
      periods.set(period, point);
      perConceptPeriods.set(lower, periods);
    }
  }
  const topConcepts = [...conceptTotals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxConcepts);
  const trends: ConceptTrend[] = [];
  for (const [concept] of topConcepts) {
    const periods = perConceptPeriods.get(concept) ?? new Map();
    const points = [...periods.values()].sort((a, b) => a.period.localeCompare(b.period));
    const half = Math.floor(points.length / 2);
    const firstHalf = points.slice(0, half).reduce((sum, p) => sum + p.documents, 0);
    const secondHalf = points.slice(half).reduce((sum, p) => sum + p.documents, 0);
    const changePct =
      firstHalf === 0
        ? secondHalf > 0
          ? 100
          : 0
        : Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
    trends.push({
      concept,
      points,
      direction: changePct > 10 ? 'rising' : changePct < -10 ? 'falling' : 'stable',
      changePct,
    });
  }
  return trends.sort(
    (a, b) =>
      b.points.reduce((s, p) => s + p.documents, 0) - a.points.reduce((s, p) => s + p.documents, 0)
  );
}

export function detectKnowledgeGaps(
  snapshot: KnowledgeGraphSnapshot,
  documents: ProcessedDocument[],
  maxGaps = 12
): KnowledgeGap[] {
  const connected = new Set<string>();
  for (const edge of snapshot.edges) {
    connected.add(edge.fromId);
    connected.add(edge.toId);
  }
  const gaps: KnowledgeGap[] = [];
  for (const node of snapshot.nodes) {
    if (!['concept', 'component', 'operation', 'endpoint'].includes(node.type)) continue;
    if (!connected.has(node.id)) {
      gaps.push({
        concept: node.label,
        reason: 'orphan-concept',
        mentionCount: node.mentions,
        suggestion: `Add documentation linking "${node.label}" to related concepts.`,
      });
    } else if (node.mentions < 3) {
      gaps.push({
        concept: node.label,
        reason: 'thin-coverage',
        mentionCount: node.mentions,
        suggestion: `Expand coverage of "${node.label}" with additional sources.`,
      });
    } else if (node.sourceDocIds.length === 1 && documents.length > 1) {
      gaps.push({
        concept: node.label,
        reason: 'single-source',
        mentionCount: node.mentions,
        suggestion: `Cross-reference "${node.label}" against independent documentation.`,
      });
    }
  }
  return gaps
    .sort(
      (a, b) =>
        a.reason.localeCompare(b.reason) ||
        a.concept.localeCompare(b.concept)
    )
    .slice(0, maxGaps);
}

export function computeExperts(documents: ProcessedDocument[], maxExperts = 5): ExpertProfile[] {
  const byAuthor = new Map<string, ProcessedDocument[]>();
  for (const document of documents) {
    if (!document.author) continue;
    if (document.source !== 'forum' && document.source !== 'community') continue;
    const bucket = byAuthor.get(document.author) ?? [];
    bucket.push(document);
    byAuthor.set(document.author, bucket);
  }
  const experts: ExpertProfile[] = [];
  for (const [author, docs] of byAuthor) {
    const conceptCounts = new Map<string, number>();
    for (const doc of docs) {
      for (const concept of doc.concepts) {
        const key = concept.toLowerCase();
        conceptCounts.set(key, (conceptCounts.get(key) ?? 0) + 1);
      }
    }
    const concepts = [...conceptCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([concept, mentions]) => ({ concept, mentions }));
    const totalMentions = concepts.reduce((sum, item) => sum + item.mentions, 0);
    experts.push({
      author,
      contributions: docs.length,
      score: Math.round(docs.length * Math.sqrt(totalMentions) * 10) / 10,
      concepts,
    });
  }
  return experts.sort((a, b) => b.score - a.score || a.author.localeCompare(b.author)).slice(0, maxExperts);
}

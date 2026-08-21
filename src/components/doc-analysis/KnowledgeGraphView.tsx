import React, { useMemo, useState } from 'react';
import type { KnowledgeGraphSnapshot, NodeType } from '../../types/documentAnalysis';

const MAX_RENDERED_NODES = 70;
const SIMULATION_ITERATIONS = 260;

const TYPE_COLORS: Record<NodeType, string> = {
  concept: 'var(--cyan)',
  component: 'var(--green)',
  operation: 'var(--amber)',
  endpoint: 'var(--purple, #a78bfa)',
  asset: 'var(--purple, #a78bfa)',
  'code-artifact': 'var(--text-accent)',
  account: 'var(--text-muted)',
  contract: 'var(--text-muted)',
  transaction: 'var(--text-muted)',
};

const ALL_TYPES = Object.keys(TYPE_COLORS) as NodeType[];

interface Point {
  x: number;
  y: number;
}

function simulate(
  nodeIds: string[],
  edges: Array<{ source: number; target: number }>,
  width = 860,
  height = 480
): Point[] {
  const count = nodeIds.length;
  const points: Point[] = nodeIds.map((_, index) => {
    const angle = (index / Math.max(1, count)) * Math.PI * 2;
    return {
      x: width / 2 + Math.cos(angle) * (width / 3),
      y: height / 2 + Math.sin(angle) * (height / 3),
    };
  });
  if (!count) return points;
  const velocities: Point[] = nodeIds.map(() => ({ x: 0, y: 0 }));
  let alpha = 1;
  for (let iteration = 0; iteration < SIMULATION_ITERATIONS && alpha > 0.015; iteration += 1) {
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const dx = points[j].x - points[i].x;
        const dy = points[j].y - points[i].y;
        const distanceSquared = dx * dx + dy * dy || 1;
        const force = (5200 / distanceSquared) * alpha;
        const distance = Math.sqrt(distanceSquared);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        velocities[i].x -= fx;
        velocities[i].y -= fy;
        velocities[j].x += fx;
        velocities[j].y += fy;
      }
    }
    for (const edge of edges) {
      const dx = points[edge.target].x - points[edge.source].x;
      const dy = points[edge.target].y - points[edge.source].y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = ((distance - 130) * 0.015) * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      velocities[edge.source].x += fx;
      velocities[edge.source].y += fy;
      velocities[edge.target].x -= fx;
      velocities[edge.target].y -= fy;
    }
    for (let i = 0; i < count; i += 1) {
      velocities[i].x += (width / 2 - points[i].x) * 0.0025 * alpha;
      velocities[i].y += (height / 2 - points[i].y) * 0.0025 * alpha;
      velocities[i].x *= 0.82;
      velocities[i].y *= 0.82;
      points[i].x = Math.max(30, Math.min(width - 30, points[i].x + velocities[i].x));
      points[i].y = Math.max(26, Math.min(height - 26, points[i].y + velocities[i].y));
    }
    alpha *= 0.982;
  }
  return points;
}

interface KnowledgeGraphViewProps {
  snapshot: KnowledgeGraphSnapshot;
}

export default function KnowledgeGraphView({ snapshot }: KnowledgeGraphViewProps) {
  const [visibleTypes, setVisibleTypes] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableView, setTableView] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);

  const rendered = useMemo(() => {
    const nodes = snapshot.nodes
      .filter((node) => visibleTypes.has(node.type))
      .slice(0, MAX_RENDERED_NODES);
    const indexById = new Map(nodes.map((node, index) => [node.id, index]));
    const edges = snapshot.edges
      .map((edge) => ({
        id: edge.id,
        type: edge.type,
        weight: edge.weight,
        sourceIndex: indexById.get(edge.fromId),
        targetIndex: indexById.get(edge.toId),
      }))
      .filter(
        (edge): edge is typeof edge & { sourceIndex: number; targetIndex: number } =>
          edge.sourceIndex !== undefined && edge.targetIndex !== undefined
      );
    return { nodes, edges };
  }, [snapshot, visibleTypes]);

  const positions = useMemo(
    () =>
      simulate(
        rendered.nodes.map((node) => node.id),
        rendered.edges.map((edge) => ({ source: edge.sourceIndex, target: edge.targetIndex }))
      ),
    [rendered]
  );

  const selected = snapshot.nodes.find((node) => node.id === selectedId) ?? null;
  const neighborIds = useMemo(() => {
    if (!selectedId) return [];
    const neighbors = new Set<string>();
    for (const edge of snapshot.edges) {
      if (edge.fromId === selectedId) neighbors.add(edge.toId);
      if (edge.toId === selectedId) neighbors.add(edge.fromId);
    }
    return [...neighbors].slice(0, 12);
  }, [snapshot, selectedId]);
  const labelById = useMemo(
    () => new Map(snapshot.nodes.map((node) => [node.id, node.label])),
    [snapshot]
  );

  const toggleType = (type: NodeType) => {
    setVisibleTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next.size ? next : new Set(ALL_TYPES);
    });
  };

  if (!snapshot.nodes.length) {
    return (
      <div className="doc-empty">
        <strong>The knowledge graph is empty</strong>
        <span>Ingest documents to extract entities and relationships.</span>
      </div>
    );
  }

  return (
    <div className="doc-grid wide">
      <div>
        <div className="doc-graph-wrap">
          <div className="doc-graph-toolbar">
            {ALL_TYPES.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={visibleTypes.has(type)}
                  onChange={() => toggleType(type)}
                />
                <i style={{ background: TYPE_COLORS[type] }} />
                {type}
              </label>
            ))}
            <button type="button" onClick={() => setTableView((value) => !value)}>
              {tableView ? 'Graph view' : 'Table view'}
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              Reset zoom
            </button>
          </div>
          {tableView ? (
            <div style={{ maxHeight: 520, overflow: 'auto', padding: 16 }} tabIndex={0}>
              <h3>Entities</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 6 }}>Entity</th>
                    <th style={{ textAlign: 'left', padding: 6 }}>Type</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Mentions</th>
                    <th style={{ textAlign: 'right', padding: 6 }}>Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.nodes.slice(0, 100).map((node) => (
                    <tr key={node.id}>
                      <td style={{ padding: 6 }}>{node.label}</td>
                      <td style={{ padding: 6 }}>{node.type}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{node.mentions}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{node.sourceDocIds.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>Relationships</h3>
              <ul>
                {snapshot.edges.slice(0, 60).map((edge) => (
                  <li key={edge.id}>
                    {labelById.get(edge.fromId)} —[{edge.type}]→ {labelById.get(edge.toId)}{' '}
                    <small className="doc-muted">(weight {edge.weight})</small>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <svg
              className="doc-graph-svg"
              viewBox="0 0 860 480"
              role="img"
              aria-label={`Knowledge graph with ${rendered.nodes.length} entities and ${rendered.edges.length} relationships`}
              onWheel={(event) => {
                event.preventDefault();
                setZoom((current) =>
                  Math.min(3, Math.max(0.4, current * Math.exp(-event.deltaY * 0.0012)))
                );
              }}
              onPointerDown={(event) => {
                setDragging({ x: event.clientX, y: event.clientY });
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!dragging) return;
                setPan((current) => ({
                  x: current.x + (event.clientX - dragging.x),
                  y: current.y + (event.clientY - dragging.y),
                }));
                setDragging({ x: event.clientX, y: event.clientY });
              }}
              onPointerUp={() => setDragging(null)}
              onPointerLeave={() => setDragging(null)}
            >
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {rendered.edges.map((edge) => {
                  const start = positions[edge.sourceIndex];
                  const end = positions[edge.targetIndex];
                  if (!start || !end) return null;
                  return (
                    <line
                      key={edge.id}
                      className="doc-edge"
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      strokeWidth={Math.min(3, 0.6 + edge.weight * 0.3)}
                    />
                  );
                })}
                {rendered.nodes.map((node, index) => {
                  const point = positions[index];
                  if (!point) return null;
                  const radius = 5 + Math.min(9, Math.sqrt(node.mentions) * 1.7);
                  return (
                    <g
                      key={node.id}
                      className="doc-node"
                      transform={`translate(${point.x},${point.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${node.label}, ${node.type}, ${node.mentions} mentions`}
                      onClick={() => setSelectedId(node.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id);
                      }}
                    >
                      <circle
                        r={radius}
                        fill={TYPE_COLORS[node.type]}
                        fillOpacity={selectedId === node.id ? 1 : 0.82}
                        stroke={selectedId === node.id ? 'var(--cyan)' : 'transparent'}
                        strokeWidth={2}
                      />
                      <text
                        y={radius + 11}
                        textAnchor="middle"
                        fontSize={9}
                        fill="var(--text-secondary)"
                      >
                        {node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
        <p className="doc-muted" style={{ marginTop: 8 }}>
          Showing {Math.min(rendered.nodes.length, MAX_RENDERED_NODES)} of {snapshot.stats.nodeCount}{' '}
          entities · scroll to zoom, drag to pan, click a node for details.
        </p>
      </div>
      <div className="doc-card">
        <h2>Node details</h2>
        {selected ? (
          <>
            <strong style={{ fontSize: 18 }}>{selected.label}</strong>
            <p>
              <span className="doc-badge">{selected.type}</span>{' '}
              <span className="doc-chip">{selected.mentions} mentions</span>{' '}
              <span className="doc-chip">{selected.sourceDocIds.length} sources</span>
            </p>
            <h3>Connected concepts</h3>
            <div>
              {neighborIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="doc-chip"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedId(id)}
                >
                  {labelById.get(id)}
                </button>
              ))}
              {!neighborIds.length && <span className="doc-muted">No connected concepts.</span>}
            </div>
          </>
        ) : (
          <p className="doc-muted">
            Select a node in the graph to inspect its relationships and provenance.
          </p>
        )}
        <h3>Legend</h3>
        <div className="doc-legend">
          {ALL_TYPES.map((type) => (
            <span key={type}>
              <i style={{ background: TYPE_COLORS[type] }} />
              {type}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

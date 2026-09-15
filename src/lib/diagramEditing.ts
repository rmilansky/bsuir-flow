import type { FlowEdge, FlowGraph, FlowNode, Point } from './graph';

const margin = 24;
const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function tidyRoute(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (result.length && equal(result.at(-1)!, point)) continue;
    const a = result.at(-2), b = result.at(-1);
    if (a && b && ((a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) >= 0)
      || (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) >= 0))) result.pop();
    result.push({ ...point });
  }
  return result;
}

function routeLabel(edge: FlowEdge, points: Point[]): FlowEdge {
  if (!edge.label) return { ...edge, points };
  let longest = 0, middle = points[0], horizontal = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length <= longest) continue;
    longest = length; middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; horizontal = a.y === b.y;
  }
  return { ...edge, points, labelX: Math.max(4, middle.x + (horizontal ? -Math.max(22, edge.label.length * 8) / 2 : 8)), labelY: Math.max(4, middle.y - (horizontal ? 22 : 9)) };
}

function attachRoute(edge: FlowEdge, source: FlowNode, target: FlowNode): FlowEdge {
  const start = edge.label === 'Нет'
    ? { x: source.x! + source.width, y: source.y! + source.height / 2 }
    : { x: source.x! + source.width / 2, y: source.y! + source.height };
  const end = { x: target.x! + target.width / 2, y: target.y! };
  const points = tidyRoute(edge.points || []);
  if (points.length >= 3) {
    const firstVertical = points[0].x === points[1].x;
    const lastVertical = points.at(-1)!.x === points.at(-2)!.x;
    points[0] = start; points[points.length - 1] = end;
    if (firstVertical) points[1].x = start.x; else points[1].y = start.y;
    if (lastVertical) points[points.length - 2].x = end.x; else points[points.length - 2].y = end.y;
    if (points.every((point, i) => !i || point.x === points[i - 1].x || point.y === points[i - 1].y)) return routeLabel(edge, tidyRoute(points));
  }
  let route: Point[];
  if (edge.label !== 'Нет' && end.y > start.y + 32) {
    const y = (start.y + end.y) / 2;
    route = [start, { x: start.x, y }, { x: end.x, y }, end];
  } else {
    const x = Math.max(source.x! + source.width, target.x! + target.width) + 40;
    const y = edge.label === 'Нет' ? start.y : start.y + 20;
    route = [start, { x: start.x, y }, { x, y }, { x, y: end.y - 20 }, { x: end.x, y: end.y - 20 }, end];
  }
  return routeLabel(edge, tidyRoute(route));
}

export function expandDiagramBounds(graph: FlowGraph): FlowGraph {
  const positions = [
    ...graph.nodes.map(node => ({ x: node.x! + node.width, y: node.y! + node.height })),
    ...graph.edges.flatMap(edge => [...(edge.points || []), ...(edge.labelX === undefined ? [] : [{ x: edge.labelX + Math.max(22, (edge.label?.length || 0) * 8), y: edge.labelY! + 20 }])]),
  ];
  return { ...graph, width: Math.max(graph.width, ...positions.map(point => point.x + margin)), height: Math.max(graph.height, ...positions.map(point => point.y + margin)) };
}

export function moveDiagramNode(graph: FlowGraph, id: string, x: number, y: number): FlowGraph {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !graph.nodes.some(node => node.id === id)) return graph;
  const nodes = graph.nodes.map(node => node.id === id ? { ...node, x: Math.max(margin, x), y: Math.max(32, y) } : node);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges.map(edge => edge.source === id || edge.target === id ? attachRoute(edge, byId.get(edge.source)!, byId.get(edge.target)!) : edge);
  return { ...graph, nodes, edges };
}

export function moveArrowSegment(graph: FlowGraph, id: string, segment: number, dx: number, dy: number): FlowGraph {
  const edge = graph.edges.find(edge => edge.id === id);
  const points = edge?.points;
  if (!edge || !points || !points[segment + 1] || !Number.isFinite(dx) || !Number.isFinite(dy)) return graph;
  const a = points[segment], b = points[segment + 1];
  const horizontal = a.y === b.y;
  const delta = horizontal ? Math.max(margin - a.y, dy) : Math.max(margin - a.x, dx);
  if (!delta) return graph;
  const first = segment === 0, last = segment === points.length - 2;
  const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  const stub = Math.min(18, length / 3);
  const direction = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
  const begin = first ? { x: a.x + direction.x * stub, y: a.y + direction.y * stub } : a;
  const end = last ? { x: b.x - direction.x * stub, y: b.y - direction.y * stub } : b;
  const offset = (point: Point) => horizontal ? { x: point.x, y: point.y + delta } : { x: point.x + delta, y: point.y };
  const route = tidyRoute([
    ...(first ? [a, begin] : points.slice(0, segment)), offset(begin), offset(end),
    ...(last ? [end, b] : points.slice(segment + 2)),
  ]);
  return { ...graph, edges: graph.edges.map(item => item.id === id ? routeLabel(item, route) : item) };
}

// Keep edited positions when only captions change. Reattach arrows to resized
// blocks using the same ports as the automatic layout.
export function restoreDiagramLayout(graph: FlowGraph, previous: FlowGraph): FlowGraph {
  const oldNodes = new Map(previous.nodes.map(node => [node.id, node]));
  const oldEdges = new Map(previous.edges.map(edge => [edge.id, edge]));
  const nodes = graph.nodes.map(node => {
    const old = oldNodes.get(node.id);
    return old ? { ...node, x: old.x, y: old.y } : node;
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges.map(edge => {
    const old = oldEdges.get(edge.id);
    if (!old || old.source !== edge.source || old.target !== edge.target) return edge;
    const source = byId.get(edge.source)!, target = byId.get(edge.target)!;
    const saved = { ...edge, points: old.points, labelX: old.labelX, labelY: old.labelY };
    return source.width !== oldNodes.get(edge.source)?.width || source.height !== oldNodes.get(edge.source)?.height
      || target.width !== oldNodes.get(edge.target)?.width || target.height !== oldNodes.get(edge.target)?.height
      ? attachRoute(saved, source, target) : saved;
  });
  return expandDiagramBounds({ ...graph, nodes, edges, width: previous.width, height: previous.height });
}

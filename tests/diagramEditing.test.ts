import { describe, expect, it } from 'vitest';
import { expandDiagramBounds, moveArrowSegment, moveDiagramNode, restoreDiagramLayout } from '../src/lib/diagramEditing';
import { buildGraph, type FlowGraph } from '../src/lib/graph';
import { parseC } from '../src/lib/parser';
import { layoutGraph } from '../src/lib/layout';

const fixture = (): FlowGraph => ({ name: 'main', width: 400, height: 400, warnings: [],
  nodes: [
    { id: 'a', shape: 'process', code: 'a', label: 'a', line: 1, x: 100, y: 40, width: 100, height: 60, lines: ['a'] },
    { id: 'b', shape: 'process', code: 'b', label: 'b', line: 2, x: 100, y: 280, width: 100, height: 60, lines: ['b'] },
  ],
  edges: [{ id: 'e', source: 'a', target: 'b', label: 'Да', points: [{ x: 150, y: 100 }, { x: 150, y: 280 }], labelX: 158, labelY: 180 }],
});

function assertConnected(graph: FlowGraph) {
  for (const edge of graph.edges) {
    const source = graph.nodes.find(node => node.id === edge.source)!;
    const target = graph.nodes.find(node => node.id === edge.target)!;
    expect(edge.points![0]).toEqual(edge.label === 'Нет' ? { x: source.x! + source.width, y: source.y! + source.height / 2 } : { x: source.x! + source.width / 2, y: source.y! + source.height });
    expect(edge.points!.at(-1)).toEqual({ x: target.x! + target.width / 2, y: target.y! });
    for (let i = 1; i < edge.points!.length; i++) {
      const a = edge.points![i - 1], b = edge.points![i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  }
}

describe('manual diagram layout', () => {
  it('moves a block and reroutes an initially straight arrow without mutating the graph', () => {
    const original = fixture(), saved = structuredClone(original);
    const moved = moveDiagramNode(original, 'a', 220, 60);
    expect(moved.nodes[0]).toMatchObject({ x: 220, y: 60 });
    expect(moved.edges[0].points!.length).toBeGreaterThan(2);
    assertConnected(moved);
    expect(original).toEqual(saved);
  });

  it('moves a straight arrow sideways while keeping both ends and labels attached', () => {
    const graph = moveArrowSegment(fixture(), 'e', 0, 65, 30);
    expect(graph.edges[0].points!.some(point => point.x === 215)).toBe(true);
    expect(graph.edges[0].labelX).not.toBe(158);
    assertConnected(graph);
  });

  it('moves every horizontal and vertical segment while preserving right angles', () => {
    const graph = moveArrowSegment(fixture(), 'e', 0, 65, 0);
    for (let i = 0; i < graph.edges[0].points!.length - 1; i++) {
      const moved = moveArrowSegment(graph, 'e', i, 30, 25);
      expect(moved.edges[0].points).not.toEqual(graph.edges[0].points);
      assertConnected(moved);
    }
  });

  it('keeps manual routes attached after moving both blocks', () => {
    let graph = moveArrowSegment(fixture(), 'e', 0, 80, 0);
    graph = moveDiagramNode(graph, 'a', 140, 55);
    graph = moveDiagramNode(graph, 'b', 190, 360);
    assertConnected(graph);
    expect(graph.edges[0].points!.some(point => point.x === 230)).toBe(true);
  });

  it('expands export bounds to include moved blocks, routes and labels', () => {
    const graph = expandDiagramBounds(moveDiagramNode(fixture(), 'b', 700, 800));
    expect(graph.width).toBeGreaterThanOrEqual(824);
    expect(graph.height).toBeGreaterThanOrEqual(884);
    expect(moveDiagramNode(graph, 'b', -20, -20).nodes[1]).toMatchObject({ x: 24, y: 32 });
  });

  it('preserves layout when a new caption changes a block height', () => {
    const original = fixture();
    const edited = expandDiagramBounds(moveDiagramNode(original, 'a', 240, 80));
    const renamed = { ...original, nodes: original.nodes.map(node => node.id === 'a' ? { ...node, label: 'Новая подпись', height: 100 } : node) };
    const restored = restoreDiagramLayout(renamed, edited);
    expect(restored.nodes[0]).toMatchObject({ x: 240, y: 80, height: 100, label: 'Новая подпись' });
    assertConnected(restored);
  });

  it('preserves connections for branches, loopbacks and self loops', async () => {
    const graph = await layoutGraph(buildGraph(parseC('int main(){while(a){if(b) break; work();} do{}while(c); return 0;}').functions[0], { comments: false }));
    for (const node of graph.nodes) assertConnected(moveDiagramNode(graph, node.id, node.x! + 60, node.y! + 35));
  });

  it('ignores invalid coordinates and missing objects', () => {
    const graph = fixture();
    expect(moveDiagramNode(graph, 'a', NaN, 0)).toBe(graph);
    expect(moveDiagramNode(graph, 'missing', 0, 0)).toBe(graph);
    expect(moveArrowSegment(graph, 'e', 99, 1, 1)).toBe(graph);
    expect(moveArrowSegment(graph, 'e', 0, Infinity, 1)).toBe(graph);
  });
});

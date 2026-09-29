import { describe, expect, it } from 'vitest';
import { drawioSource } from '../src/lib/drawio';
import { buildGraph } from '../src/lib/graph';
import { parseC } from '../src/lib/parser';
import { layoutGraph } from '../src/lib/layout';
import { moveArrowSegment, moveDiagramNode } from '../src/lib/diagramEditing';
import { examples } from '../src/lib/examples';

const graphFor = (body: string) => layoutGraph(buildGraph(parseC(`int main(){${body}}`).functions[0], { comments: true }));

describe('draw.io export', () => {
  it('exports native cells and connections with the displayed geometry', async () => {
    const graph = await graphFor('if(a) work(); else puts("b"); return 0;');
    const source = drawioSource(graph);
    expect(source).toContain('<mxfile host="app.diagrams.net">');
    expect(source).toContain('<mxCell id="0"/>');
    expect(source).toContain('<mxCell id="1" parent="0"/>');
    expect(source.match(/vertex="1"/g)).toHaveLength(graph.nodes.length);
    expect(source.match(/edge="1"/g)).toHaveLength(graph.edges.length);
    expect(source).toContain('value="Да"');
    expect(source).toContain('value="Нет"');
    expect(source).toContain('exitX=1;exitY=0.5;exitPerimeter=0;');
    for (const node of graph.nodes) {
      expect(source).toContain(`<mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"`);
    }
  });

  it('retains moved blocks and manually edited arrow waypoints', async () => {
    let graph = await graphFor('x=1; return 0;');
    const node = graph.nodes.find(node => node.code === 'x=1')!;
    graph = moveDiagramNode(graph, node.id, 325, 185);
    const edge = graph.edges.find(edge => edge.source === node.id)!;
    graph = moveArrowSegment(graph, edge.id, 0, 35, 25);
    const before = structuredClone(graph);
    const source = drawioSource(graph);
    expect(source).toContain('<mxGeometry x="325" y="185"');
    for (const point of graph.edges.find(item => item.id === edge.id)!.points!.slice(1, -1)) {
      expect(source).toContain(`<mxPoint x="${point.x}" y="${point.y}"/>`);
    }
    expect(graph).toEqual(before);
  });

  it('escapes labels and names while preserving newlines as plain text', async () => {
    const graph = await graphFor('work();');
    graph.name = 'a & "b"';
    graph.nodes[1].label = '<b>"Текст"</b> & x\nвторая строка\u0000';
    const source = drawioSource(graph, true);
    expect(source).toContain('name="a &amp; &quot;b&quot;"');
    expect(source).toContain('value="2. &lt;b&gt;&quot;Текст&quot;&lt;/b&gt; &amp; x&#10;вторая строка"');
    expect(source).toContain('html=0;');
    expect(source).not.toContain('\u0000');
  });

  it('keeps hidden returns out and uses unique IDs for merged blocks', async () => {
    const fn = parseC('int main(){x=1;y=2;return 0;}').functions[0];
    const graph = await layoutGraph(buildGraph(fn, { comments: false, mergeProcesses: true, hideExitReturn: true }));
    const source = drawioSource(graph);
    expect(source).toContain('x=1&#10;y=2');
    expect(source).not.toContain('return 0');
    expect(source).not.toContain('group:');
    const ids = [...source.matchAll(/<mxCell id="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of source.matchAll(/(?:source|target)="([^"]+)"/g)) expect(ids).toContain(match[1]);
  });

  it.each(examples)('exports every node and edge in $title', async example => {
    for (const fn of parseC(example.code).functions) {
      const graph = await layoutGraph(buildGraph(fn, { comments: true }));
      const source = drawioSource(graph);
      expect(source.match(/vertex="1"/g)).toHaveLength(graph.nodes.length);
      expect(source.match(/edge="1"/g)).toHaveLength(graph.edges.length);
      expect(source).not.toMatch(/undefined|NaN|Infinity/);
    }
  });
});

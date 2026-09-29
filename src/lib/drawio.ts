import type { FlowGraph, Point, Shape } from './graph';

const shapes: Record<Shape, string> = {
  terminator: 'rounded=1;arcSize=50;',
  process: 'rounded=0;',
  decision: 'rhombus;perimeter=rhombusPerimeter;',
  data: 'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;size=22;',
  predefined: 'shape=process;size=0.055;',
  preparation: 'shape=hexagon;perimeter=hexagonPerimeter;fixedSize=1;size=22;',
  junction: 'ellipse;perimeter=ellipsePerimeter;',
};

function xml(value: string): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\n': '&#10;', '\r': '&#13;', '\t': '&#9;' };
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/[&<>"'\n\r\t]/g, character => entities[character]);
}

function coordinate(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) throw new Error('Не удалось экспортировать расположение блоков. Постройте схему заново.');
  return value;
}

function midpoint(points: Point[]): Point {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i]) {
      const fraction = remaining / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * fraction, y: points[i].y + (points[i + 1].y - points[i].y) * fraction };
    }
    remaining -= lengths[i];
  }
  return points[0];
}

export function drawioSource(graph: FlowGraph, numbers = false): string {
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `node${index + 1}`]));
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const nodes = graph.nodes.map((node, index) => {
    const label = node.shape === 'junction' ? '' : `${numbers ? `${node.number ?? index + 1}. ` : ''}${node.label}`;
    const style = `${shapes[node.shape]}whiteSpace=wrap;html=0;fillColor=#ffffff;strokeColor=#111111;strokeWidth=1.4;fontColor=#111111;fontFamily=Arial;fontSize=15;align=center;verticalAlign=middle;`;
    return `        <mxCell id="${ids.get(node.id)}" value="${xml(label)}" style="${style}" vertex="1" parent="1">\n          <mxGeometry x="${coordinate(node.x)}" y="${coordinate(node.y)}" width="${coordinate(node.width)}" height="${coordinate(node.height)}" as="geometry"/>\n        </mxCell>`;
  });
  const edges = graph.edges.map((edge, index) => {
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) throw new Error('Не удалось экспортировать draw.io: у стрелки отсутствует блок. Постройте схему заново.');
    const points = edge.points?.length ? edge.points : [
      { x: coordinate(source.x) + source.width / 2, y: coordinate(source.y) + source.height },
      { x: coordinate(target.x) + target.width / 2, y: coordinate(target.y) },
    ];
    const start = points[0], end = points.at(-1)!;
    const style = 'edgeStyle=none;noEdgeStyle=1;orthogonal=1;rounded=0;html=0;endArrow=block;endFill=1;strokeColor=#111111;strokeWidth=1.3;fontColor=#111111;fontFamily=Arial;fontSize=13;labelBackgroundColor=#ffffff;'
      + `exitX=${coordinate((start.x - source.x!) / source.width)};exitY=${coordinate((start.y - source.y!) / source.height)};exitPerimeter=0;`
      + `entryX=${coordinate((end.x - target.x!) / target.width)};entryY=${coordinate((end.y - target.y!) / target.height)};entryPerimeter=0;`;
    const bends = points.slice(1, -1).map(point => `              <mxPoint x="${coordinate(point.x)}" y="${coordinate(point.y)}"/>`);
    const geometry = bends.length ? [`            <Array as="points">`, ...bends, '            </Array>'] : [];
    if (edge.label && edge.labelX !== undefined && edge.labelY !== undefined) {
      const middle = midpoint(points);
      geometry.push(`            <mxPoint x="${coordinate(edge.labelX + Math.max(22, edge.label.length * 8) / 2 - middle.x)}" y="${coordinate(edge.labelY + 9 - middle.y)}" as="offset"/>`);
    }
    return [`        <mxCell id="edge${index + 1}" value="${xml(edge.label || '')}" style="${style}" edge="1" parent="1" source="${ids.get(edge.source)}" target="${ids.get(edge.target)}">`,
      '          <mxGeometry relative="1" as="geometry">', ...geometry, '          </mxGeometry>', '        </mxCell>'].join('\n');
  });
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<mxfile host="app.diagrams.net">', `  <diagram id="flowchart" name="${xml(graph.name)}">`,
    `    <mxGraphModel grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" page="0" pageScale="1" pageWidth="${Math.ceil(coordinate(graph.width))}" pageHeight="${Math.ceil(coordinate(graph.height))}" math="0" shadow="0" background="#ffffff">`,
    '      <root>', '        <mxCell id="0"/>', '        <mxCell id="1" parent="0"/>', ...edges, ...nodes,
    '      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>', ''].join('\n');
}

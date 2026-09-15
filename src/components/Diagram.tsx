import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { FlowGraph, FlowNode, Point } from '../lib/graph';
import { expandDiagramBounds, moveArrowSegment, moveDiagramNode } from '../lib/diagramEditing';

export const shapeNames: Record<FlowNode['shape'], string> = {
  terminator: 'Начало / конец', process: 'Процесс', decision: 'Решение', data: 'Ввод / вывод',
  predefined: 'Предопределённый процесс', preparation: 'Подготовка', junction: 'Соединитель',
};

function NodeShape({ node, selected, monochrome, dark }: { node: FlowNode; selected: boolean; monochrome: boolean; dark: boolean }) {
  const { width: w, height: h, shape } = node;
  const fill = monochrome ? '#ffffff' : dark ? (selected ? '#394b77' : shape === 'terminator' ? '#343c58' : '#282e40') : selected ? '#e8ecff' : shape === 'terminator' ? '#ecf0ff' : '#ffffff';
  const stroke = monochrome ? '#111111' : dark ? (selected ? '#b6c6ff' : '#a8b3d3') : selected ? '#4e69bb' : '#6b7897';
  const common = { fill, stroke, strokeWidth: selected && !monochrome ? 2 : 1.4, strokeLinejoin: 'round' as const };
  if (shape === 'decision') return <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...common} />;
  if (shape === 'data') return <polygon points={`22,0 ${w},0 ${w - 22},${h} 0,${h}`} {...common} />;
  if (shape === 'preparation') return <polygon points={`22,0 ${w - 22},0 ${w},${h / 2} ${w - 22},${h} 22,${h} 0,${h / 2}`} {...common} />;
  return <>
    <rect width={w} height={h} rx={shape === 'terminator' ? h / 2 : 0} {...common} />
    {shape === 'predefined' && <path d={`M14 0V${h} M${w - 14} 0V${h}`} fill="none" stroke={stroke} strokeWidth="1.4" />}
  </>;
}

export default function Diagram({ graph, selected, onSelect, selectedEdge, onSelectEdge, onLayoutChange, onEditStart, scale = 1, numbers, monochrome = false, exportMode = false, dark = false }: {
  graph: FlowGraph; selected?: string; onSelect?: (node: FlowNode) => void; numbers: boolean; monochrome?: boolean; exportMode?: boolean; dark?: boolean;
  selectedEdge?: string; onSelectEdge?: (id: string) => void; onLayoutChange?: (graph: FlowGraph) => void; onEditStart?: () => void; scale?: number;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: 'node' | 'edge'; id: string; segment: number; pointer: number; origin: Point; matrix: DOMMatrix; initial: FlowGraph; current: FlowGraph; moved: boolean } | null>(null);
  const suppressClick = useRef(0);
  const editable = !!onLayoutChange && !exportMode;
  useEffect(() => {
    const active = drag.current;
    if (editable || !active) return;
    drag.current = null;
    if (svg.current?.hasPointerCapture(active.pointer)) svg.current.releasePointerCapture(active.pointer);
  }, [editable]);
  const position = (event: ReactPointerEvent, matrix: DOMMatrix) => new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
  const beginDrag = (event: ReactPointerEvent<SVGElement>, kind: 'node' | 'edge', id: string, segment = -1) => {
    if (!editable || event.button !== 0 || drag.current) return;
    const matrix = svg.current?.getScreenCTM()?.inverse();
    if (!matrix) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({ preventScroll: true });
    const origin = position(event, matrix);
    if (kind === 'edge') {
      onSelectEdge?.(id);
      if (segment < 0) {
        const points = graph.edges.find(edge => edge.id === id)!.points!;
        let closest = Infinity;
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i], b = points[i + 1];
          const x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), origin.x));
          const y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), origin.y));
          const distance = Math.hypot(x - origin.x, y - origin.y);
          if (distance < closest) { closest = distance; segment = i; }
        }
      }
    }
    drag.current = { kind, id, segment, pointer: event.pointerId, origin, matrix, initial: graph, current: graph, moved: false };
    svg.current!.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointer) return;
    const point = position(event, active.matrix), dx = point.x - active.origin.x, dy = point.y - active.origin.y;
    if (!active.moved && Math.hypot(dx, dy) < 4) return;
    if (!active.moved) onEditStart?.();
    active.moved = true;
    const node = active.initial.nodes.find(node => node.id === active.id);
    active.current = active.kind === 'node'
      ? moveDiagramNode(active.initial, active.id, node!.x! + dx, node!.y! + dy)
      : moveArrowSegment(active.initial, active.id, active.segment, dx, dy);
    onLayoutChange?.(active.current);
  };
  const finish = (cancel = false) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    if (svg.current?.hasPointerCapture(active.pointer)) svg.current.releasePointerCapture(active.pointer);
    if (active.moved) {
      suppressClick.current = Date.now() + 350;
      onLayoutChange?.(cancel ? active.initial : expandDiagramBounds(active.current));
    } else if (!cancel && active.kind === 'node') onSelect?.(active.initial.nodes.find(node => node.id === active.id)!);
  };
  const nudge = (event: React.KeyboardEvent<SVGElement>, kind: 'node' | 'edge', id: string, segment = -1) => {
    if (!editable || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); onEditStart?.();
    const step = event.shiftKey ? 20 : 5;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const node = graph.nodes.find(node => node.id === id);
    onLayoutChange?.(expandDiagramBounds(kind === 'node' ? moveDiagramNode(graph, id, node!.x! + dx, node!.y! + dy) : moveArrowSegment(graph, id, segment, dx, dy)));
  };
  const night = dark && !monochrome && !exportMode;
  const ink = monochrome ? '#111111' : night ? '#a8b3d3' : '#6b7897';
  const accent = night ? '#b6c6ff' : '#617ccc';
  return <svg ref={svg} xmlns="http://www.w3.org/2000/svg" className={`flow-svg${editable ? ' is-editable' : ''}`} width={graph.width} height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} role="img" aria-label={`Блок-схема функции ${graph.name}`}
    onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onKeyDown={event => { if (event.key === 'Escape') finish(true); }}>
    <title>Блок-схема функции {graph.name}</title>
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill={ink} /></marker></defs>
    {exportMode && <rect width="100%" height="100%" fill="#ffffff" />}
    {graph.edges.map(edge => <g key={edge.id} className={exportMode ? undefined : 'flow-edge'} data-edge-id={exportMode ? undefined : edge.id}>
      {editable && <path className="edge-hit-area" d={edge.points?.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} fill="none" stroke="transparent" strokeWidth="16" vectorEffect="non-scaling-stroke"
        role="button" tabIndex={0} aria-label={`Стрелка${edge.label ? ` «${edge.label}»` : ''}: ${graph.nodes.find(node => node.id === edge.source)?.label} → ${graph.nodes.find(node => node.id === edge.target)?.label}`}
        onPointerDown={event => beginDrag(event, 'edge', edge.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectEdge?.(edge.id); } }} />}
      <path className={exportMode ? undefined : 'edge-line'} pointerEvents="none" d={edge.points?.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} fill="none" stroke={editable && edge.id === selectedEdge ? accent : ink} strokeWidth={editable && edge.id === selectedEdge ? 2.5 : 1.3} markerEnd="url(#arrow)" />
      {edge.label && edge.labelX !== undefined && <g pointerEvents="none">
        <rect x={edge.labelX - 3} y={edge.labelY! - 1} width={Math.max(22, edge.label.length * 8) + 6} height="19" rx="3" fill={exportMode || monochrome ? '#fff' : night ? '#202535' : '#fcfbf8'} />
        <text x={edge.labelX} y={edge.labelY! + 13} fontFamily="Arial, sans-serif" fontSize="13" fill={ink}>{edge.label}</text>
      </g>}
    </g>)}
    {graph.nodes.map(node => <g key={node.id} transform={`translate(${node.x},${node.y})`} className={exportMode ? undefined : 'flow-node'} data-node-id={exportMode ? undefined : node.id}
      role={exportMode ? undefined : 'button'} tabIndex={exportMode ? undefined : 0} aria-label={`${shapeNames[node.shape]}: ${node.label}`}
      onPointerDown={event => beginDrag(event, 'node', node.id)}
      onClick={event => { if (Date.now() < suppressClick.current || (editable && event.detail !== 0)) return; onSelect?.(node); }}
      onKeyDown={e => { nudge(e, 'node', node.id); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(node); } }}>
      <title>{node.code}{node.comment ? ` — ${node.comment}` : ''}</title>
      <NodeShape node={node} selected={node.id === selected && !exportMode} monochrome={monochrome} dark={night} />
      {numbers && <text x={node.shape === 'decision' ? node.width / 2 - 12 : 1} y="-9" fontSize="11" fontFamily="Arial, sans-serif" fill={ink}>{node.number}</text>}
      <text x={node.width / 2} y={node.height / 2 - ((node.lines.length - 1) * 21) / 2 + 5} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="15" fill={monochrome ? '#111111' : night ? '#e2e6f4' : '#425173'}>
        {node.lines.map((line, i) => <tspan key={i} x={node.width / 2} dy={i === 0 ? 0 : 21}>{line}</tspan>)}
      </text>
    </g>)}
    {editable && graph.edges.filter(edge => edge.id === selectedEdge).flatMap(edge => edge.points?.slice(0, -1).map((a, i) => {
      const b = edge.points![i + 1];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return null;
      return <g key={`${edge.id}-${i}`} className={`edge-handle ${a.y === b.y ? 'horizontal' : 'vertical'}`} transform={`translate(${(a.x + b.x) / 2},${(a.y + b.y) / 2})`}
        role="button" tabIndex={0} aria-label={`Участок стрелки ${i + 1}`} onPointerDown={event => beginDrag(event, 'edge', edge.id, i)} onKeyDown={event => nudge(event, 'edge', edge.id, i)}>
        <title>Перетащи участок стрелки. Клавиши со стрелками — сдвиг, Shift — быстрее.</title>
        <circle r={14 / scale} fill="transparent" />
        <circle r={5 / scale} fill={night ? '#202535' : '#fff'} stroke={accent} strokeWidth={1.5 / scale} pointerEvents="none" />
      </g>;
    }) || [])}
  </svg>;
}

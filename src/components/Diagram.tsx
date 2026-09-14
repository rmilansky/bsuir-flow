import type { FlowGraph, FlowNode } from '../lib/graph';

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

export default function Diagram({ graph, selected, onSelect, numbers, monochrome = false, exportMode = false, dark = false }: {
  graph: FlowGraph; selected?: string; onSelect?: (node: FlowNode) => void; numbers: boolean; monochrome?: boolean; exportMode?: boolean; dark?: boolean;
}) {
  const night = dark && !monochrome && !exportMode;
  const ink = monochrome ? '#111111' : night ? '#a8b3d3' : '#6b7897';
  return <svg xmlns="http://www.w3.org/2000/svg" className="flow-svg" width={graph.width} height={graph.height} viewBox={`0 0 ${graph.width} ${graph.height}`} role="img" aria-label={`Блок-схема функции ${graph.name}`}>
    <title>Блок-схема функции {graph.name}</title>
    <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill={ink} /></marker></defs>
    {exportMode && <rect width="100%" height="100%" fill="#ffffff" />}
    {graph.edges.map(edge => <g key={edge.id}>
      <path d={edge.points?.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} fill="none" stroke={ink} strokeWidth="1.3" markerEnd="url(#arrow)" />
      {edge.label && edge.labelX !== undefined && <g>
        <rect x={edge.labelX - 3} y={edge.labelY! - 1} width={Math.max(22, edge.label.length * 8) + 6} height="19" rx="3" fill={exportMode || monochrome ? '#fff' : night ? '#202535' : '#fcfbf8'} />
        <text x={edge.labelX} y={edge.labelY! + 13} fontFamily="Arial, sans-serif" fontSize="13" fill={ink}>{edge.label}</text>
      </g>}
    </g>)}
    {graph.nodes.map(node => <g key={node.id} transform={`translate(${node.x},${node.y})`} className={exportMode ? undefined : 'flow-node'}
      role={exportMode ? undefined : 'button'} tabIndex={exportMode ? undefined : 0} aria-label={`${shapeNames[node.shape]}: ${node.label}`}
      onClick={() => onSelect?.(node)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(node); } }}>
      <title>{node.code}{node.comment ? ` — ${node.comment}` : ''}</title>
      <NodeShape node={node} selected={node.id === selected && !exportMode} monochrome={monochrome} dark={night} />
      {numbers && <text x={node.shape === 'decision' ? node.width / 2 - 12 : 1} y="-9" fontSize="11" fontFamily="Arial, sans-serif" fill={ink}>{node.number}</text>}
      <text x={node.width / 2} y={node.height / 2 - ((node.lines.length - 1) * 21) / 2 + 5} textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="15" fill={monochrome ? '#111111' : night ? '#e2e6f4' : '#425173'}>
        {node.lines.map((line, i) => <tspan key={i} x={node.width / 2} dy={i === 0 ? 0 : 21}>{line}</tspan>)}
      </text>
    </g>)}
  </svg>;
}

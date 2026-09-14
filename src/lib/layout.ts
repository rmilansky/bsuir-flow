import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { FlowGraph } from './graph';

// The bundled Node fallback installs a worker dispatcher when imported inside
// a browser worker. Use the explicit browser worker API to keep dispatchers separate.
const engine = typeof Worker === 'function'
  ? Promise.resolve(new ELK({ workerFactory: () => new Worker(elkWorkerUrl) }))
  : import('elkjs/lib/elk.bundled.js').then(module => new module.default());

export async function layoutGraph(graph: FlowGraph): Promise<FlowGraph> {
  const elk = await engine;
  const result = await elk.layout<ElkNode>({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.padding': '[top=40,left=48,bottom=40,right=48]',
      'elk.spacing.nodeNode': '58',
      'elk.layered.spacing.nodeNodeBetweenLayers': '52',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.spacing.edgeNode': '28',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.mergeEdges': 'false',
    },
    children: graph.nodes.map(n => ({
      id: n.id, width: n.width, height: n.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: [
        { id: `${n.id}-in`, x: n.width / 2, y: 0, width: 0, height: 0 },
        { id: `${n.id}-out`, x: n.width / 2, y: n.height, width: 0, height: 0 },
        { id: `${n.id}-no`, x: n.width, y: n.height / 2, width: 0, height: 0 },
      ],
    })),
    edges: graph.edges.map(e => ({
      id: e.id, sources: [`${e.source}-${e.label === 'Нет' ? 'no' : 'out'}`], targets: [`${e.target}-in`],
      labels: e.label ? [{ text: e.label, width: Math.max(22, e.label.length * 8), height: 18, layoutOptions: { 'elk.edgeLabels.placement': 'CENTER' } }] : [],
    })),
  });
  return {
    ...graph, width: result.width!, height: result.height!,
    nodes: graph.nodes.map(n => {
      const layout = result.children!.find(child => child.id === n.id)!;
      return { ...n, x: layout.x!, y: layout.y! };
    }),
    edges: graph.edges.map(e => {
      const layout = result.edges!.find(edge => edge.id === e.id)!;
      const section = layout.sections?.[0];
      return { ...e, points: section ? [section.startPoint, ...(section.bendPoints || []), section.endPoint] : [], labelX: layout.labels?.[0]?.x, labelY: layout.labels?.[0]?.y };
    }),
  };
}

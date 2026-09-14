import type { CFunction, Statement } from './parser';
import { tokenize } from './parser';

export type Shape = 'terminator' | 'process' | 'decision' | 'data' | 'predefined' | 'preparation' | 'junction';
export type FlowNode = {
  id: string; shape: Shape; label: string; code: string; comment?: string; line: number;
  width: number; height: number; lines: string[]; x?: number; y?: number; number?: number;
};
export type Point = { x: number; y: number };
export type FlowEdge = { id: string; source: string; target: string; label?: string; points?: Point[]; labelX?: number; labelY?: number };
export type FlowGraph = { nodes: FlowNode[]; edges: FlowEdge[]; width: number; height: number; name: string; warnings: string[] };
export type GraphOptions = { comments: boolean; hideExitReturn?: boolean; hideLoopJumps?: boolean; mergeProcesses?: boolean; overrides?: Record<string, string> };

function isExitCode(code: string): boolean {
  const values = tokenize(code).tokens.filter(token => token.kind !== 'comment').slice(1).map(token => token.value);
  // Hide only a direct status code. Evaluations such as cleanup(), ++n or a + b
  // remain visible even in main, so simplifying an exit never drops an operation.
  const simple = (tokens: string[]): boolean => {
    if (!tokens.length) return true;
    if (tokens[0] === '(' && tokens.at(-1) === ')') {
      let depth = 0;
      const enclosing = tokens.every((token, i) => {
        if (token === '(') depth++;
        if (token === ')') depth--;
        return depth > 0 || i === tokens.length - 1;
      });
      if (enclosing && depth === 0) return simple(tokens.slice(1, -1));
    }
    if (tokens.length > 1 && ['+', '-'].includes(tokens[0])) return simple(tokens.slice(1));
    return tokens.length === 1 && /^(?:[A-Za-z_]\w*|(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)[uUlL]*)$/.test(tokens[0]);
  };
  return simple(values);
}

export function wrapLabel(text: string, max = 26): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let rest = paragraph.trim();
    while (rest.length > max) {
      let cut = rest.lastIndexOf(' ', max);
      if (cut < max / 3) cut = max;
      lines.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart();
    }
    lines.push(rest);
  }
  return lines.length ? lines : [''];
}

export function sizeNode(node: FlowNode): FlowNode {
  if (node.shape === 'junction') return { ...node, width: 8, height: 8, lines: [] };
  const lines = wrapLabel(node.label, node.shape === 'decision' ? 23 : 28);
  const width = node.shape === 'decision' ? 276 : node.shape === 'terminator' ? 164 : 252;
  const height = node.shape === 'decision' ? Math.max(104, lines.length * 34 + 46) : Math.max(node.shape === 'terminator' ? 48 : 58, lines.length * 22 + 24);
  return { ...node, width, height, lines };
}

function mergeProcesses(graph: FlowGraph, candidates: Set<string>, overrides: Record<string, string> = {}): FlowGraph {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = new Map<string, FlowEdge[]>(), outgoing = new Map<string, FlowEdge[]>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
  }
  const replacements = new Map<string, string>();
  const nodes: FlowNode[] = [];
  for (const first of graph.nodes) {
    if (replacements.has(first.id)) continue;
    const group = [first];
    if (candidates.has(first.id)) {
      let current = first;
      while (group.length < 4) {
        const exits = outgoing.get(current.id) || [];
        const next = exits.length === 1 && !exits[0].label ? byId.get(exits[0].target) : undefined;
        if (!next || !candidates.has(next.id) || replacements.has(next.id) || group.includes(next) || incoming.get(next.id)?.length !== 1) break;
        group.push(next); current = next;
      }
    }
    if (group.length === 1) {
      nodes.push(first); replacements.set(first.id, first.id);
    } else {
      // A group has its own ID, so editing it never overwrites a member's label.
      const id = `group:${group.map(node => node.id).join(':')}`;
      group.forEach(node => replacements.set(node.id, id));
      nodes.push(sizeNode({ ...first, id, code: group.map(node => node.code).join(';\n'),
        label: overrides[id] ?? group.map(node => node.label).join('\n'),
        comment: group.map(node => node.comment).filter(Boolean).join('\n') || undefined }));
    }
  }
  const edges = graph.edges.flatMap(edge => {
    const source = replacements.get(edge.source)!, target = replacements.get(edge.target)!;
    return source === target && edge.source !== edge.target ? [] : [{ ...edge, source, target }];
  });
  return { ...graph, nodes, edges };
}

export function buildGraph(fn: CFunction, options: GraphOptions): FlowGraph {
  const nodes: FlowNode[] = [], edges: FlowEdge[] = [], warnings: string[] = [];
  const mergeCandidates = new Set<string>();
  let serial = 0;
  const node = (shape: Shape, code: string, statement?: Statement, label?: string): string => {
    const id = `n${serial++}`;
    const text = options.overrides?.[id] ?? label ?? (options.comments && statement?.comment ? statement.comment : code);
    nodes.push(sizeNode({ id, shape, label: text, code, comment: statement?.comment, line: statement?.line || fn.line, width: 0, height: 0, lines: [] }));
    return id;
  };
  const edge = (source: string, target: string, label?: string) => edges.push({ id: `e${edges.length}`, source, target, label });
  const end = node('terminator', 'Конец');
  type Context = { breakTo?: string; continueTo?: string };
  const sequence = (body: Statement[], next: string, context: Context): string => {
    let entry = next;
    for (let i = body.length - 1; i >= 0; i--) entry = build(body[i], entry, context);
    return entry;
  };
  const build = (s: Statement, next: string, context: Context): string => {
    if (s.kind === 'block') return sequence(s.body!, next, context);
    if (s.kind === 'statement' && !s.code) return next;
    if (s.kind === 'return' && fn.name === 'main' && options.hideExitReturn && isExitCode(s.code)) {
      // Reserve the same ID as a visible return, keeping custom labels on every
      // other node attached to the right statement when the option is toggled.
      serial++;
      return end;
    }
    if (options.hideLoopJumps && (s.kind === 'break' || s.kind === 'continue')) {
      serial++;
      return (s.kind === 'break' ? context.breakTo : context.continueTo)!;
    }
    if (s.kind === 'if') {
      const decision = node('decision', s.code, s);
      edge(decision, sequence(s.body!, next, context), 'Да');
      edge(decision, sequence(s.alternate || [], next, context), 'Нет');
      return decision;
    }
    if (['for', 'while', 'do'].includes(s.kind)) {
      const decision = node('decision', s.code || 'Истина', s);
      let repeat = decision;
      if (s.kind === 'for' && s.update) { repeat = node('process', s.update, { ...s, comment: undefined }); edge(repeat, decision); }
      const body = sequence(s.body!, repeat, { breakTo: next, continueTo: repeat });
      edge(decision, body, 'Да');
      if (s.kind !== 'for' || s.code) edge(decision, next, 'Нет');
      let entry = s.kind === 'do' ? body : decision;
      if (s.kind === 'for' && s.init) {
        const init = node('preparation', s.init, { ...s, comment: undefined }); edge(init, decision); entry = init;
      }
      return entry;
    }
    if (s.kind === 'switch') {
      const decision = node('decision', s.code, s);
      let fallthrough = next;
      const branches: { entry: string; label: string }[] = [];
      for (const branch of [...s.cases!].reverse()) {
        fallthrough = sequence(branch.body, fallthrough, { ...context, breakTo: next });
        branches.unshift({ entry: fallthrough, label: branch.value ?? 'Иначе' });
      }
      branches.forEach(branch => edge(decision, branch.entry, branch.label));
      if (!s.cases!.some(c => c.value === null)) edge(decision, next, 'Иначе');
      return decision;
    }
    let shape: Shape = 'process';
    const tokens = tokenize(s.code).tokens;
    const calls = tokens.filter((t, i) => t.kind === 'word' && tokens[i + 1]?.value === '(' && !['sizeof', '_Alignof', 'return'].includes(t.value));
    if (s.kind === 'statement') {
      if (calls.some(t => /^(scanf|printf|puts|putchar|getchar|fgets|fputs|fscanf|fprintf|fread|fwrite|gets_s)$/.test(t.value))) shape = 'data';
      else if (calls.length) shape = 'predefined';
    }
    const id = node(shape, s.code, s);
    if (s.kind === 'statement' && shape === 'process') mergeCandidates.add(id);
    if (s.kind === 'return') edge(id, end);
    else if (s.kind === 'break') edge(id, context.breakTo!);
    else if (s.kind === 'continue') edge(id, context.continueTo!);
    else edge(id, next);
    return id;
  };
  const entry = sequence(fn.body, end, {});
  const start = node('terminator', 'Начало');
  edge(start, entry);
  // Remove unreachable statements after unconditional return/break/continue,
  // including an unreachable function exit for an infinite loop.
  const reachable = new Set<string>();
  const queue = [start];
  const outgoing = new Map<string, string[]>();
  for (const e of edges) outgoing.set(e.source, [...(outgoing.get(e.source) || []), e.target]);
  while (queue.length) {
    const id = queue.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id); queue.push(...(outgoing.get(id) || []));
  }
  const visible = nodes.filter(n => reachable.has(n.id));
  if (visible.length > 500) throw new Error('Схема содержит больше 500 блоков. Выберите функцию поменьше.');
  if (nodes.some(n => !reachable.has(n.id) && n.id !== end)) warnings.push('Недостижимые операторы после return, break или continue не включены в схему.');
  const ordered = visible.sort((a, b) => a.id === start ? -1 : b.id === start ? 1 : a.id === end ? 1 : b.id === end ? -1 : a.line - b.line || Number(b.id.slice(1)) - Number(a.id.slice(1)));
  let graph: FlowGraph = { nodes: ordered, edges: edges.filter(e => reachable.has(e.source) && reachable.has(e.target)), name: fn.name, width: 0, height: 0, warnings };
  if (options.mergeProcesses) graph = mergeProcesses(graph, mergeCandidates, options.overrides);
  graph.nodes.forEach((n, i) => { n.number = i + 1; });
  return graph;
}

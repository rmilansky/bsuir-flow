import { parseC, ParseError } from './parser';
import { buildGraph, type GraphOptions } from './graph';
import { layoutGraph } from './layout';

self.onmessage = async (event: MessageEvent<{ id: number; code: string; functionName: string; options: GraphOptions }>) => {
  const { id, code, functionName, options } = event.data;
  try {
    const program = parseC(code);
    const fn = program.functions.find(f => f.name === functionName) || program.functions.find(f => f.name === 'main') || program.functions[0];
    const graph = await layoutGraph(buildGraph(fn, options));
    self.postMessage({ id, graph, functions: program.functions.map(f => ({ name: f.name, signature: f.signature })), functionName: fn.name, warnings: [...program.warnings, ...graph.warnings] });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Не удалось построить схему.', line: error instanceof ParseError ? error.line : undefined });
  }
};

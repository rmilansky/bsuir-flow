import type { FlowGraph, Shape } from './graph';

const shapes: Record<Shape, [string, string]> = {
  terminator: ['([', '])'],
  process: ['[', ']'],
  decision: ['{', '}'],
  data: ['[/', '/]'],
  predefined: ['[[', ']]'],
  preparation: ['{{', '}}'],
  junction: ['((', '))'],
};

function quoteLabel(label: string): string {
  // Mermaid uses decimal entities inside quoted labels. Escape before adding
  // line breaks so source code and manual captions cannot become HTML or syntax.
  const text = label.replace(/["#&<>\\|`]/g, character => `#${character.charCodeAt(0)};`)
    .replace(/\r\n|[\r\n\u2028\u2029]/g, '<br/>');
  return `"${text || ' '}"`;
}

export function mermaidSource(graph: FlowGraph, numbers = false): string {
  // Generated IDs also cover merged nodes (group:n1:n2) and reserved words.
  const ids = new Map(graph.nodes.map((node, index) => [node.id, `N${index + 1}`]));
  const nodes = graph.nodes.map((node, index) => {
    const [open, close] = shapes[node.shape];
    const number = node.number ?? index + 1;
    const label = node.shape === 'junction' ? (numbers ? String(number) : ' ')
      : `${numbers ? `${number}. ` : ''}${node.label}`;
    return `  ${ids.get(node.id)}${open}${quoteLabel(label)}${close}`;
  });
  const edges = graph.edges.map(edge => {
    const source = ids.get(edge.source), target = ids.get(edge.target);
    if (!source || !target) throw new Error('Не удалось экспортировать Mermaid: у стрелки отсутствует блок. Постройте схему заново.');
    const label = edge.label ? `|${quoteLabel(edge.label)}|` : '';
    return `  ${source} -->${label} ${target}`;
  });
  return ['flowchart TD', ...nodes, '', ...edges, ''].join('\n');
}

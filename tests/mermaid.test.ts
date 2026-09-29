import { describe, expect, it } from 'vitest';
import { buildGraph, type FlowGraph, type Shape } from '../src/lib/graph';
import { mermaidSource } from '../src/lib/mermaid';
import { parseC } from '../src/lib/parser';
import { examples } from '../src/lib/examples';

const graphFor = (body: string) => buildGraph(parseC(`int main(){${body}}`).functions[0], { comments: false });

describe('Mermaid export', () => {
  it('exports every block shape using quoted labels and safe IDs', () => {
    const shapeNames: Shape[] = ['terminator', 'process', 'decision', 'data', 'predefined', 'preparation', 'junction'];
    const graph: FlowGraph = { name: 'main', width: 0, height: 0, warnings: [], edges: [], nodes: shapeNames.map((shape, index) => ({
      id: index ? `group:n${index}:n${index + 1}` : 'end', shape, code: 'code', label: 'Подпись', line: 1, width: 100, height: 50, lines: ['Подпись'],
    })) };
    expect(mermaidSource(graph)).toBe('flowchart TD\n  N1(["Подпись"])\n  N2["Подпись"]\n  N3{"Подпись"}\n  N4[/"Подпись"/]\n  N5[["Подпись"]]\n  N6{{"Подпись"}}\n  N7((" "))\n\n');
  });

  it('escapes C string literals, operators, HTML, backticks and entity-like text', () => {
    const graph = graphFor('puts("hello");');
    graph.nodes[1].label = 'printf("%d\\n", a[0]); a < b && c > d | `x` #quot; <b>text</b>';
    const source = mermaidSource(graph);
    expect(source).toContain('printf(#34;%d#92;n#34;, a[0]); a #60; b #38;#38; c #62; d #124; #96;x#96; #35;quot; #60;b#62;text#60;/b#62;');
    expect(source).not.toContain('<b>');
    expect(source).not.toContain('`');
  });

  it('keeps quotes and newlines from escaping a node or edge label', () => {
    const graph = graphFor('if(a) work();');
    graph.nodes[1].label = '"]\nInjected["extra"]\r\n%%{init: {}}%%';
    graph.edges[0].label = '"|\nInjected --> end';
    const source = mermaidSource(graph);
    expect(source).toContain('#34;]<br/>Injected[#34;extra#34;]<br/>%%{init: {}}%%');
    expect(source).toContain('|"#34;#124;<br/>Injected --#62; end"|');
    expect(source.split('\n')).toHaveLength(graph.nodes.length + graph.edges.length + 3);
  });

  it('retains full captions without importing visual line wrapping', () => {
    const graph = graphFor('int n=1;');
    graph.nodes[1].label = 'Очень длинная подпись, которую предпросмотр разбивает на строки\nВторая строка';
    graph.nodes[1].lines = ['Очень длинная', 'подпись'];
    expect(mermaidSource(graph)).toContain('Очень длинная подпись, которую предпросмотр разбивает на строки<br/>Вторая строка');
  });

  it('includes numbers only when enabled and leaves connectors without repeated conditions', () => {
    const graph = graphFor('while(a ? b : c) work();');
    expect(mermaidSource(graph)).toContain('(["Начало"])');
    expect(mermaidSource(graph, true)).toContain('(["1. Начало"])');
    const connector = graph.nodes.find(node => node.shape === 'junction')!;
    expect(mermaidSource(graph, true)).toContain(`(("${connector.number}"))`);
    expect(mermaidSource(graph)).not.toContain('a ? b : c');
  });

  it('uses manual captions and simplified nodes instead of the original statements', () => {
    const fn = parseC('int main(){a=1;b=2;return 0;}').functions[0];
    const base = buildGraph(fn, { comments: false, mergeProcesses: true, hideExitReturn: true });
    const group = base.nodes.find(node => node.id.startsWith('group:'))!;
    expect(mermaidSource(base)).toContain('a=1<br/>b=2');
    const edited = buildGraph(fn, { comments: false, mergeProcesses: true, hideExitReturn: true, overrides: { [group.id]: 'Два действия' } });
    const source = mermaidSource(edited);
    expect(source).toContain('["Два действия"]');
    expect(source).not.toContain('return 0');
    expect(source).not.toContain('group:');
    expect(source).not.toContain('a=1');
  });

  it('preserves both branches even when they lead to the same destination', () => {
    const fn = parseC('int main(){return a ? 0 : 1;}').functions[0];
    const graph = buildGraph(fn, { comments: false, hideExitReturn: true });
    const source = mermaidSource(graph);
    expect(source).toContain('N2 -->|"Да"| N3');
    expect(source).toContain('N2 -->|"Нет"| N3');
  });

  it('retains self loops and exports switch labels as text', () => {
    const loop = graphFor('while(a){}');
    const index = loop.nodes.findIndex(node => node.code === 'a') + 1;
    expect(mermaidSource(loop)).toContain(`N${index} -->|"Да"| N${index}`);
    const selection = graphFor("switch(c){case '|': work(); break; default: other();}");
    expect(mermaidSource(selection)).toContain('-->|"\'#124;\'"|');
    expect(mermaidSource(selection)).toContain('-->|"Иначе"|');
  });

  it('ignores manual coordinates without changing the graph', () => {
    const graph = graphFor('work();');
    const original = structuredClone(graph);
    const positioned = { ...graph, width: 500, height: 700, nodes: graph.nodes.map(node => ({ ...node, x: 123, y: 456 })), edges: graph.edges.map(edge => ({ ...edge, points: [{ x: 1, y: 2 }, { x: 1, y: 9 }] })) };
    expect(mermaidSource(positioned)).toBe(mermaidSource(graph));
    expect(graph).toEqual(original);
  });

  it.each(examples)('keeps every node and connection in the $title example', example => {
    for (const fn of parseC(example.code).functions) {
      const graph = buildGraph(fn, { comments: true, mergeProcesses: true, hideExitReturn: true, hideLoopJumps: true });
      const source = mermaidSource(graph);
      expect(source.match(/^  N\d+(?=[\[({])/gm)).toHaveLength(graph.nodes.length);
      expect(source.match(/^  N\d+ -->/gm)).toHaveLength(graph.edges.length);
      expect(source).not.toContain('undefined');
    }
  });
});

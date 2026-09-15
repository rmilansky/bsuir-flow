import { describe, expect, it } from 'vitest';
import { parseC } from '../src/lib/parser';
import { buildGraph, type FlowGraph, type GraphOptions } from '../src/lib/graph';
import { layoutGraph } from '../src/lib/layout';

const graphFor = (body: string, options: GraphOptions = { comments: false }) => buildGraph(parseC(`int main(){\n${body}\n}`).functions[0], options);
const codes = (graph: FlowGraph) => graph.nodes.filter(node => node.shape !== 'junction').map(node => node.code);
const id = (graph: FlowGraph, code: string) => graph.nodes.find(node => node.code === code)!.id;
const connected = (graph: FlowGraph, from: string, to: string, label?: string) => {
  expect(graph.edges).toContainEqual(expect.objectContaining({ source: id(graph, from), target: id(graph, to), ...(label ? { label } : {}) }));
};

describe('ternary expressions', () => {
  it('branches an initializer and rejoins before the following action', () => {
    const graph = graphFor('int max = a > b ? a : b; print(max);');
    connected(graph, 'Начало', 'a > b');
    connected(graph, 'a > b', 'int max = a', 'Да');
    connected(graph, 'a > b', 'int max = b', 'Нет');
    connected(graph, 'int max = a', 'print(max)');
    connected(graph, 'int max = b', 'print(max)');
    expect(graph.nodes.find(node => node.code === 'a > b')?.shape).toBe('decision');
  });

  it.each(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>='])('respects assignment precedence for %s', operator => {
    const graph = graphFor(`x ${operator} c ? a : b;`);
    connected(graph, 'c', `x ${operator} a`, 'Да');
    connected(graph, 'c', `x ${operator} b`, 'Нет');
    expect(codes(graph)).not.toContain(`x ${operator} c`);
  });

  it('associates nested alternatives to the right and evaluates only the selected branch', () => {
    const graph = graphFor('x = a ? b : c ? d : e;');
    connected(graph, 'a', 'x = b', 'Да');
    connected(graph, 'a', 'c', 'Нет');
    connected(graph, 'c', 'x = d', 'Да');
    connected(graph, 'c', 'x = e', 'Нет');
  });

  it('supports nested true branches and ternaries in the condition', () => {
    const nested = graphFor('x = a ? b ? c : d : e;');
    connected(nested, 'a', 'b', 'Да');
    connected(nested, 'b', 'x = c', 'Да');
    connected(nested, 'a', 'x = e', 'Нет');
    const condition = graphFor('x = (a ? b : c) ? d : e;');
    connected(condition, 'a', '(b)', 'Да');
    connected(condition, 'a', '(c)', 'Нет');
    connected(condition, '(b)', 'x = d', 'Да');
    connected(condition, '(c)', 'x = e', 'Нет');
  });

  it('retains expression grouping in arithmetic, subscripts and call arguments', () => {
    const graph = graphFor('printf("%d ?: ;", 10 * (c ? a + b : d)); array[c ? 1 : 2] = 3;');
    expect(codes(graph)).toContain('printf("%d ?: ;", 10 * (a + b))');
    expect(codes(graph)).toContain('printf("%d ?: ;", 10 * (d))');
    expect(codes(graph)).toContain('array[1] = 3');
    expect(codes(graph)).toContain('array[2] = 3');
    expect(graph.nodes.filter(node => node.shape === 'data')).toHaveLength(2);
  });

  it('supports standalone conditional calls without evaluating the unselected call', () => {
    const graph = graphFor('ready() ? start() : stop(); after();');
    connected(graph, 'ready()', 'start()', 'Да');
    connected(graph, 'ready()', 'stop()', 'Нет');
    connected(graph, 'start()', 'after()');
    connected(graph, 'stop()', 'after()');
  });

  it('sends both conditional returns to the end and removes unreachable statements', () => {
    const graph = graphFor('return ready ? 0 : 1; never();');
    connected(graph, 'ready', 'return 0', 'Да');
    connected(graph, 'ready', 'return 1', 'Нет');
    connected(graph, 'return 0', 'Конец');
    connected(graph, 'return 1', 'Конец');
    expect(codes(graph)).not.toContain('never()');
    const simple = graphFor('return ready ? 0 : cleanup();', { comments: false, hideExitReturn: true });
    connected(simple, 'ready', 'Конец', 'Да');
    connected(simple, 'ready', 'return cleanup()', 'Нет');
    const fn = parseC('int helper(){ return ready ? 0 : 1; }').functions[0];
    expect(codes(buildGraph(fn, { comments: false, hideExitReturn: true }))).toContain('return 0');
  });

  it('uses the source comment once and keeps branch values readable', () => {
    const body = '// Выбрать максимум\nint max = a > b ? a : b;';
    const graph = graphFor(body, { comments: true });
    expect(graph.nodes.filter(node => node.label === 'Выбрать максимум')).toHaveLength(1);
    expect(graph.nodes.find(node => node.code === 'a > b')).toMatchObject({ label: 'Выбрать максимум', line: 3 });
    expect(graph.nodes.find(node => node.code === 'int max = a')?.label).toBe('int max = a');
    expect(graphFor(body).nodes.find(node => node.code === 'a > b')?.label).toBe('a > b');
  });

  it('preserves manual labels when return simplification is toggled', () => {
    const body = 'return ready ? 0 : 1;';
    const original = graphFor(body);
    const decision = id(original, 'ready');
    const simple = graphFor(body, { comments: true, hideExitReturn: true, overrides: { [decision]: 'Всё готово?' } });
    expect(simple.nodes.find(node => node.code === 'ready')).toMatchObject({ id: decision, label: 'Всё готово?' });
    expect(simple.edges.filter(edge => edge.source === decision).map(edge => edge.label)).toEqual(['Да', 'Нет']);
  });

  it.each(['&&', '||'])('preserves short-circuit evaluation around %s', operator => {
    const graph = graphFor(`x = ready() ${operator} (check() ? yes() : no());`);
    connected(graph, 'Начало', 'ready()');
    const skip = graph.edges.find(edge => edge.source === id(graph, 'ready()') && edge.label === (operator === '&&' ? 'Нет' : 'Да'))!;
    expect(graph.nodes.find(node => node.id === skip.target)?.code).toBe(`x = ${operator === '&&' ? '0' : '1'}`);
    const evaluate = graph.edges.find(edge => edge.source === id(graph, 'ready()') && edge.label === (operator === '&&' ? 'Да' : 'Нет'))!;
    expect(graph.nodes.find(node => node.id === evaluate.target)?.code).toBe('check()');
  });

  it('preserves comma sequencing before the condition and inside a selected branch', () => {
    const graph = graphFor('x = (setup(), check() ? a : b);');
    connected(graph, 'Начало', 'setup()');
    connected(graph, 'setup()', 'check()');
    expect(codes(graph)).toContain('x = (a)');
    const returned = graphFor('return setup(), check() ? a : b;');
    connected(returned, 'setup()', 'check()');
    connected(returned, 'check()', 'return a', 'Да');
    const branch = graphFor('x = ready ? first(), second() : other();');
    connected(branch, 'ready', 'x = (first(), second())', 'Да');
  });

  it('initializes earlier declarators before a later conditional initializer', () => {
    const graph = graphFor('int a = 1, b = a ? 2 : 3;');
    connected(graph, 'Начало', 'int a = 1');
    connected(graph, 'int a = 1', 'a');
    connected(graph, 'a', 'int b = 2', 'Да');
    connected(graph, 'a', 'int b = 3', 'Нет');
  });

  it('keeps multiplication before a comma distinct from a declaration', () => {
    const graph = graphFor('a * b, ready ? yes() : no();');
    connected(graph, 'a * b', 'ready');
    connected(graph, 'ready', 'yes()', 'Да');
    connected(graph, 'ready', 'no()', 'Нет');
  });

  it('does not interpret literal punctuation or unevaluated sizeof operands as branches', () => {
    const graph = graphFor('puts("?:"); char c = \'?\'; int n = sizeof(flag ? yes() : no());');
    expect(graph.nodes.some(node => node.shape === 'decision')).toBe(false);
    expect(codes(graph)).toContain('int n = sizeof(flag ? yes() : no())');
    const mixed = graphFor('n = sizeof(a ? b : c) + (d ? e : f);');
    expect(mixed.nodes.filter(node => node.shape === 'decision').map(node => node.code)).toEqual(['d']);
  });

  it('uses the selected value in if and switch without duplicating their bodies', () => {
    const conditional = graphFor('if(a ? b : c) yes(); else no();');
    connected(conditional, 'a', 'b', 'Да');
    connected(conditional, 'b', 'yes()', 'Да');
    connected(conditional, 'c', 'no()', 'Нет');
    expect(codes(conditional).filter(code => code === 'yes()')).toHaveLength(1);
    const selection = graphFor('switch(a ? b : c){case 1: yes(); break; default: no();}');
    connected(selection, 'a', 'b', 'Да');
    connected(selection, 'b', 'yes()', '1');
    connected(selection, 'c', 'no()', 'Иначе');
    expect(codes(selection).filter(code => code === 'yes()')).toHaveLength(1);
  });

  it('does not confuse a conditional constant in case with the case delimiter', () => {
    const fn = parseC('int main(){switch(x){case 1 ? 2 : 3: work(); break;}}').functions[0];
    expect(fn.body[0].cases?.[0].value).toBe('1 ? 2 : 3');
  });

  it.each(['while(a ? b : c){work(); continue;}', 'do {work(); continue;} while(a ? b : c);', 'for(i = a ? 0 : 1; a ? b : c; a ? i++ : i--){work(); continue;}'])('lays out conditional loop parts and continues through their next evaluation: %s', async body => {
    const graph = await layoutGraph(graphFor(body));
    const jump = graph.edges.find(edge => edge.source === id(graph, 'continue'))!;
    expect(graph.nodes.find(node => node.id === jump.target)?.shape).toMatch(/decision|junction/);
    expect(graph.edges.every(edge => edge.points!.length > 1)).toBe(true);
    expect(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });

  it('routes for initialization, continue and both updates through the correct condition', () => {
    const graph = graphFor('for(i = initial ? 0 : 1; test ? left : right; step ? i++ : i--){continue;}');
    connected(graph, 'initial', 'i = 0', 'Да');
    connected(graph, 'initial', 'i = 1', 'Нет');
    connected(graph, 'continue', 'step');
    connected(graph, 'step', 'i++', 'Да');
    connected(graph, 'step', 'i--', 'Нет');
    const anchor = graph.nodes.find(node => node.shape === 'junction')!;
    for (const code of ['i = 0', 'i = 1', 'i++', 'i--']) {
      expect(graph.edges).toContainEqual(expect.objectContaining({ source: id(graph, code), target: anchor.id }));
    }
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: anchor.id, target: id(graph, 'test') }));
  });

  it.each(['x = a ? b;', 'x = a ? : b;', 'x = a ? b :;', 'x = ? a : b;', 'x = a ? b ? c : d;'])('reports a malformed conditional: %s', body => {
    expect(() => graphFor(body)).toThrow('тернарном');
  });

  it('limits expansion before a large expression exhausts memory', () => {
    expect(() => graphFor(`printf(${Array.from({ length: 14 }, (_, i) => `(a${i} ? 1 : 0)`).join(', ')});`)).toThrow(/слишком много веток|больше 500 блоков/);
  });
});

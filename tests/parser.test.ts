import { describe, expect, it } from 'vitest';
import { parseC } from '../src/lib/parser';
import { buildGraph } from '../src/lib/graph';
import { layoutGraph } from '../src/lib/layout';
import { examples } from '../src/lib/examples';

function graphFor(body: string, comments = true) {
  return buildGraph(parseC(`int main(void) { ${body} }`).functions[0], { comments });
}

describe('structural C parser', () => {
  it('extracts functions without confusing prototypes, globals and aggregate initializers', () => {
    const program = parseC('struct Pair { int a; int b; }; int nums[] = {1,2}; int f(int); int f(int n){return n;} int main(void){return f(1);}');
    expect(program.functions.map(f => f.name)).toEqual(['f', 'main']);
    expect(program.functions[0].body[0].code).toBe('return n');
  });
  it('keeps punctuation, comment markers and escaped quotes in string literals', () => {
    const fn = parseC('int main(){ puts("// not a comment; } \\\" /*"); char c = \'}\'; return 0; }').functions[0];
    expect(fn.body).toHaveLength(3);
    expect(fn.body[0].comment).toBeUndefined();
  });
  it('attaches preceding and trailing comments to the correct statement', () => {
    const fn = parseC(`int main(){
      // Ввести n
      scanf("%d", &n);
      n++; // Увеличить n
      /* @label Готово */
      return 0;
    }`).functions[0];
    expect(fn.body.map(s => s.comment)).toEqual(['Ввести n', 'Увеличить n', 'Готово']);
  });
  it('supports empty blocks, dangling else and body statements without braces', () => {
    const fn = parseC('int main(){ if(a) if(b) a++; else b++; while(a) {} ; return 0; }').functions[0];
    expect(fn.body[0].alternate).toBeUndefined();
    expect(fn.body[0].body![0].alternate![0].code).toBe('b++');
  });
  it('preserves leading comments inside switch branches', () => {
    const fn = parseC('int main(){ switch(x){case 1:\n// Действие\nwork(); break;} }').functions[0];
    expect(fn.body[0].cases![0].body[0].comment).toBe('Действие');
  });
  it('parses compound literals and arrays inside a statement', () => {
    const fn = parseC('int main(){ int a[2] = {1,2}; f((int[]){3,4}); }').functions[0];
    expect(fn.body).toHaveLength(2);
  });
  it.each([
    ['int main(){ int a = 1 }', 'скобка'],
    ['int main(){ if () a++; }', 'пустым'],
    ['int main(){ /* nope', 'комментарий'],
    ['int main(){ puts("nope); }', 'строка'],
    ['int main(){ break; }', 'break'],
    ['int main(){ continue; }', 'continue'],
    ['int main(){ goto end; end: return 0; }', 'goto'],
    ['int main(){ target: return 0; }', 'Метки'],
    ['#ifdef TEST\nint main(){}\n#endif', 'компиляция'],
    ['printf("Hello");', 'функция'],
  ])('reports unsupported or malformed source: %s', (source, message) => {
    expect(() => parseC(source)).toThrow(message);
  });
  it('records source lines and warns about unexpanded macros', () => {
    const program = parseC('#define N 10\n#include <stdio.h>\nint main(){\n return N;\n}');
    expect(program.warnings).toHaveLength(1);
    expect(program.functions[0].body[0].line).toBe(4);
  });
  it('rejects excessive input and nesting before overflowing the stack', () => {
    expect(() => parseC(' '.repeat(60001))).toThrow('слишком большой');
    expect(() => parseC(`int main(){${'{'.repeat(101)}${'}'.repeat(101)}}`)).toThrow('вложенность');
  });
});

describe('control flow graph', () => {
  it('replaces loop jumps with their actual destinations and removes unreachable statements', () => {
    const fn = parseC('int main(){ for(int i=0;i<10;i++){ if(i==2) continue; if(i==5) break; work(); continue; never(); } after(); }').functions[0];
    const graph = buildGraph(fn, { comments: false, hideLoopJumps: true });
    const id = (code: string) => graph.nodes.find(node => node.code === code)!.id;
    expect(graph.nodes.some(node => ['break', 'continue', 'never()'].includes(node.code))).toBe(false);
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('i==2'), target: id('i++'), label: 'Да' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('i==5'), target: id('after()'), label: 'Да' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('work()'), target: id('i++') }));
  });
  it('keeps switch break distinct from loop continue when replacing jumps', () => {
    const fn = parseC('int main(){ while(run){ switch(x){case 1:a(); case 2:b(); break; default:continue;} c(); } }').functions[0];
    const graph = buildGraph(fn, { comments: false, hideLoopJumps: true });
    const id = (code: string) => graph.nodes.find(node => node.code === code)!.id;
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('a()'), target: id('b()') }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('b()'), target: id('c()') }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: id('x'), target: id('run'), label: 'Иначе' }));
    expect(graph.warnings).toEqual([]);
  });
  it('preserves an empty do-while loop when its continue block is hidden', async () => {
    const fn = parseC('int main(){ do { continue; } while(again); }').functions[0];
    const graph = await layoutGraph(buildGraph(fn, { comments: false, hideLoopJumps: true, mergeProcesses: true }));
    const loop = graph.nodes.find(node => node.code === 'again')!;
    expect(graph.edges).toContainEqual(expect.objectContaining({ source: loop.id, target: loop.id, label: 'Да' }));
    expect(graph.edges.every(edge => edge.points!.length > 1)).toBe(true);
  });
  it('groups up to four consecutive actions in source order without losing comments', () => {
    const fn = parseC('int main(){\n// Начать\nint a=0;\na++;\n// Удвоить\na*=2;\na-=1;\na=7;\nreturn 0; }').functions[0];
    const graph = buildGraph(fn, { comments: true, mergeProcesses: true });
    const group = graph.nodes.find(node => node.id.startsWith('group:'))!;
    expect(group.code).toBe('int a=0;\na++;\na*=2;\na-=1');
    expect(group.label).toBe('Начать\na++\nУдвоить\na-=1');
    expect(graph.nodes.map(node => node.code)).toEqual(['Начало', group.code, 'a=7', 'return 0', 'Конец']);
    expect(graph.nodes.map(node => node.number)).toEqual([1, 2, 3, 4, 5]);
    const plain = buildGraph(fn, { comments: false, mergeProcesses: true });
    expect(plain.nodes.find(node => node.id === group.id)?.label).toBe('int a=0\na++\na*=2\na-=1');
  });
  it('keeps calls, input/output and returns outside merged action blocks', () => {
    const fn = parseC('int helper(){ a=1; b=2; puts("a"); a++; b++; work(); c++; d++; return 42; }').functions[0];
    const graph = buildGraph(fn, { comments: false, mergeProcesses: true, hideExitReturn: true });
    expect(graph.nodes.filter(node => node.id.startsWith('group:'))).toHaveLength(3);
    expect(graph.nodes.filter(node => ['data', 'predefined'].includes(node.shape)).map(node => node.code)).toEqual(['puts("a")', 'work()']);
    expect(graph.nodes.some(node => node.code === 'return 42')).toBe(true);
  });
  it('never pulls shared actions into just one branch when merging', async () => {
    const fn = parseC('int main(){ if(a){x=1;y=2;} else {x=3;y=4;} z=5;w=6;return 0; }').functions[0];
    const graph = await layoutGraph(buildGraph(fn, { comments: false, mergeProcesses: true, hideExitReturn: true }));
    const shared = graph.nodes.find(node => node.code === 'z=5;\nw=6')!;
    expect(graph.edges.filter(edge => edge.target === shared.id)).toHaveLength(2);
    expect(graph.nodes.filter(node => node.id.startsWith('group:'))).toHaveLength(3);
    expect(graph.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
  });
  it('keeps the for increment separate from merged body and following statements', () => {
    const fn = parseC('int main(){ for(i=0;i<2;i++){a++;b++;}c++;d++; }').functions[0];
    const graph = buildGraph(fn, { comments: false, mergeProcesses: true });
    expect(graph.nodes.some(node => node.code === 'i++')).toBe(true);
    expect(graph.nodes.filter(node => node.id.startsWith('group:')).map(node => node.code)).toEqual(['a++;\nb++', 'c++;\nd++']);
  });
  it('keeps labels for merged groups and individual blocks independent', () => {
    const fn = parseC('int main(){ a=1; b=2; return 0; }').functions[0];
    const original = buildGraph(fn, { comments: true });
    const first = original.nodes.find(node => node.code === 'a=1')!;
    const overrides = { [first.id]: 'Первое действие' };
    const merged = buildGraph(fn, { comments: true, mergeProcesses: true, overrides });
    const group = merged.nodes.find(node => node.id.startsWith('group:'))!;
    expect(group.label).toBe('Первое действие\nb=2');
    overrides[group.id] = 'Два действия';
    const compact = buildGraph(fn, { comments: true, mergeProcesses: true, hideExitReturn: true, overrides });
    expect(compact.nodes.find(node => node.id === group.id)?.label).toBe('Два действия');
    const expanded = buildGraph(fn, { comments: true, overrides });
    expect(expanded.nodes.find(node => node.id === first.id)?.label).toBe('Первое действие');
    expect(expanded.nodes.find(node => node.code === 'b=2')?.label).toBe('b=2');
  });
  it('optionally collapses an exit code in main directly into the end', () => {
    const fn = parseC('int main(){ work(); return 0; }').functions[0];
    const original = buildGraph(fn, { comments: true });
    const compact = buildGraph(fn, { comments: true, hideExitReturn: true });
    expect(original.nodes.some(n => n.code === 'return 0')).toBe(true);
    expect(compact.nodes.some(n => n.code.startsWith('return'))).toBe(false);
    const work = compact.nodes.find(n => n.code === 'work()')!;
    const end = compact.nodes.find(n => n.code === 'Конец')!;
    expect(compact.edges.some(e => e.source === work.id && e.target === end.id)).toBe(true);
    expect(compact.warnings).toEqual([]);
  });
  it('sends early exits in branches and loops to the end without continuing execution', () => {
    const fn = parseC('int main(){ while(run){ if(error) return -1; work(); } return (0); never(); }').functions[0];
    const graph = buildGraph(fn, { comments: true, hideExitReturn: true });
    const decision = graph.nodes.find(n => n.code === 'error')!;
    const end = graph.nodes.find(n => n.code === 'Конец')!;
    expect(graph.edges.some(e => e.source === decision.id && e.label === 'Да' && e.target === end.id)).toBe(true);
    expect(graph.nodes.some(n => n.code === 'never()')).toBe(false);
    expect(graph.nodes.some(n => n.code.startsWith('return'))).toBe(false);
  });
  it('keeps return values in helper functions when exit codes are hidden', () => {
    const fn = parseC('int helper(){ return 42; }').functions[0];
    expect(buildGraph(fn, { comments: true, hideExitReturn: true }).nodes.some(n => n.code === 'return 42')).toBe(true);
  });
  it.each(['return cleanup()', 'return ++status', 'return (a + 1)', 'return (cleanup(), 0)'])('preserves evaluation of %s in main', code => {
    const fn = parseC(`int main(){ ${code}; }`).functions[0];
    expect(buildGraph(fn, { comments: true, hideExitReturn: true }).nodes.some(n => n.code === code)).toBe(true);
  });
  it('keeps node IDs and manual labels stable when hiding return blocks', () => {
    const fn = parseC('int main(){ work(); return EXIT_SUCCESS; }').functions[0];
    const original = buildGraph(fn, { comments: true });
    const work = original.nodes.find(n => n.code === 'work()')!;
    const compact = buildGraph(fn, { comments: true, hideExitReturn: true, overrides: { [work.id]: 'Моя подпись' } });
    expect(compact.nodes.find(n => n.code === 'work()')).toMatchObject({ id: work.id, label: 'Моя подпись' });
    expect(compact.nodes.some(n => n.code.startsWith('return'))).toBe(false);
  });
  it('lays out a function containing only a hidden return as start → end', async () => {
    const fn = parseC('int main(){ return 0; }').functions[0];
    const graph = await layoutGraph(buildGraph(fn, { comments: false, hideExitReturn: true }));
    expect(graph.nodes.map(n => n.code)).toEqual(['Начало', 'Конец']);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].points!.length).toBeGreaterThan(1);
  });
  it('routes return straight to the end and removes unreachable code', () => {
    const graph = graphFor('return 1; puts("never");');
    expect(graph.nodes.some(n => n.code.includes('never'))).toBe(false);
    const returned = graph.nodes.find(n => n.code === 'return 1')!;
    const edge = graph.edges.find(e => e.source === returned.id)!;
    expect(graph.nodes.find(n => n.id === edge.target)?.label).toBe('Конец');
    expect(graph.warnings).toHaveLength(1);
  });
  it('preserves both if branches and joins them at the next statement', () => {
    const graph = graphFor('if (a > b) a++; else b++; puts("done");');
    const decision = graph.nodes.find(n => n.shape === 'decision')!;
    const branches = graph.edges.filter(e => e.source === decision.id);
    expect(branches.map(e => e.label)).toEqual(['Да', 'Нет']);
    const targets = branches.map(branch => graph.edges.find(e => e.source === branch.target)?.target);
    expect(new Set(targets).size).toBe(1);
    expect(graph.nodes.find(n => n.id === targets[0])?.code).toBe('puts("done")');
  });
  it('routes continue in a for loop through the increment and break outside the loop', () => {
    const graph = graphFor('for(int i=0; i<10; i++){ if(i==2) continue; if(i==5) break; work(); } after();');
    const continueNode = graph.nodes.find(n => n.code === 'continue')!;
    const increment = graph.nodes.find(n => n.code === 'i++')!;
    const breakNode = graph.nodes.find(n => n.code === 'break')!;
    const after = graph.nodes.find(n => n.code === 'after()')!;
    expect(graph.edges.some(e => e.source === continueNode.id && e.target === increment.id)).toBe(true);
    expect(graph.edges.some(e => e.source === breakNode.id && e.target === after.id)).toBe(true);
  });
  it('enters do-while at its body and routes continue to the condition', () => {
    const graph = graphFor('do { work(); continue; } while (again);');
    const start = graph.nodes.find(n => n.label === 'Начало')!;
    const work = graph.nodes.find(n => n.code === 'work()')!;
    expect(graph.edges.some(e => e.source === start.id && e.target === work.id)).toBe(true);
    const cont = graph.nodes.find(n => n.code === 'continue')!;
    const condition = graph.nodes.find(n => n.code === 'again')!;
    expect(graph.edges.some(e => e.source === cont.id && e.target === condition.id)).toBe(true);
  });
  it('does not invent an exit from for (;;)', () => {
    const graph = graphFor('for(;;) work(); after();');
    expect(graph.nodes.some(n => n.label === 'Конец')).toBe(false);
    expect(graph.nodes.some(n => n.code === 'after()')).toBe(false);
    expect(graph.edges.some(e => e.label === 'Нет')).toBe(false);
  });
  it('preserves switch fallthrough and scoped break/continue', () => {
    const graph = graphFor('while(run){ switch(x){case 1: a(); case 2: b(); break; default: continue;} c(); }');
    const a = graph.nodes.find(n => n.code === 'a()')!;
    const b = graph.nodes.find(n => n.code === 'b()')!;
    const c = graph.nodes.find(n => n.code === 'c()')!;
    const br = graph.nodes.find(n => n.code === 'break')!;
    const cont = graph.nodes.find(n => n.code === 'continue')!;
    const loop = graph.nodes.find(n => n.code === 'run')!;
    expect(graph.edges.some(e => e.source === a.id && e.target === b.id)).toBe(true);
    expect(graph.edges.some(e => e.source === br.id && e.target === c.id)).toBe(true);
    expect(graph.edges.some(e => e.source === cont.id && e.target === loop.id)).toBe(true);
  });
  it('uses comments only when enabled and detects calls outside strings', () => {
    const body = '\n// Прибавить один\nx++; char *s = "printf(hello)"; int n = compute();';
    expect(graphFor(body).nodes.some(n => n.label === 'Прибавить один')).toBe(true);
    expect(graphFor(body, false).nodes.some(n => n.label === 'x++')).toBe(true);
    expect(graphFor(body).nodes.find(n => n.code.startsWith('char'))?.shape).toBe('process');
    expect(graphFor(body).nodes.find(n => n.code.startsWith('int n'))?.shape).toBe('predefined');
  });
  it.each(examples)('lays out the $title example with orthogonal edges and finite coordinates', async example => {
    for (const fn of parseC(example.code).functions) {
      const graph = await layoutGraph(buildGraph(fn, { comments: true }));
      expect(graph.width).toBeGreaterThan(0); expect(graph.height).toBeGreaterThan(0);
      for (const node of graph.nodes) { expect(Number.isFinite(node.x)).toBe(true); expect(Number.isFinite(node.y)).toBe(true); }
      for (const edge of graph.edges) {
        expect(edge.points!.length).toBeGreaterThan(1);
        for (let i = 1; i < edge.points!.length; i++) {
          const a = edge.points![i - 1], b = edge.points![i];
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
    }
  });
});

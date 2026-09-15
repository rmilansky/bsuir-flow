import { ParseError, tokenize } from './parser';

export type ExpressionPlan =
  | { kind: 'value'; code: string }
  | { kind: 'choice'; condition: ExpressionPlan; yes: ExpressionPlan; no: ExpressionPlan }
  | { kind: 'sequence'; steps: ExpressionPlan[] }
  | { kind: 'template'; parts: (string | { value: ExpressionPlan; group?: boolean })[] };

const assignments = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
const typeWords = new Set(['void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', '_Bool', 'bool', 'const', 'volatile', 'restrict', 'static', 'extern', 'register', 'auto', '_Atomic']);

// Keep the original spelling of ordinary expressions. Only expressions that
// contain an evaluated ?: need to be lowered into control flow.
export function planExpression(code: string, line: number): ExpressionPlan | undefined {
  const tokens = tokenize(code).tokens.filter(token => token.kind !== 'comment');
  if (!tokens.some(token => token.kind === 'symbol' && token.value === '?')) return;
  const paired = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(tokens[i].value)) stack.push(i);
    else if ([')', ']', '}'].includes(tokens[i].value)) {
      const open = stack.pop();
      if (open === undefined || '([{'.indexOf(tokens[open].value) !== ')]}'.indexOf(tokens[i].value)) {
        throw new ParseError('Проверьте скобки в тернарном выражении.', line);
      }
      paired.set(open, i); paired.set(i, open);
    }
  }
  if (stack.length) throw new ParseError('Проверьте скобки в тернарном выражении.', line);
  const text = (from: number, to: number) => from < to ? code.slice(tokens[from].start, tokens[to - 1].end).trim() : '';
  const value = (from: number, to: number): ExpressionPlan => ({ kind: 'value', code: text(from, to) });
  const changed = (plan: ExpressionPlan) => plan.kind !== 'value';
  const template = (parts: (string | { value: ExpressionPlan; group?: boolean })[]): ExpressionPlan => ({ kind: 'template', parts });
  const syntaxError = (at: number): never => {
    throw new ParseError('В тернарном операторе нужны условие и обе ветки: условие ? значение1 : значение2.', line + (tokens[at]?.line || 1) - 1);
  };

  const declarationPrefix = (from: number, to: number): string => {
    let i = from;
    while (i < to && typeWords.has(tokens[i].value)) i++;
    if (['struct', 'union', 'enum'].includes(tokens[i]?.value)) i += 2;
    else if (i === from && tokens[i]?.kind === 'word' && (tokens[i + 1]?.kind === 'word'
      || (tokens[i + 1]?.value === '*' && tokens.slice(from, to).some(token => token.value === '=')))) i++;
    while (i < to && typeWords.has(tokens[i].value)) i++;
    return i > from ? text(from, i) + ' ' : '';
  };

  const parse = (from: number, to: number, depth = 0, argumentsList = false): ExpressionPlan => {
    if (depth > 100) throw new ParseError('Слишком глубокая вложенность выражения (больше 100 уровней).', line);
    if (from >= to) return value(from, to);
    if (!tokens.slice(from, to).some(token => token.kind === 'symbol' && token.value === '?')) return value(from, to);
    const top: number[] = [], commas: number[] = [];
    let question = -1, colon = -1, pending = 0;
    for (let i = from; i < to; i++) {
      if (paired.has(i) && paired.get(i)! > i) { i = paired.get(i)!; continue; }
      if (tokens[i].kind !== 'symbol') continue;
      const operator = tokens[i].value;
      if (!pending) {
        top.push(i);
        if (operator === ',') commas.push(i);
      }
      if (operator === '?') { if (question < 0) question = i; pending++; }
      else if (operator === ':') {
        if (!pending) syntaxError(i);
        if (--pending === 0 && colon < 0) colon = i;
      }
    }
    if (pending) syntaxError(question);

    if (tokens[from].value === 'return') {
      const result = parse(from + 1, to, depth + 1);
      return changed(result) ? template(['return ', { value: result }]) : value(from, to);
    }
    if (commas.length) {
      const boundaries = [from - 1, ...commas, to];
      const prefix = argumentsList ? '' : declarationPrefix(from, commas[0]);
      const steps = boundaries.slice(0, -1).map((boundary, i) => {
        const step = parse(boundary + 1, boundaries[i + 1], depth + 1);
        return i && prefix ? (step.kind === 'value' ? { ...step, code: prefix + step.code } : template([prefix, { value: step }])) : step;
      });
      if (!steps.some(changed)) return value(from, to);
      if (!argumentsList) return { kind: 'sequence', steps };
      return template(steps.flatMap((step, i) => i ? [', ', { value: step, group: true }] : [{ value: step, group: true }]));
    }

    const assignment = top.find(i => assignments.has(tokens[i].value) && (question < 0 || i < question));
    if (assignment !== undefined) {
      if (assignment === from || assignment === to - 1) syntaxError(assignment);
      const left = parse(from, assignment, depth + 1), right = parse(assignment + 1, to, depth + 1);
      return changed(left) || changed(right) ? template([
        { value: left }, code.slice(tokens[assignment - 1].end, tokens[assignment + 1]?.start ?? tokens[assignment].end), { value: right, group: true },
      ]) : value(from, to);
    }
    if (question >= 0) {
      if (question === from || colon <= question + 1 || colon === to - 1) syntaxError(question);
      return { kind: 'choice', condition: parse(from, question, depth + 1), yes: parse(question + 1, colon, depth + 1), no: parse(colon + 1, to, depth + 1) };
    }
    for (const operator of ['||', '&&']) {
      const split = [...top].reverse().find(i => tokens[i].value === operator);
      if (split === undefined) continue;
      const left = parse(from, split, depth + 1), right = parse(split + 1, to, depth + 1);
      if (!changed(left) && !changed(right)) return value(from, to);
      const boolean = template(['!!(', { value: right }, ')']);
      return { kind: 'choice', condition: left, yes: operator === '&&' ? boolean : { kind: 'value', code: '1' }, no: operator === '&&' ? { kind: 'value', code: '0' } : boolean };
    }

    const parts: (string | { value: ExpressionPlan })[] = [];
    let cursor = tokens[from].start;
    for (let i = from; i < to; i++) {
      const close = paired.get(i);
      if (close === undefined || close < i) continue;
      const previous = tokens[i - 1]?.value;
      // sizeof's expression operand is unevaluated; spelling a ?: there must
      // not introduce calls or branches that the program would never execute.
      if (['sizeof', '_Alignof', 'alignof'].includes(previous)) { i = close; continue; }
      let isCall = tokens[i - 1]?.kind === 'word' || previous === ')' || previous === ']';
      if (previous === ')') {
        const open = paired.get(i - 1)!;
        const type = tokens.slice(open + 1, i - 1);
        if (type.some(token => typeWords.has(token.value)) && type.every(token => typeWords.has(token.value) || token.value === '*')) isCall = false;
      }
      const inner = parse(i + 1, close, depth + 1, tokens[i].value === '{' || (tokens[i].value === '(' && isCall));
      if (changed(inner)) {
        parts.push(code.slice(cursor, tokens[i].end), { value: inner });
        cursor = tokens[close].start;
      }
      i = close;
    }
    if (!parts.length) return value(from, to);
    parts.push(code.slice(cursor, tokens[to - 1].end));
    return template(parts);
  };
  const result = parse(0, tokens.length);
  return changed(result) ? result : undefined;
}

export function groupExpression(code: string): string {
  const tokens = tokenize(code).tokens;
  let depth = 0;
  for (const token of tokens) {
    if (token.kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(token.value)) depth++;
    else if ([')', ']', '}'].includes(token.value)) depth--;
    else if (!depth && token.value === ',') return `(${code})`;
  }
  return code;
}

export type Token = { value: string; kind: 'word' | 'string' | 'symbol' | 'comment'; start: number; end: number; line: number; endLine: number };
export type Statement = {
  kind: 'block' | 'statement' | 'if' | 'for' | 'while' | 'do' | 'switch' | 'return' | 'break' | 'continue';
  code: string;
  line: number;
  comment?: string;
  body?: Statement[];
  alternate?: Statement[];
  init?: string;
  update?: string;
  cases?: { value: string | null; body: Statement[]; line: number }[];
};
export type CFunction = { name: string; signature: string; line: number; body: Statement[] };
export type CProgram = { functions: CFunction[]; warnings: string[] };

export class ParseError extends Error {
  constructor(message: string, public line: number) {
    super(message);
    this.name = 'ParseError';
  }
}

export function tokenize(source: string): { tokens: Token[]; warnings: string[] } {
  if (source.length > 60_000) throw new ParseError('Код слишком большой. Максимум — 60 000 символов.', 1);
  const tokens: Token[] = [];
  const warnings: string[] = [];
  let i = 0, line = 1;
  while (i < source.length) {
    if (/\s/.test(source[i])) { if (source[i] === '\n') line++; i++; continue; }
    const start = i, startLine = line;
    let kind: Token['kind'] = 'symbol';
    if (source[i] === '#') {
      let directive = '';
      do {
        const end = source.indexOf('\n', i);
        const part = source.slice(i, end < 0 ? source.length : end);
        directive += part;
        i = end < 0 ? source.length : end + 1;
        if (end >= 0) line++;
        if (!part.trimEnd().endsWith('\\')) break;
      } while (i < source.length);
      if (/^#\s*(if|ifdef|ifndef|elif|else|endif)\b/.test(directive)) {
        throw new ParseError('Условная компиляция пока не поддерживается. Оставьте нужную ветку #if в исходном коде.', startLine);
      }
      if (!/^#\s*include\b/.test(directive)) warnings.push('Директивы препроцессора не раскрываются. Макросы показаны как записаны; макросы с ветвлениями и циклами нужно раскрыть вручную.');
      continue;
    }
    if (source.startsWith('//', i)) {
      kind = 'comment';
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end;
    } else if (source.startsWith('/*', i)) {
      kind = 'comment';
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new ParseError('Не закрыт комментарий /* … */.', line);
      i = end + 2;
      line += (source.slice(start, i).match(/\n/g) || []).length;
    } else if (source[i] === '"' || source[i] === "'") {
      kind = 'string';
      const quote = source[i++];
      let closed = false;
      while (i < source.length) {
        if (source[i] === '\\') { if (source[i + 1] === '\n') line++; i += 2; continue; }
        if (source[i] === '\n') throw new ParseError('Не закрыта строка или символьный литерал.', startLine);
        if (source[i++] === quote) { closed = true; break; }
      }
      if (!closed) throw new ParseError('Не закрыта строка или символьный литерал.', startLine);
    } else if (/[\w$]/.test(source[i])) {
      kind = 'word';
      while (i < source.length && /[\w.$]/.test(source[i])) i++;
    } else {
      const operator = /^(>>=|<<=|\.\.\.|\+\+|--|->|==|!=|<=|>=|&&|\|\||\+=|-=|\*=|\/=|%=|<<|>>|&=|\|=|\^=)/.exec(source.slice(i));
      i += operator?.[0].length || 1;
    }
    tokens.push({ value: source.slice(start, i), kind, start, end: i, line: startLine, endLine: line });
    if (tokens.length > 18_000) throw new ParseError('Слишком много элементов кода. Разделите программу на файлы.', line);
  }
  return { tokens, warnings: [...new Set(warnings)] };
}

function cleanComment(value: string): string {
  return value.replace(/^\/\/\s?|^\/\*+|\*+\/$/g, '').split('\n')
    .map(line => line.replace(/^\s*\*\s?/, '').trim()).join(' ').replace(/^@(?:label|block)\s*:?\s*/i, '').trim();
}

class Parser {
  index = 0;
  depth = 0;
  count = 0;
  loopDepth = 0;
  switchDepth = 0;
  constructor(public tokens: Token[], private source: string) {}
  peek(value?: string): boolean { return value === undefined ? this.index < this.tokens.length : this.tokens[this.index]?.value === value; }
  current(): Token { return this.tokens[this.index] || this.tokens[this.tokens.length - 1] || { line: 1 } as Token; }
  expect(value: string): Token {
    if (!this.peek(value)) throw new ParseError(`Ожидалось «${value}»${this.peek() ? `, найдено «${this.current().value}»` : ', но код закончился'}.`, this.current().line);
    return this.tokens[this.index++];
  }
  comments(sameLine?: number): string {
    const comments: string[] = [];
    while (this.current()?.kind === 'comment' && this.peek() && (sameLine === undefined || this.current().line === sameLine)) {
      comments.push(cleanComment(this.tokens[this.index++].value));
    }
    return comments.filter(Boolean).join(' ');
  }
  code(tokens: Token[]): string {
    let result = '', previous: Token | undefined;
    for (const token of tokens) {
      if (token.kind === 'comment') continue;
      if (previous && (token.start > previous.end) && /\s|\/\*/.test(this.source.slice(previous.end, token.start))) result += ' ';
      result += token.value;
      previous = token;
    }
    return result.trim();
  }
  until(stop: string): Token[] {
    const result: Token[] = [], stack: string[] = [];
    const closing: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    while (this.peek()) {
      const t = this.current();
      if (t.kind !== 'string' && t.kind !== 'comment') {
        if (!stack.length && t.value === stop) return result;
        if (closing[t.value]) stack.push(closing[t.value]);
        else if ([')', ']', '}'].includes(t.value)) {
          if (stack.pop() !== t.value) throw new ParseError(`Лишняя или незакрытая скобка «${t.value}».`, t.line);
        }
      }
      result.push(t); this.index++;
    }
    throw new ParseError(`Ожидалось «${stop}», но код закончился.`, this.current().line);
  }
  condition(allowEmpty = false): string {
    this.expect('(');
    const expression = this.code(this.until(')'));
    this.expect(')');
    if (!expression && !allowEmpty) throw new ParseError('Условие не может быть пустым.', this.current().line);
    return expression;
  }
  body(): Statement[] {
    const statement = this.statement();
    return statement.kind === 'block' ? statement.body! : [statement];
  }
  block(): Statement[] {
    this.expect('{');
    const body: Statement[] = [];
    while (this.peek() && !this.peek('}')) {
      // Comments just before a closing brace are documentation, not an operation.
      let look = this.index;
      while (this.tokens[look]?.kind === 'comment') look++;
      if (this.tokens[look]?.value === '}') { this.index = look; break; }
      body.push(this.statement());
    }
    this.expect('}');
    return body;
  }
  statement(): Statement {
    if (++this.depth > 100) throw new ParseError('Слишком глубокая вложенность кода (больше 100 уровней).', this.current().line);
    if (++this.count > 650) throw new ParseError('Слишком много операторов. Максимум — 650 на файл.', this.current().line);
    const comment = this.comments();
    const token = this.current();
    let result: Statement;
    if (this.peek('{')) {
      result = { kind: 'block', code: '', line: token.line, body: this.block() };
    } else if (this.peek('if')) {
      this.index++;
      const code = this.condition();
      const inline = this.comments(this.tokens[this.index - 1].endLine);
      const body = this.body();
      let look = this.index;
      while (this.tokens[look]?.kind === 'comment') look++;
      let alternate: Statement[] | undefined;
      if (this.tokens[look]?.value === 'else') { this.index = look + 1; alternate = this.body(); }
      result = { kind: 'if', code, line: token.line, body, alternate, comment: inline };
    } else if (this.peek('for')) {
      this.index++; this.expect('(');
      const init = this.code(this.until(';')); this.expect(';');
      const code = this.code(this.until(';')); this.expect(';');
      const update = this.code(this.until(')')); this.expect(')');
      const inline = this.comments(this.tokens[this.index - 1].endLine);
      this.loopDepth++; const body = this.body(); this.loopDepth--;
      result = { kind: 'for', code, init, update, body, line: token.line, comment: inline };
    } else if (this.peek('while')) {
      this.index++;
      const code = this.condition();
      const inline = this.comments(this.tokens[this.index - 1].endLine);
      this.loopDepth++; const body = this.body(); this.loopDepth--;
      result = { kind: 'while', code, body, line: token.line, comment: inline };
    } else if (this.peek('do')) {
      this.index++;
      this.loopDepth++; const body = this.body(); this.loopDepth--;
      this.comments(); this.expect('while');
      const code = this.condition(); this.expect(';');
      result = { kind: 'do', code, body, line: token.line };
    } else if (this.peek('switch')) {
      this.index++;
      const code = this.condition();
      this.comments(); this.expect('{'); this.switchDepth++;
      const cases: NonNullable<Statement['cases']> = [];
      while (this.peek() && !this.peek('}')) {
        let look = this.index;
        while (this.tokens[look]?.kind === 'comment') look++;
        if (['case', 'default', '}'].includes(this.tokens[look]?.value)) this.index = look;
        if (this.peek('}')) break;
        if (this.peek('case') || this.peek('default')) {
          const label = this.tokens[this.index++];
          const value = label.value === 'default' ? null : this.code(this.until(':'));
          this.expect(':');
          if (value === '' || cases.some(c => c.value === value)) throw new ParseError('Пустая или повторяющаяся ветка switch.', label.line);
          cases.push({ value, body: [], line: label.line });
        } else {
          if (!cases.length) throw new ParseError('Внутри switch ожидается case или default.', this.current().line);
          cases[cases.length - 1].body.push(this.statement());
        }
      }
      this.expect('}'); this.switchDepth--;
      result = { kind: 'switch', code, cases, line: token.line };
    } else {
      if (['goto', 'asm', '__asm__', 'else', 'case', 'default'].includes(token.value)) {
        throw new ParseError(`Конструкция «${token.value}» здесь не поддерживается.`, token.line);
      }
      const parts = this.until(';'); this.expect(';');
      const code = this.code(parts);
      // A label is not an ordinary expression; do not silently change its control flow.
      if (parts[0]?.kind === 'word' && parts[1]?.value === ':') throw new ParseError('Метки и goto пока не поддерживаются.', token.line);
      let kind: Statement['kind'] = 'statement';
      if (['return', 'break', 'continue'].includes(token.value)) kind = token.value as Statement['kind'];
      if (kind === 'break' && !this.loopDepth && !this.switchDepth) throw new ParseError('break должен находиться внутри цикла или switch.', token.line);
      if (kind === 'continue' && !this.loopDepth) throw new ParseError('continue должен находиться внутри цикла.', token.line);
      if ((kind === 'break' || kind === 'continue') && parts.length !== 1) throw new ParseError(`После ${kind} ожидается «;».`, token.line);
      result = { kind, code, line: token.line };
    }
    const trailing = this.comments(this.tokens[this.index - 1]?.endLine);
    result.comment = trailing || comment || result.comment || undefined;
    this.depth--;
    return result;
  }
}

export function parseC(source: string): CProgram {
  const { tokens, warnings } = tokenize(source);
  const parser = new Parser(tokens, source);
  const functions: CFunction[] = [];
  let header: Token[] = [];
  while (parser.peek()) {
    const token = parser.current();
    if (token.kind === 'comment') { parser.index++; continue; }
    if (token.value === ';') { header = []; parser.index++; continue; }
    if (token.value === '}') throw new ParseError('Лишняя закрывающая скобка «}».', token.line);
    if (token.value === '{') {
      if (header.at(-1)?.value === ')') {
        let depth = 0, open = -1;
        for (let i = header.length - 1; i >= 0; i--) {
          if (header[i].value === ')') depth++;
          if (header[i].value === '(' && --depth === 0) { open = i; break; }
        }
        const name = header[open - 1];
        if (!name || name.kind !== 'word' || open < 2 || header.some(t => ['=', 'namespace', 'class', 'template'].includes(t.value))) {
          throw new ParseError('Не удалось прочитать объявление функции. Используйте обычные функции на C.', token.line);
        }
        if (functions.some(f => f.name === name.value)) throw new ParseError(`Функция ${name.value} определена повторно.`, name.line);
        functions.push({ name: name.value, signature: parser.code(header), line: name.line, body: parser.block() });
      } else {
        // Global aggregate declarations / initializers are not executable steps.
        parser.index++; parser.until('}'); parser.expect('}');
      }
      header = [];
    } else { header.push(token); parser.index++; }
  }
  if (!functions.length) throw new ParseError('Не найдена функция. Добавьте, например, int main(void) { … }.', 1);
  if (header.length) throw new ParseError('Незавершённое объявление в конце файла.', header[0].line);
  return { functions, warnings };
}

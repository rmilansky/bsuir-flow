import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { cpp } from '@codemirror/lang-cpp';
import { tags } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', background: '#fffcf7', color: '#454961' },
  '.cm-content': { fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', padding: '22px 0', caretColor: '#4c68c0', lineHeight: '1.9' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-line': { padding: '0 18px 0 12px' },
  '.cm-gutters': { background: '#fffcf7', border: 'none', color: '#aab0b3', padding: '0 8px 0 12px', fontSize: '12px' },
  '.cm-gutterElement': { lineHeight: '2.0583' },
  '.cm-activeLine': { background: '#f0f0fa' },
  '.cm-activeLineGutter': { background: '#fffcf7', color: '#526bb0' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: '#dfe7ff !important' },
});
const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#9d5790' },
  { tag: tags.typeName, color: '#976044' },
  { tag: tags.string, color: '#518364' },
  { tag: tags.number, color: '#b07740' },
  { tag: tags.comment, color: '#92957f', fontStyle: 'italic' },
  { tag: tags.meta, color: '#a2724c' },
  { tag: tags.function(tags.variableName), color: '#477da1' },
]);

const darkTheme = EditorView.theme({
  '&': { background: '#202331', color: '#d9dcec' },
  '.cm-content': { caretColor: '#b2bfff' },
  '.cm-gutters': { background: '#202331', color: '#777e95' },
  '.cm-activeLine': { background: '#2b3046' },
  '.cm-activeLineGutter': { background: '#202331', color: '#b0bfff' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { background: '#414d79 !important' },
}, { dark: true });
const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c8a4e0' },
  { tag: tags.typeName, color: '#dfb48f' },
  { tag: tags.string, color: '#b1c89b' },
  { tag: tags.number, color: '#eac394' },
  { tag: tags.comment, color: '#98a88d', fontStyle: 'italic' },
  { tag: tags.meta, color: '#d7af89' },
  { tag: tags.function(tags.variableName), color: '#9fbbeb' },
]);
const editorTheme = (dark: boolean) => dark ? [darkTheme, theme, syntaxHighlighting(darkHighlight)] : [theme, syntaxHighlighting(highlight)];

export default function CodeEditor({ value, onChange, onGenerate, focusLine, dark = false }: {
  value: string; onChange: (value: string) => void; onGenerate: () => void; focusLine?: number; dark?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const appearance = useRef(new Compartment()).current;
  const callbacks = useRef({ onChange, onGenerate });
  callbacks.current = { onChange, onGenerate };
  useEffect(() => {
    const editor = new EditorView({
      parent: parent.current!,
      state: EditorState.create({ doc: value, extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
        bracketMatching(), indentOnInput(), cpp(), appearance.of(editorTheme(dark)),
        keymap.of([{ key: 'Mod-Enter', run: () => { callbacks.current.onGenerate(); return true; } }, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ 'aria-label': 'Редактор кода C', spellcheck: 'false' }),
        EditorView.updateListener.of(update => { if (update.docChanged) callbacks.current.onChange(update.state.doc.toString()); }),
      ] }),
    });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
    // The editor instance owns its state; subsequent external changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { view.current?.dispatch({ effects: appearance.reconfigure(editorTheme(dark)) }); }, [appearance, dark]);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const editor = view.current;
    if (editor && focusLine && focusLine <= editor.state.doc.lines) {
      const line = editor.state.doc.line(focusLine);
      editor.dispatch({ selection: { anchor: line.from, head: line.to }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) });
    }
  }, [focusLine]);
  return <div className="code-editor" ref={parent} />;
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Braces, Check, ChevronDown, CircleHelp, Code2, FileCode2, FileUp, GitBranch, Github, Layers3, LoaderCircle, Maximize, MessageSquareText, Minus, Plus, RotateCcw, Settings2, Send, ShieldCheck, Sparkles, Coffee, Heart, Sun, Moon, X } from 'lucide-react';
import type { ReactNode } from 'react';
import CodeEditor from './components/CodeEditor';
import BsuirLogo, { BsuirMark } from './components/BsuirLogo';
import Diagram, { shapeNames } from './components/Diagram';
import type { FlowGraph, FlowNode } from './lib/graph';
import { restoreDiagramLayout } from './lib/diagramEditing';
import { examples } from './lib/examples';
import { readSimplification, SIMPLIFICATION_KEY, simplificationOptions, type SimplificationSettings } from './lib/simplification';

type ModalName = 'examples' | 'help' | 'settings' | 'simplification' | null;
type Result = { id: number; graph?: FlowGraph; error?: string; line?: number; functionName: string; functions: { name: string; signature: string }[]; warnings: string[] };
const STORAGE_KEY = 'kontur-draft-v1';
const THEME_KEY = 'bsuir-flow-theme';

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (typeof draft?.code === 'string' && draft.code.length <= 60000) return { code: draft.code, filename: typeof draft.filename === 'string' ? draft.filename : 'main.c' };
  } catch { /* A disabled or full browser storage must not prevent editing. */ }
  return { code: examples[0].code, filename: 'main.c' };
}

function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <button className="icon-button modal-close" aria-label="Закрыть окно" onClick={onClose}><X size={20} /></button>
      <h2>{title}</h2>{subtitle && <p className="modal-subtitle">{subtitle}</p>}{children}
    </div>
  </dialog>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span /></button>;
}

export default function App() {
  const [draft] = useState(readDraft);
  const [code, setCode] = useState(draft.code);
  const [filename, setFilename] = useState(draft.filename);
  const [source, setSource] = useState(draft.code);
  const [comments, setComments] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  const [simplification, setSimplification] = useState(readSimplification);
  const simplificationCount = simplificationOptions.filter(option => simplification[option.key]).length;
  const dark = theme === 'dark';
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191c28' : '#f7f3ec');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* Themes also work without browser storage. */ }
  }, [theme, dark]);
  useEffect(() => {
    try { localStorage.setItem(SIMPLIFICATION_KEY, JSON.stringify(simplification)); } catch { /* Keep these settings in memory. */ }
  }, [simplification]);
  const [numbers, setNumbers] = useState(false);
  const [monochrome, setMonochrome] = useState(false);
  const [functionName, setFunctionName] = useState('main');
  const [functions, setFunctions] = useState<Result['functions']>([]);
  const [graph, setGraph] = useState<FlowGraph | null>(null);
  const [error, setError] = useState<{ message: string; line?: number } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [modal, setModal] = useState<ModalName>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [selectedEdge, setSelectedEdge] = useState<string>();
  const [layoutEdited, setLayoutEdited] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [focusLine, setFocusLine] = useState<number>();
  const [zoom, setZoom] = useState(0.75);
  const [fit, setFit] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 550 });
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const worker = useRef<Worker | null>(null);
  const automaticGraph = useRef<FlowGraph | null>(null);
  const manualGraph = useRef<FlowGraph | null>(null);
  const layoutScope = useRef('');
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = source !== code;
  const canExport = !!graph && !busy && !dirty && !error;
  const activeNode = graph?.nodes.find(n => n.id === selected);
  const displayZoom = fit && graph ? Math.min(1, (canvasSize.width - 64) / graph.width, (canvasSize.height - 48) / graph.height) : zoom;

  useEffect(() => {
    const current = new Worker(new URL('./lib/generator.worker.ts', import.meta.url), { type: 'module' });
    worker.current = current;
    current.onmessage = ({ data }: MessageEvent<Result>) => {
      if (data.id !== request.current) return;
      clearTimeout(timer.current); setBusy(false);
      if (data.error) { setError({ message: data.error, line: data.line }); return; }
      automaticGraph.current = data.graph!;
      const laidOut = manualGraph.current ? restoreDiagramLayout(data.graph!, manualGraph.current) : data.graph!;
      if (manualGraph.current) manualGraph.current = laidOut;
      setError(null); setGraph(laidOut); setFunctions(data.functions); setFunctionName(data.functionName); setWarnings(data.warnings);
    };
    current.onerror = () => { clearTimeout(timer.current); setBusy(false); setError({ message: 'Не удалось запустить генератор. Обновите страницу и попробуйте ещё раз.' }); };
    return () => { clearTimeout(timer.current); current.terminate(); worker.current = null; };
  }, []);

  useEffect(() => {
    const id = ++request.current;
    const scope = JSON.stringify([source, functionName, simplification]);
    if (scope !== layoutScope.current) {
      manualGraph.current = null; setLayoutEdited(false); layoutScope.current = scope;
    }
    setBusy(true); setError(null); setSelected(undefined); setSelectedEdge(undefined);
    worker.current?.postMessage({ id, code: source, functionName, options: {
      comments, overrides,
      hideExitReturn: simplification.enabled && simplification.hideExitReturn,
      hideLoopJumps: simplification.enabled && simplification.hideLoopJumps,
      mergeProcesses: simplification.enabled && simplification.mergeProcesses,
    } });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (id === request.current) { request.current++; setBusy(false); setError({ message: 'Построение занимает слишком много времени. Попробуйте функцию поменьше.' }); }
    }, 20000);
  }, [source, functionName, comments, simplification, overrides, generation]);

  useEffect(() => {
    setSaved(false);
    const timeout = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, filename })); setSaved(true); } catch { setSaved(false); }
    }, 600);
    return () => clearTimeout(timeout);
  }, [code, filename]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!exportOpen) return;
    const close = (event: MouseEvent) => { if (!(event.target as Element).closest('.export-control')) setExportOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExportOpen(false); };
    document.addEventListener('click', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape); };
  }, [exportOpen]);

  const generate = useCallback(() => {
    if (code !== source) setOverrides({});
    setSource(code); setGeneration(value => value + 1); setFit(true);
  }, [code, source]);

  function loadExample(index: number) {
    const example = examples[index];
    setCode(example.code); setSource(example.code); setFilename(`${example.id}.c`); setFunctionName(example.id === 'gcd' ? 'gcd' : 'main');
    setOverrides({}); setFit(true); setModal(null); setToast(`Открыт пример «${example.title}»`);
  }

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 120000) { setToast('Файл слишком большой. Максимум — 60 000 символов.'); return; }
    try {
      const text = await file.text();
      if (text.length > 60000) { setToast('Файл слишком большой. Максимум — 60 000 символов.'); return; }
      if (text.includes('\u0000')) { setToast('Нужен текстовый файл с кодом на C.'); return; }
      setCode(text); setSource(text); setFilename(file.name); setOverrides({}); setFit(true); setGeneration(g => g + 1);
    } catch { setToast('Не удалось прочитать файл. Попробуйте вставить код в редактор.'); }
  }

  async function download(format: 'svg' | 'png') {
    if (!canExport) return;
    setExportOpen(false); setExporting(true);
    try { const { exportDiagram } = await import('./lib/export'); await exportDiagram(graph!, format, numbers); setToast(`${format.toUpperCase()} готов к скачиванию`); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Не удалось сохранить файл.'); }
    finally { setExporting(false); }
  }

  function selectNode(node: FlowNode) { setSelectedEdge(undefined); setSelected(node.id); setLabelDraft(node.label); setFocusLine(node.line); }
  function editLayout(next: FlowGraph) {
    manualGraph.current = next; setGraph(next); setLayoutEdited(true);
  }
  function resetLayout() {
    if (!automaticGraph.current) return;
    manualGraph.current = null; setGraph(automaticGraph.current); setLayoutEdited(false); setSelectedEdge(undefined); setSelected(undefined); setFit(true);
  }
  function toggleSimplification(key: keyof SimplificationSettings) {
    setSimplification(current => ({ ...current, [key]: !current[key] }));
    setFit(true);
  }
  function changeZoom(delta: number) { setZoom(Math.min(2, Math.max(0.15, displayZoom + delta))); setFit(false); }

  return <>
    <div className="ambient-light ambient-peach" aria-hidden="true" />
    <div className="ambient-light ambient-blue" aria-hidden="true" />
    <header className="site-header">
      <a href="#" className="brand" aria-label="BSUIR flow — главная">
        <span className="brand-icon"><BsuirMark /></span>
        <span className="brand-word">BSUIR<span>flow</span><small>КОД СТАНОВИТСЯ ПОНЯТНЕЕ</small></span>
      </a>
      <nav aria-label="Главное меню">
        <button className="nav-link active" onClick={() => { setModal(null); document.getElementById('workshop')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}><Code2 size={14} />Мастерская</button>
        <button className="nav-link" onClick={() => setModal('examples')}>Примеры</button>
        <button className="nav-link" onClick={() => setModal('help')}>Как это работает <ArrowRight size={13} /></button>
      </nav>
      <div className="header-actions"><div className="campus-badge"><span className="status-dot" />От студента для студентов<Heart size={12} /></div><button className="theme-button" aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} title={dark ? 'Светлая тема' : 'Тёмная тема'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button></div>
    </header>

    <main>
      <section className="intro">
        <div className="intro-copy">
          <div className="eyebrow"><span className="tiny-spark">✳</span>МАЛЕНЬКИЙ ПОМОЩНИК ДЛЯ БОЛЬШИХ ИДЕЙ</div>
          <h1>Твоя логика.<br />В <em>красивой</em> форме<span className="heading-dot">.</span></h1>
          <p>От кода на C до аккуратной блок-схемы — за один клик.<br className="desktop-break" /> Для твоих лабораторных, курсовых и спокойных вечеров.</p>
          <div className="intro-actions">
            <button className="hero-primary" onClick={() => document.getElementById('workshop')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>В мастерскую <ArrowRight size={16} /></button>
            <button className="hero-secondary" onClick={() => setModal('examples')}><BookOpen size={16} />Попробовать пример</button>
          </div>
          <div className="hero-notes"><span><ShieldCheck size={13} />Код остаётся у тебя</span><span className="note-divider" /><a href="#about-project">О проекте<ArrowRight size={12} /></a></div>
        </div>
        <BsuirLogo />
      </section>

      <div className="workshop-heading" id="workshop">
        <div><span className="section-index">01 /</span><h2>Твоя мастерская</h2><span className="workshop-label">C → блок-схема</span></div>
        <p><Coffee size={16} />Налей чаю. Разложим всё по полочкам.</p>
      </div>

      <section className="workspace" aria-label="Генератор блок-схем">
        <div className="editor-panel">
          <div className="panel-heading"><div className="panel-title"><Code2 size={18} /><h2>Исходный код</h2><span className="language-badge">C</span></div><button className="text-button" onClick={() => setModal('examples')}><BookOpen size={15} />Примеры</button></div>
          <div className="editor-toolbar"><div className="file-tab"><FileCode2 size={15} /><span>{filename}</span><span className="file-dot" /></div><button className="icon-button" title="Загрузить .c файл" aria-label="Загрузить .c файл" onClick={() => input.current?.click()}><FileUp size={17} /></button><input ref={input} type="file" accept=".c,.h,.txt" hidden onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></div>
          <div className="editor-body" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}><CodeEditor value={code} onChange={setCode} onGenerate={generate} focusLine={focusLine} dark={dark} /></div>
          <div className="editor-status"><span>{code.split('\n').length} строк<span className="separator">·</span>UTF-8</span><span>{saved ? <><Check size={12} />Сохранено в браузере</> : 'Локальный черновик'}</span></div>
          <div className="editor-actions">
            <div className="comment-setting"><MessageSquareText size={17} /><span>Подписи из комментариев</span><Toggle checked={comments} onChange={() => setComments(v => !v)} label="Подписи из комментариев" /></div>
            <div className="comment-setting simplification-setting">
              <Sparkles size={17} />
              <button className="simplification-details" aria-label="Настроить упрощение" onClick={() => setModal('simplification')}>
                <span>Упрощение схемы</span><small>{simplification.enabled ? `Выбрано ${simplificationCount} из 3` : 'Выключено'}<span>Настроить<ChevronDown size={10} /></span></small>
              </button>
              <Toggle checked={simplification.enabled} onChange={() => toggleSimplification('enabled')} label="Упрощение схемы" />
            </div>
            <button className="generate-button" onClick={generate} disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <GitBranch size={18} />}<span>{busy ? 'Строим схему…' : 'Построить схему'}</span><span className="keyboard-shortcut">⌘ / Ctrl ↵</span><ArrowRight size={17} /></button>
          </div>
        </div>

        <div className="diagram-panel">
          <div className="panel-heading"><div className="panel-title"><GitBranch size={18} /><h2>Блок-схема</h2><span className={`state-badge ${error ? 'error' : dirty ? 'changed' : ''}`}>{busy ? 'Строится' : error ? 'Ошибка' : dirty ? 'Есть изменения' : <><span className="status-dot" />Готово</>}</span></div><div className="diagram-actions"><button className="icon-button" title="Оформление схемы" aria-label="Оформление схемы" onClick={() => setModal('settings')}><Settings2 size={17} /></button><div className="export-control"><button className="export-button" disabled={!canExport || exporting} aria-expanded={exportOpen} onClick={() => setExportOpen(v => !v)}>{exporting ? <LoaderCircle size={15} className="spin" /> : <ArrowDownToLine size={15} />}Экспорт<ChevronDown size={13} /></button>{exportOpen && <div className="export-menu"><button onClick={() => void download('svg')}><span>Векторная схема <small>SVG · для документов и редактирования</small></span><span className="format">SVG</span></button><button onClick={() => void download('png')}><span>Изображение <small>PNG · для отчёта или презентации</small></span><span className="format">PNG</span></button><button onClick={() => { setExportOpen(false); window.print(); }}><span>Печать / PDF <small>Весь граф на одном листе</small></span><span className="format">PDF</span></button><p>Белый фон, чёрные линии. Без водяных знаков.</p></div>}</div></div></div>
          <div className="diagram-toolbar"><label htmlFor="function-select">Функция <select id="function-select" value={functionName} disabled={busy || dirty || !functions.length} onChange={e => { setFunctionName(e.target.value); setOverrides({}); setFit(true); }}>{functions.length ? functions.map(fn => <option key={fn.name} value={fn.name}>{fn.name}()</option>) : <option value="main">main()</option>}</select></label><button className="text-button reset-layout" title="Вернуть автоматическое расположение блоков и стрелок" disabled={!canExport || !layoutEdited} onClick={resetLayout}><RotateCcw size={12} />Сбросить расположение</button></div>
          <div className={`diagram-canvas ${busy ? 'is-loading' : ''} ${monochrome ? 'is-monochrome' : ''}`} ref={canvas}>
            {graph && !error && <div className="diagram-scroll"><div className="diagram-position" style={{ width: Math.max(canvasSize.width, graph.width * displayZoom + 48), minHeight: Math.max(canvasSize.height, graph.height * displayZoom + 40) }}><div style={{ width: graph.width * displayZoom, height: graph.height * displayZoom }}><div style={{ transform: `scale(${displayZoom})`, transformOrigin: 'top left', width: graph.width, height: graph.height }}><Diagram graph={graph} selected={selected} onSelect={selectNode} selectedEdge={selectedEdge} onSelectEdge={id => { setSelected(undefined); setSelectedEdge(id); }} onLayoutChange={canExport ? editLayout : undefined} onEditStart={() => { setZoom(displayZoom); setFit(false); }} scale={displayZoom} numbers={numbers} monochrome={monochrome} dark={dark} /></div></div></div></div>}
            {(!graph || error) && <div className="canvas-message">{error ? <><span className="message-icon error-icon"><Braces size={28} /></span><h3>Проверим код?</h3><p>{error.message}</p>{error.line && <button className="text-button" onClick={() => setFocusLine(error.line)}>Перейти к строке {error.line}<ArrowRight size={14} /></button>}</> : <><LoaderCircle size={30} className="spin" /><p>Соединяем логику в схему…</p></>}</div>}
            {dirty && !error && <div className="stale-note">Код изменён — постройте схему заново</div>}
            {activeNode && !error && !dirty && <form className="node-inspector" onSubmit={e => { e.preventDefault(); if (labelDraft.trim()) setOverrides(v => ({ ...v, [activeNode.id]: labelDraft.trim() })); }}><div className="inspector-heading"><span>{shapeNames[activeNode.shape]}<small>Строка {activeNode.line}</small></span><button type="button" className="icon-button" aria-label="Закрыть подпись" onClick={() => setSelected(undefined)}><X size={16} /></button></div><label htmlFor="node-label">Подпись блока</label><textarea id="node-label" value={labelDraft} maxLength={500} rows={2} onChange={e => setLabelDraft(e.target.value)} /><div><button className="text-button" type="button" onClick={() => { setOverrides(v => { const next = { ...v }; delete next[activeNode.id]; return next; }); }}><RotateCcw size={12} />Сбросить</button><button className="small-primary" type="submit" disabled={!labelDraft.trim()}>Применить<Check size={13} /></button></div></form>}
          </div>
          <div className="canvas-footer"><span className="graph-stat">{graph && !error ? `${graph.nodes.length} блоков` : 'Схема алгоритма'}<span className="separator">·</span>{error ? 'Исправьте код и повторите' : 'Тяни блоки и стрелки · клик по блоку — подпись'}</span><div className="zoom-controls"><button className="icon-button" aria-label="Уменьшить масштаб" onClick={() => changeZoom(-0.1)} disabled={!graph}><Minus size={15} /></button><span>{Math.round(displayZoom * 100)}%</span><button className="icon-button" aria-label="Увеличить масштаб" onClick={() => changeZoom(0.1)} disabled={!graph}><Plus size={15} /></button><span className="zoom-divider" /><button className="icon-button" aria-label="Вместить схему" title="Вместить схему" onClick={() => setFit(true)} disabled={!graph}><Maximize size={15} /></button></div></div>
        </div>
      </section>
      {warnings.length > 0 && !error && <div className="warnings" role="status">{warnings.map(warning => <p key={warning}><CircleHelp size={15} />{warning}</p>)}</div>}

      <section className="hints" aria-label="Возможности генератора и о проекте">
        <div className="hint hint-peach"><span className="hint-icon"><MessageSquareText size={23} /></span><div><span className="hint-kicker">ТВОИ СЛОВА ИМЕЮТ ЗНАЧЕНИЕ</span><h3>Комментарии оживают</h3><p>Напиши <code>// Ввести два числа</code> — и комментарий станет понятной подписью на схеме.</p></div><span className="hint-decoration" aria-hidden="true">✧</span></div>
        <div className="hint hint-lilac"><span className="hint-icon"><Layers3 size={23} /></span><div><span className="hint-kicker">ПОРЯДОК В КАЖДОЙ ВЕТКЕ</span><h3>Всё складывается</h3><p>Условия, циклы и функции займут свои места. А ты сможешь сосредоточиться на идее.</p></div><span className="hint-decoration" aria-hidden="true">↗</span></div>
        <div className="hint hint-mint"><span className="hint-icon"><ArrowDownToLine size={23} /></span><div><span className="hint-kicker">ПОСЛЕДНИЙ ШТРИХ К ЛАБЕ</span><h3>Забирай с собой</h3><p>Забирай схему в SVG, PNG или PDF. Чисто, чётко и без водяных знаков.</p></div><span className="hint-decoration" aria-hidden="true">✳</span></div>
        <article className="hint project-note" id="about-project">
          <span className="hint-icon project-note-icon"><Heart size={20} /></span>
          <div><span className="hint-kicker project-note-kicker">ЛИЧНЫЙ ПРОЕКТ</span><h3>От студента для студентов</h3>
            <p>Создано студентом. Проект никак не связан с БГУИР и не является официальным сервисом университета.</p>
          </div>
        </article>
        <article className="hint project-note project-note-contact">
          <span className="hint-icon project-note-icon"><Send size={20} /></span>
          <div><span className="hint-kicker project-note-kicker">НА СВЯЗИ</span><h3>Сделаем его лучше вместе</h3>
            <p>Ошибка генерации или идея по улучшению? Напиши в Telegram <a className="project-contact-link" href="https://t.me/milanskyyy" target="_blank" rel="noopener noreferrer">@milanskyyy<ArrowRight size={12} /></a></p>
          </div>
        </article>
        <article className="hint project-note project-note-source">
          <span className="hint-icon project-note-icon"><Github size={22} /></span>
          <div><span className="hint-kicker project-note-kicker">ОПЕНСОРС</span><h3>Исходники на GitHub</h3>
            <p>Заглядывай в код, предлагай изменения и помогай проекту расти: <a className="project-contact-link" href="https://github.com/rmilansky/bsuir-flow" target="_blank" rel="noopener noreferrer">bsuir-flow на GitHub<ArrowRight size={12} /></a></p>
          </div>
        </article>
      </section>
      <footer className="site-footer"><span className="footer-brand"><BsuirMark />BSUIR <em>flow</em><span className="separator">/</span><span>Сделано студентом для студентов.</span></span><button className="text-button" onClick={() => setModal('help')}><CircleHelp size={14} />Справка и ограничения</button><span className="footer-love">Меньше рутины, больше <Heart size={12} /></span></footer>
    </main>

    {modal === 'examples' && <Modal title="Начните с примера" subtitle="Небольшие программы, чтобы познакомиться с BSUIR flow. Пример заменит текущий код в редакторе." onClose={() => setModal(null)}><div className="example-list">{examples.map((example, index) => <button key={example.id} onClick={() => loadExample(index)}><span className="example-icon">{index === 0 ? <GitBranch size={23} /> : index === 1 ? <RotateCcw size={23} /> : index === 2 ? <Braces size={23} /> : <Layers3 size={23} />}</span><span><span className="example-tag">{example.tag}</span><strong>{example.title}</strong><small>{example.description}</small></span><ArrowRight size={18} /></button>)}</div></Modal>}
    {modal === 'settings' && <Modal title="Оформление схемы" subtitle="Маленькие детали для твоего идеального отчёта." onClose={() => setModal(null)}><div className="settings-list"><div><span><strong>Подписи из комментариев</strong><small>Комментарии заменяют текст оператора в блоке.</small></span><Toggle checked={comments} onChange={() => setComments(v => !v)} label="Использовать комментарии" /></div><div><span><strong>Номера блоков</strong><small>Показывать порядковый номер над каждым блоком.</small></span><Toggle checked={numbers} onChange={() => setNumbers(v => !v)} label="Номера блоков" /></div><div><span><strong>Чёрно-белый предпросмотр</strong><small>Экспорт всегда использует чёрные линии на белом фоне.</small></span><Toggle checked={monochrome} onChange={() => setMonochrome(v => !v)} label="Чёрно-белый предпросмотр" /></div></div><p className="settings-note">Подписи можно менять прямо на схеме: нажми на нужный блок и напиши свой текст.</p></Modal>}
    {modal === 'simplification' && <Modal title="Упрощение схемы" subtitle="Меньше блоков — та же последовательность действий. Выбери, что упростить." onClose={() => setModal(null)}>
      <div className="settings-list">
        <div><span><strong>Включить упрощение</strong><small>Общий переключатель всех выбранных приёмов.</small></span><Toggle checked={simplification.enabled} onChange={() => toggleSimplification('enabled')} label="Включить упрощение" /></div>
        {simplificationOptions.map(option => <div key={option.key}><span><strong>{option.title}</strong><small>{option.description}</small></span><Toggle checked={simplification[option.key]} onChange={() => toggleSimplification(option.key)} label={option.title} /></div>)}
      </div>
      <p className="settings-note">{simplification.enabled ? 'Изменения сразу применяются к схеме и экспорту.' : 'Упрощение выключено. Включи его, чтобы применить выбранные приёмы.'} Настройки сохраняются в браузере. Исходный код остаётся прежним.</p>
    </Modal>}
    {modal === 'help' && <Modal title="От исходника до схемы" subtitle="Три шага — и логику программы можно увидеть." onClose={() => setModal(null)}><ol className="help-steps"><li><span>01</span><div><strong>Вставьте код или откройте .c файл</strong><p>В файле должна быть хотя бы одна функция. Если функций несколько, выберите нужную над схемой.</p></div></li><li><span>02</span><div><strong>Подпишите действия комментариями</strong><p>Ставьте <code>// подпись</code> перед оператором или справа после <code>;</code>. Поддерживаются <code>/* … */</code> и <code>// @label Подпись</code>. Комментарий к тернарному выражению показывается один раз; в ветках остаются значения. Комментарии внутри выражений не становятся подписями. Нажми на блок, чтобы изменить подпись. Блоки можно перетаскивать, а у выбранной стрелки — двигать участки за круглые маркеры. Для точного сдвига используй клавиши со стрелками. Кнопка «Сбросить расположение» возвращает автоматическую схему.</p></div></li><li><span>03</span><div><strong>Постройте и сохраните</strong><p>Нажмите «Построить схему» или Ctrl / ⌘ + Enter. Экспортируйте в SVG, PNG или выберите «Печать / PDF».</p></div></li></ol><div className="help-support"><h3>Что поддерживается</h3><p>Операторы и объявления, <code>if / else</code>, тернарный оператор <code>условие ? да : нет</code> (в том числе вложенный), <code>for</code>, <code>while</code>, <code>do…while</code>, <code>switch</code> с переходом между case, <code>break</code>, <code>continue</code>, <code>return</code>, вызовы функций, вложенные блоки.</p><h3>Границы первой версии</h3><p>Это структурный разбор C, а не компилятор: типы и корректность выражений не проверяются. Макросы не раскрываются; <code>goto</code>, метки, условная компиляция, C++ и расширения компилятора не поддерживаются. Вызовы функций показаны отдельными действиями, без раскрытия тела. До 60 000 символов и 500 блоков в схеме.</p></div><div className="privacy-note"><ShieldCheck size={17} /><p>Код обрабатывается на устройстве. Черновик хранится в этом браузере; ручные подписи блоков действуют до изменения кода или выбора другой функции. Расположение сохраняется при смене подписей и оформления; новый код, другая функция или настройки упрощения сбрасывают его. Ручные правки схемы не сохраняются после обновления страницы.</p></div></Modal>}
    {toast && <div className="toast" role="status"><Sparkles size={16} />{toast}<button aria-label="Закрыть уведомление" onClick={() => setToast('')}><X size={14} /></button></div>}
    <div className="print-area">{graph && canExport && <><h1>Схема алгоритма · {graph.name}()</h1><Diagram graph={graph} numbers={numbers} monochrome exportMode /></>}</div>
  </>;
}

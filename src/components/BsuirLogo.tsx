import { useEffect, useRef, useState } from 'react';
import { Hand, Pause, Play, RotateCcw } from 'lucide-react';
import type { LogoPalette, LogoScene } from '../lib/logoScene';

export function BsuirMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M8 20c8-8 14 0 22-8M8 14c8-8 14 0 22-8M8 26c8-8 14 0 22-8" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
    <path d="m37 6 1.3 4.7L43 12l-4.7 1.3L37 18l-1.3-4.7L31 12l4.7-1.3L37 6Z" fill="currentColor" />
    <path d="M11 31c4-5 22-5 26 0v8c-5 5-21 5-26 0v-8Zm0 4h26M24 28v15M18 29c-3 4-3 9 0 13m12-13c3 4 3 9 0 13" stroke="currentColor" strokeWidth="1.8" />
  </svg>;
}

export default function BsuirLogo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<LogoScene | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [palette, setPalette] = useState<LogoPalette>('blue');
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    let cancelled = false;
    import('../lib/logoScene').then(({ createLogoScene }) => {
      if (cancelled || !canvas.current) return;
      try {
        scene.current = createLogoScene(canvas.current, () => {
          setState('fallback'); scene.current?.dispose(); scene.current = null;
        });
        setState('ready');
      } catch { setState('fallback'); }
    }).catch(() => { if (!cancelled) setState('fallback'); });
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  useEffect(() => { scene.current?.setPalette(palette); }, [palette, state]);
  useEffect(() => { scene.current?.setMotion(motion); }, [motion, state]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setMotion(!media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <div className="logo-lab" data-state={state} data-palette={palette}>
    <div className="logo-orbit orbit-one" /><div className="logo-orbit orbit-two" />
    <div className="logo-shadow" />
    <div className="floating-caption caption-code"><span className="caption-dot" />&lt;made for students /&gt;</div>
    <span className="floating-caption caption-flow">чуть-чуть магии <span>✧</span></span>
    {state !== 'ready' && <div className={`logo-fallback ${palette}`} aria-label="Логотип BSUIR"><BsuirMark /><strong>BSUIR</strong><span>flow</span></div>}
    <canvas ref={canvas} className={`logo-canvas ${state === 'ready' ? 'ready' : ''}`} aria-label="Интерактивный 3D-логотип BSUIR" aria-describedby="logo-instructions" tabIndex={state === 'ready' ? 0 : -1} />
    <div className="logo-bottom"><div className="logo-palette" role="group" aria-label="Цвет 3D-логотипа">{([
      ['blue', 'Синий'], ['peach', 'Персиковый'], ['lavender', 'Лавандовый'],
    ] as const).map(([id, label]) => <button key={id} className={`palette-dot ${id}`} aria-label={`${label} логотип`} aria-pressed={palette === id} onClick={() => setPalette(id)} />)}</div>
      <p id="logo-instructions"><Hand size={13} /><span>{state === 'fallback' ? 'Маленький символ больших идей' : 'Можно покрутить'}</span><span className="sr-only">Перетаскивайте мышью или пальцем. С клавиатуры: стрелки для поворота, Home для сброса.</span></p>
      <div className="logo-controls"><button aria-label="Вернуть исходный ракурс" title="Вернуть исходный ракурс" disabled={state !== 'ready'} onClick={() => scene.current?.reset()}><RotateCcw size={13} /></button><button aria-label={motion ? 'Приостановить анимацию логотипа' : 'Включить анимацию логотипа'} title={motion ? 'Приостановить анимацию' : 'Включить анимацию'} disabled={state !== 'ready'} aria-pressed={!motion} onClick={() => setMotion(value => !value)}>{motion ? <Pause size={12} /> : <Play size={12} />}</button></div>
    </div>
  </div>;
}

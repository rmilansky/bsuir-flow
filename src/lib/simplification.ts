export type SimplificationSettings = {
  enabled: boolean;
  hideExitReturn: boolean;
  hideLoopJumps: boolean;
  mergeProcesses: boolean;
};

export const SIMPLIFICATION_KEY = 'bsuir-flow-simplification';
export const simplificationOptions = [
  { key: 'hideExitReturn', title: 'Скрывать return в main', description: 'Простой код возврата ведёт сразу в «Конец». Вычисления и return в других функциях сохраняются.' },
  { key: 'hideLoopJumps', title: 'Заменять break и continue стрелками', description: 'break ведёт за цикл или switch, continue — к следующей итерации. Для for сохраняется шаг счётчика.' },
  { key: 'mergeProcesses', title: 'Объединять последовательные действия', description: 'До четырёх объявлений или вычислений в одном блоке. Порядок и подписи сохраняются; условия, ввод/вывод и вызовы функций остаются отдельными.' },
] as const;

export function readSimplification(): SimplificationSettings {
  const defaults: SimplificationSettings = { enabled: false, hideExitReturn: true, hideLoopJumps: true, mergeProcesses: true };
  try {
    const saved = JSON.parse(localStorage.getItem(SIMPLIFICATION_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(defaults) as (keyof SimplificationSettings)[]) {
        if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
      }
      return defaults;
    }
    // Preserve the former return-only preference without enabling new changes.
    if (localStorage.getItem('bsuir-flow-hide-exit-return') === 'true') {
      return { ...defaults, enabled: true, hideLoopJumps: false, mergeProcesses: false };
    }
  } catch { /* Defaults also work when storage is unavailable or invalid. */ }
  return defaults;
}

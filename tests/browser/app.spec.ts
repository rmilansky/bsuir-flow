import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('dark is the default and switching themes preserves the editor and saved preference', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(32, 35, 49)');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await expect(page.locator('.diagram-canvas .flow-node').first().locator('rect').first()).toHaveAttribute('fill', '#343c58');
  const editor = page.getByRole('textbox', { name: 'Редактор кода C' });
  await editor.fill('int main(){ return 12; }');
  await page.getByRole('button', { name: 'Включить светлую тему', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.cm-editor')).toHaveCSS('background-color', 'rgb(255, 252, 247)');
  await expect(editor).toHaveText('int main(){ return 12; }');
  await expect(page.getByText('Сохранено в браузере', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(editor).toHaveText('int main(){ return 12; }');
  await page.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('hiding return in main updates the preview and SVG, and preserves helper returns', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  const hide = page.getByRole('switch', { name: 'Упрощение схемы', exact: true });
  await expect(hide).not.toBeChecked();
  await hide.click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Процесс: return 0', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Векторная схема/ }).click();
  const svg = await downloadEvent;
  const source = await readFile((await svg.path())!, 'utf8');
  expect(source).not.toContain('return 0');
  expect(source).toContain('Конец');
  expect(source).toContain('stroke="#111111"');
  await page.reload();
  await expect(hide).toBeChecked();
  await page.locator('input[type=file]').setInputFiles({ name: 'exit.c', mimeType: 'text/plain', buffer: Buffer.from('int helper(){ return 42; }\nint main(){ if(error) return 1; return 0; }') });
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(3);
  await page.getByLabel('Функция').selectOption('helper');
  await expect(page.getByRole('button', { name: 'Процесс: return 42', exact: true })).toBeVisible();
  await page.getByLabel('Функция').selectOption('main');
  await hide.click();
  await expect(page.getByRole('button', { name: 'Процесс: return 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Процесс: return 0', exact: true })).toBeVisible();
});

test('simplification options work independently and survive the master toggle and reload', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'simplify.c', mimeType: 'text/plain', buffer: Buffer.from('int main(){ int a=0; int b=1; while(a<3){ if(b) break; a++; b++; } return 0; }') });
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  const master = page.getByRole('switch', { name: 'Упрощение схемы', exact: true });
  await master.click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(6);
  await page.getByRole('button', { name: 'Настроить упрощение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const merge = dialog.getByRole('switch', { name: 'Объединять последовательные действия', exact: true });
  await merge.click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(8);
  await dialog.getByRole('switch', { name: 'Заменять break и continue стрелками', exact: true }).click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(9);
  await dialog.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await master.click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(10);
  await master.click();
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(9);
  await page.reload();
  await expect(master).toBeChecked();
  await page.getByRole('button', { name: 'Настроить упрощение', exact: true }).click();
  await expect(merge).not.toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Скрывать return в main', exact: true })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Заменять break и continue стрелками', exact: true })).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await merge.click();
  await expect(merge).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Закрыть окно', exact: true })).toBeVisible();
});

test('migrates the old return preference without enabling the other simplifications', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bsuir-flow-hide-exit-return', 'true'));
  await page.goto('/');
  await expect(page.getByRole('switch', { name: 'Упрощение схемы', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Настроить упрощение', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('switch', { name: 'Скрывать return в main', exact: true })).toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Заменять break и continue стрелками', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('switch', { name: 'Объединять последовательные действия', exact: true })).not.toBeChecked();
});

test('generates a diagram, switches labels and edits a selected block', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Ввод / вывод: Ввести два числа', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Подписи из комментариев', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ввод / вывод: scanf("%d %d", &a, &b)', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Подписи из комментариев', exact: true }).click();
  await page.getByRole('button', { name: 'Ввод / вывод: Ввести два числа', exact: true }).click();
  await page.getByLabel('Подпись блока', { exact: true }).fill('Ввод значений a и b');
  await page.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByRole('button', { name: 'Ввод / вывод: Ввод значений a и b', exact: true })).toBeVisible();
  await expect(page.locator('.logo-lab')).not.toHaveAttribute('data-state', 'loading');
  await page.screenshot({ path: '/private/tmp/kontur-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('loads C files, selects a function and restores the local draft', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'functions.c', mimeType: 'text/plain', buffer: Buffer.from('int twice(int n){ return n*2; }\nint main(){ return twice(2); }') });
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await expect(page.getByLabel('Функция')).toHaveValue('main');
  await page.getByLabel('Функция').selectOption('twice');
  await expect(page.getByRole('button', { name: 'Процесс: return n*2', exact: true })).toBeVisible();
  await expect(page.getByText('Сохранено в браузере', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.file-tab')).toContainText('functions.c');
  await expect(page.getByLabel('Функция')).toContainText('twice()');
});

test('reports malformed code and prevents exporting an outdated diagram', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await page.getByRole('textbox', { name: 'Редактор кода C' }).fill('int main(){ if (');
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Построить схему', exact: false }).click();
  await expect(page.getByText('Проверим код?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Редактор кода C' }).fill('int main(){ return 0; }');
  await page.getByRole('button', { name: 'Построить схему', exact: false }).click();
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await expect(page.locator('.diagram-canvas .flow-node')).toHaveCount(3);
});

test('exports standalone SVG, valid PNG and a single PDF page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const svgEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Векторная схема/ }).click();
  const svg = await svgEvent;
  expect(svg.suggestedFilename()).toBe('main-flowchart.svg');
  const svgText = await readFile((await svg.path())!, 'utf8');
  expect(svgText).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(svgText).toContain('Ввести два числа');
  expect(svgText).not.toContain('tabindex');
  expect(svgText).toContain('stroke="#111111"');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  const pngEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: /Изображение PNG/ }).click();
  const png = await pngEvent;
  const bytes = await readFile((await png.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(4000);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.toString().match(/\/Type \/Page\b/g)).toHaveLength(1);
});

test('all examples generate and settings update the preview', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Факториал числа', 'Алгоритм Евклида', 'Меню программы']) {
    await page.getByRole('navigation').getByRole('button', { name: 'Примеры', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.locator('.state-badge')).toHaveText('Готово');
    await expect(page.locator('.diagram-canvas .flow-svg')).toBeVisible();
    await expect(page.getByText('Проверим код?', { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Оформление схемы', exact: true }).click();
  await page.getByRole('switch', { name: 'Номера блоков', exact: true }).click();
  await page.getByRole('switch', { name: 'Чёрно-белый предпросмотр', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await expect(page.locator('.diagram-canvas .flow-node').first().locator('rect').first()).toHaveAttribute('stroke', '#111111');
});

test('mobile layout has no horizontal page overflow and dialogs are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Справка и ограничения', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть окно', exact: true }).click();
  await expect(page.locator('.logo-lab')).not.toHaveAttribute('data-state', 'loading');
  await page.locator('.editor-panel').scrollIntoViewIfNeeded();
  await expect.poll(async () => {
    const line = await page.locator('.cm-activeLine').boundingBox();
    const number = await page.locator('.cm-activeLineGutter').boundingBox();
    return Math.abs((line?.y || 0) - (number?.y || 0));
  }).toBeLessThan(2);
  await page.screenshot({ path: '/private/tmp/kontur-mobile.png', fullPage: true });
});

test('3D logo supports reduced motion, material changes and keyboard rotation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.logo-lab')).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Включить анимацию логотипа' })).toBeVisible();
  const logo = page.getByLabel('Интерактивный 3D-логотип BSUIR', { exact: true });
  const original = await logo.screenshot();
  await page.getByRole('button', { name: 'Персиковый логотип' }).click();
  await expect(page.getByRole('button', { name: 'Персиковый логотип' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await logo.screenshot()).equals(original)).toBe(false);
  const peach = await logo.screenshot();
  await logo.focus();
  await logo.press('ArrowRight');
  await expect.poll(async () => (await logo.screenshot()).equals(peach)).toBe(false);
  const rotated = await logo.screenshot();
  const bounds = (await logo.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await logo.screenshot()).equals(rotated)).toBe(false);
  await page.getByRole('button', { name: 'Вернуть исходный ракурс' }).click();
  await page.getByRole('button', { name: 'Лавандовый логотип' }).click();
  await page.getByRole('button', { name: 'Включить анимацию логотипа' }).click();
  await expect(page.getByRole('button', { name: 'Приостановить анимацию логотипа' })).toBeVisible();
});

test('the workshop and color picker work without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.logo-lab')).toHaveAttribute('data-state', 'fallback');
  await expect(page.getByLabel('Логотип BSUIR', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Персиковый логотип' }).click();
  await expect(page.locator('.logo-fallback')).toHaveClass('logo-fallback peach');
  await expect(page.locator('.state-badge')).toHaveText('Готово');
  await expect(page.getByRole('button', { name: 'Экспорт', exact: true })).toBeEnabled();
});

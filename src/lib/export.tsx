import { renderToStaticMarkup } from 'react-dom/server';
import Diagram from '../components/Diagram';
import type { FlowGraph } from './graph';

export function svgSource(graph: FlowGraph, numbers: boolean): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + renderToStaticMarkup(<Diagram graph={graph} numbers={numbers} monochrome exportMode />);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportDiagram(graph: FlowGraph, format: 'svg' | 'png', numbers: boolean) {
  const svg = new Blob([svgSource(graph, numbers)], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') { downloadBlob(svg, `${graph.name}-flowchart.svg`); return; }
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(2, 12000 / Math.max(graph.width, graph.height), Math.sqrt(24_000_000 / (graph.width * graph.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(graph.width * scale); canvas.height = Math.ceil(graph.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не поддерживает экспорт PNG. Попробуйте SVG.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Не удалось создать PNG. Попробуйте SVG.')), 'image/png'));
    downloadBlob(blob, `${graph.name}-flowchart.png`);
  } finally { URL.revokeObjectURL(url); }
}

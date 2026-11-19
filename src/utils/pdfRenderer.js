import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function renderPdfPageToCanvas(file, scale = 3, password = '') {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    password: password || undefined,
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function cropPercentToCardCanvas(sourceCanvas, rectPercent, outWidth = 1011, outHeight = 638) {
  const { x, y, w, h } = rectPercent;
  const target = document.createElement('canvas');
  target.width = outWidth;
  target.height = outHeight;

  const ctx = target.getContext('2d');
  ctx.drawImage(
    sourceCanvas,
    sourceCanvas.width * (x / 100),
    sourceCanvas.height * (y / 100),
    sourceCanvas.width * (w / 100),
    sourceCanvas.height * (h / 100),
    0,
    0,
    outWidth,
    outHeight
  );

  return target.toDataURL('image/png');
}

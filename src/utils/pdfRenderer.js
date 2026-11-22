import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function renderPdfDocumentPage(file, pageNumber = 1, scale = 3, password = '') {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new RangeError('PDF page number must be a positive integer.');
  }

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    password: password || undefined,
  });

  let pdf;
  try {
    pdf = await loadingTask.promise;
    if (pageNumber > pdf.numPages) {
      throw new RangeError(`PDF has only ${pdf.numPages} page(s).`);
    }

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return { canvas, pageCount: pdf.numPages };
  } finally {
    if (pdf) {
      await pdf.destroy();
    } else {
      await loadingTask.destroy();
    }
  }
}

export async function renderPdfPageToCanvas(file, scale = 3, password = '', pageNumber = 1) {
  const { canvas } = await renderPdfDocumentPage(file, pageNumber, scale, password);
  return canvas;
}

export async function renderPdfPagesToCanvas(file, scale = 3, password = '') {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: buffer,
    password: password || undefined,
  }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 2); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    pages.push(canvas);
  }

  return { pages, pageCount: pdf.numPages };
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

export function fitCanvasToCardCanvas(sourceCanvas, outWidth, outHeight) {
  const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  const { data } = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  let left = sourceCanvas.width;
  let top = sourceCanvas.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < sourceCanvas.height; y += 2) {
    for (let x = 0; x < sourceCanvas.width; x += 2) {
      const i = (y * sourceCanvas.width + x) * 4;
      if (data[i + 3] > 16 && (data[i] < 246 || data[i + 1] < 246 || data[i + 2] < 246)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (right < left || bottom < top) {
    left = 0;
    top = 0;
    right = sourceCanvas.width - 1;
    bottom = sourceCanvas.height - 1;
  }

  const pad = Math.max(4, Math.round(Math.min(sourceCanvas.width, sourceCanvas.height) * 0.008));
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(sourceCanvas.width - 1, right + pad);
  bottom = Math.min(sourceCanvas.height - 1, bottom + pad);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;

  const target = document.createElement('canvas');
  target.width = outWidth;
  target.height = outHeight;
  const ctx = target.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, outWidth, outHeight);

  const scale = Math.min(outWidth / cropWidth, outHeight / cropHeight);
  const drawWidth = cropWidth * scale;
  const drawHeight = cropHeight * scale;
  ctx.drawImage(
    sourceCanvas,
    left,
    top,
    cropWidth,
    cropHeight,
    (outWidth - drawWidth) / 2,
    (outHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  );

  return target.toDataURL('image/png');
}

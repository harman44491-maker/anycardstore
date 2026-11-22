import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { createTwoPageCardPdf } from '../src/utils/cardPdfExport.js';

const ONE_PIXEL_PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
);

test('combined card export contains two pages at the requested physical size', async () => {
  const widthMm = 85.6;
  const heightMm = 54;
  const bytes = await createTwoPageCardPdf(ONE_PIXEL_PNG, ONE_PIXEL_PNG, { widthMm, heightMm });
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  const expectedWidth = (widthMm * 72) / 25.4;
  const expectedHeight = (heightMm * 72) / 25.4;

  assert.equal(pages.length, 2);
  for (const page of pages) {
    assert.ok(Math.abs(page.getWidth() - expectedWidth) < 0.01);
    assert.ok(Math.abs(page.getHeight() - expectedHeight) < 0.01);
  }
});

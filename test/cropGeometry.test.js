import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCenteredCrop,
  getCropPercentAspect,
  normalizeCropRect,
  updateCropRect,
} from '../src/utils/cropGeometry.js';

const CARD_ASPECT = 85.6 / 54;

function assertCardAspect(rect, pageWidth, pageHeight) {
  const actual = (rect.w * pageWidth) / (rect.h * pageHeight);
  assert.ok(Math.abs(actual - CARD_ASPECT) < 0.0001);
}

test('drawing a crop works in either drag direction and stays within the page', () => {
  const aspect = 1;
  const rect = updateCropRect({
    mode: 'draw',
    origin: null,
    startPoint: { x: 80, y: 75 },
    currentPoint: { x: 20, y: 15 },
    aspect,
  });

  assert.deepEqual(rect, { x: 20, y: 15, w: 60, h: 60 });
});

test('moving a crop clamps it without changing its size', () => {
  const rect = updateCropRect({
    mode: 'move',
    origin: { x: 10, y: 20, w: 30, h: 40 },
    startPoint: { x: 15, y: 25 },
    currentPoint: { x: 100, y: -20 },
    aspect: 0.75,
  });

  assert.deepEqual(rect, { x: 70, y: 0, w: 30, h: 40 });
});

test('resizing and normalizing enforce minimum size and page boundaries', () => {
  const resized = updateCropRect({
    mode: 'resize',
    origin: { x: 15, y: 20, w: 35, h: 30 },
    startPoint: { x: 50, y: 50 },
    currentPoint: { x: 100, y: 100 },
    aspect: 35 / 30,
  });

  assert.deepEqual(resized, { x: 15, y: 20, w: 85, h: 85 / (35 / 30) });
  assert.deepEqual(normalizeCropRect({ x: 99, y: -5, w: 0, h: 200 }, 1), {
    x: 95,
    y: 0,
    w: 5,
    h: 5,
  });
});

test('unlocked custom crops can use independent dimensions and remain within page bounds', () => {
  const rect = updateCropRect({
    mode: 'resize',
    origin: { x: 15, y: 20, w: 35, h: 30 },
    startPoint: { x: 50, y: 50 },
    currentPoint: { x: 72, y: 58 },
  });

  assert.deepEqual(rect, { x: 15, y: 20, w: 57, h: 38 });
  assert.deepEqual(normalizeCropRect({ x: 90, y: 90, w: 30, h: 25 }), {
    x: 70,
    y: 75,
    w: 30,
    h: 25,
  });
});

test('centered crop fits portrait pages at CR80 aspect without distortion', () => {
  const pageWidth = 600;
  const pageHeight = 900;
  const rect = createCenteredCrop(pageWidth, pageHeight, CARD_ASPECT);

  assert.ok(rect.x >= 0 && rect.y >= 0);
  assert.ok(rect.x + rect.w <= 100 && rect.y + rect.h <= 100);
  assertCardAspect(rect, pageWidth, pageHeight);
  assert.ok(Math.abs(rect.x - (100 - rect.w) / 2) < 0.0001);
  assert.ok(Math.abs(rect.y - (100 - rect.h) / 2) < 0.0001);
});

test('draw, move and resize preserve CR80 aspect and stay in landscape page bounds', () => {
  const pageWidth = 1200;
  const pageHeight = 800;
  const aspect = getCropPercentAspect(pageWidth, pageHeight, CARD_ASPECT);
  const start = createCenteredCrop(pageWidth, pageHeight, CARD_ASPECT);
  const drawn = updateCropRect({
    mode: 'draw',
    origin: null,
    startPoint: { x: 95, y: 90 },
    currentPoint: { x: 20, y: 30 },
    aspect,
  });
  const moved = updateCropRect({
    mode: 'move',
    origin: start,
    startPoint: { x: 50, y: 50 },
    currentPoint: { x: 200, y: -50 },
    aspect,
  });
  const resized = updateCropRect({
    mode: 'resize',
    origin: start,
    startPoint: { x: start.x + start.w, y: start.y + start.h },
    currentPoint: { x: 100, y: 100 },
    aspect,
  });

  for (const rect of [drawn, moved, resized]) {
    assert.ok(rect.x >= 0 && rect.y >= 0);
    assert.ok(rect.x + rect.w <= 100.0001 && rect.y + rect.h <= 100.0001);
    assertCardAspect(rect, pageWidth, pageHeight);
  }
});

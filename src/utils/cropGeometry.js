const MIN_CROP_SIZE = 5;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getCropPercentAspect(pageWidth, pageHeight, cardAspect) {
  return cardAspect * (pageHeight / pageWidth);
}

export function createCenteredCrop(pageWidth, pageHeight, cardAspect) {
  const aspect = getCropPercentAspect(pageWidth, pageHeight, cardAspect);
  const h = Math.min(60, 60 / aspect);
  const w = aspect * h;
  return {
    x: (100 - w) / 2,
    y: (100 - h) / 2,
    w,
    h,
  };
}

export function normalizeCropRect(rect, aspect = null) {
  let w = clamp(rect.w, MIN_CROP_SIZE, 100);
  let h = clamp(rect.h, MIN_CROP_SIZE, 100);

  if (aspect) {
    const maxHeight = Math.min(100, 100 / aspect);
    const minHeight = Math.min(maxHeight, Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE / aspect));
    h = clamp(Math.min(h, w / aspect), minHeight, maxHeight);
    w = aspect * h;
  }

  const x = clamp(rect.x, 0, 100 - w);
  const y = clamp(rect.y, 0, 100 - h);

  return {
    x,
    y,
    w,
    h,
  };
}

export function updateCropRect({ mode, origin, startPoint, currentPoint, aspect }) {
  if (mode === 'draw') {
    const dx = currentPoint.x - startPoint.x;
    const dy = currentPoint.y - startPoint.y;
    let w = Math.abs(dx);
    let h = Math.abs(dy);
    if (aspect) {
      if (h === 0) h = w / aspect;
      else if (w === 0) w = h * aspect;
      if (w / h > aspect) w = h * aspect;
      else h = w / aspect;
    }

    return normalizeCropRect({
      x: dx < 0 ? startPoint.x - w : startPoint.x,
      y: dy < 0 ? startPoint.y - h : startPoint.y,
      w,
      h,
    }, aspect);
  }

  if (mode === 'move') {
    return normalizeCropRect({
      ...origin,
      x: origin.x + currentPoint.x - startPoint.x,
      y: origin.y + currentPoint.y - startPoint.y,
    }, aspect);
  }

  if (mode === 'resize') {
    if (!aspect) {
      return normalizeCropRect({
        ...origin,
        w: currentPoint.x - origin.x,
        h: currentPoint.y - origin.y,
      });
    }

    const x = clamp(origin.x, 0, 100 - MIN_CROP_SIZE);
    const y = clamp(origin.y, 0, 100 - MIN_CROP_SIZE);
    const maxHeight = Math.min(100 - y, (100 - x) / aspect, 100 / aspect);
    const minHeight = Math.min(maxHeight, Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE / aspect));
    const h = Math.max(
      currentPoint.y - origin.y,
      (currentPoint.x - origin.x) / aspect
    );
    const boundedHeight = clamp(h, minHeight, maxHeight);
    return {
      x,
      y,
      w: aspect * boundedHeight,
      h: boundedHeight,
    };
  }

  throw new Error(`Unknown crop interaction mode: ${mode}`);
}

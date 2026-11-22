const PHOTO_WIDTH_MM = 35;
const PHOTO_HEIGHT_MM = 45;
const PAGE_MARGIN_MM = 5;
const PHOTO_GAP_MM = 2;

function getCount(availableMm, photoMm) {
  return Math.max(0, Math.floor((availableMm + PHOTO_GAP_MM) / (photoMm + PHOTO_GAP_MM)));
}

export function getPassportSheetLayout(pageWidthMm, pageHeightMm) {
  const usableWidth = pageWidthMm - PAGE_MARGIN_MM * 2;
  const usableHeight = pageHeightMm - PAGE_MARGIN_MM * 2;
  const columns = getCount(usableWidth, PHOTO_WIDTH_MM);
  const rows = getCount(usableHeight, PHOTO_HEIGHT_MM);

  return {
    columns,
    rows,
    capacity: columns * rows,
  };
}

export function splitCopiesIntoSheets(copyCount, sheetCapacity) {
  if (!Number.isInteger(copyCount) || copyCount < 1) {
    throw new RangeError('Photo copy count must be a positive integer.');
  }
  if (!Number.isInteger(sheetCapacity) || sheetCapacity < 1) {
    throw new RangeError('At least one photo must fit on the selected paper size.');
  }

  const sheets = [];
  let remaining = copyCount;
  while (remaining > 0) {
    const count = Math.min(remaining, sheetCapacity);
    sheets.push(count);
    remaining -= count;
  }
  return sheets;
}

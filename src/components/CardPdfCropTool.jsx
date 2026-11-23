import React, { useEffect, useRef, useState } from 'react';
import { createTwoPageCardPdf } from '../utils/cardPdfExport';
import {
  createCenteredCrop,
  getCropPercentAspect,
  normalizeCropRect,
  updateCropRect,
} from '../utils/cropGeometry';
import { cropPercentToCardCanvas, renderPdfDocumentPage } from '../utils/pdfRenderer';

const OUTPUT_DPI = 600;
const RENDER_SCALE = OUTPUT_DPI / 72;
const CARD_SPEC = {
  widthMm: 88,
  heightMm: 58,
  pxWidth: Math.round((88 * OUTPUT_DPI) / 25.4),
  pxHeight: Math.round((58 * OUTPUT_DPI) / 25.4),
};
const CARD_ASPECT = CARD_SPEC.widthMm / CARD_SPEC.heightMm;
const PAIR_GAP_MM = 2;
const PAIR_GAP_PX = Math.round((PAIR_GAP_MM * OUTPUT_DPI) / 25.4);

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare side-by-side preview.'));
    image.src = dataUrl;
  });
}

async function createPairPreview(frontUrl, backUrl, orientation) {
  const [front, back] = await Promise.all([loadImage(frontUrl), loadImage(backUrl)]);
  const canvas = document.createElement('canvas');
  const isVertical = orientation === 'vertical';
  canvas.width = isVertical ? Math.max(front.width, back.width) : front.width + PAIR_GAP_PX + back.width;
  canvas.height = isVertical ? front.height + PAIR_GAP_PX + back.height : Math.max(front.height, back.height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (isVertical) {
    context.drawImage(front, 0, 0);
    context.drawImage(back, 0, front.height + PAIR_GAP_PX);
  } else {
    context.drawImage(front, 0, 0);
    context.drawImage(back, front.width + PAIR_GAP_PX, 0);
  }
  return canvas.toDataURL('image/png');
}

function getCropBounds(page) {
  return {
    maxWidthPercent: Math.min(100, (Math.floor((CARD_SPEC.widthMm * OUTPUT_DPI) / 25.4) / page.canvas.width) * 100),
    maxHeightPercent: Math.min(100, (Math.floor((CARD_SPEC.heightMm * OUTPUT_DPI) / 25.4) / page.canvas.height) * 100),
  };
}

function isPasswordError(error) {
  return error?.name === 'PasswordException';
}

function getErrorMessage(error) {
  if (error?.message === 'PDF password prompt cancelled.') {
    return 'Password entry cancelled. Your password is never saved.';
  }
  if (error?.message === 'PDF password attempts exceeded.') {
    return 'The password was not accepted. Please try loading the PDF again.';
  }
  return error?.message || 'Please check the PDF and try again.';
}

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\.pdf$/i, '') || 'card';
}

function CropEditor({
  label,
  page,
  pageCount,
  crop,
  lockAspect,
  useFullPage,
  maxCropBounds,
  cropSizeMm,
  onPageChange,
  onCropChange,
  onCropFieldChange,
  onLockAspectChange,
  onUseFullPageChange,
  onReset,
}) {
  const editorRef = useRef(null);
  const sourceCanvasRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    if (canvas && page) {
      canvas.getContext('2d').drawImage(page.canvas, 0, 0);
    }
  }, [page]);

  const getPoint = (event) => {
    const bounds = editorRef.current.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  };

  const handlePointerDown = (event) => {
    if (!page || useFullPage) return;
    event.preventDefault();
    const point = getPoint(event);
    const rect = crop;
    const aspect = getCropPercentAspect(page.canvas.width, page.canvas.height, CARD_ASPECT);
    const onCrop = point.x >= rect.x && point.x <= rect.x + rect.w
      && point.y >= rect.y && point.y <= rect.y + rect.h;
    const mode = event.target.dataset.handle === 'resize' ? 'resize' : onCrop ? 'move' : 'draw';

    dragRef.current = {
      mode,
      startPoint: point,
      origin: { ...crop },
      aspect: lockAspect ? aspect : null,
      ...maxCropBounds,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!dragRef.current) return;
    onCropChange(updateCropRect({
      ...dragRef.current,
      currentPoint: getPoint(event),
    }));
  };

  const handlePointerUp = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className="mnc-card mnc-crop-editor-card">
      <div className="mnc-row-between">
        <h4>{label}</h4>
        {pageCount > 0 && (
          <label className="mnc-crop-page-select">
            Source page
            <select value={page?.pageNumber || 1} onChange={(event) => onPageChange(Number(event.target.value))}>
              {Array.from({ length: pageCount }, (_, index) => (
                <option key={index + 1} value={index + 1}>Page {index + 1}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="mnc-muted">Draw or move the crop. Resize with the corner handle or enter exact crop percentages below.</p>
      <p className="mnc-muted">
        Crop limit: {CARD_SPEC.widthMm} × {CARD_SPEC.heightMm} mm. Current crop: {cropSizeMm.width.toFixed(1)} × {cropSizeMm.height.toFixed(1)} mm.
      </p>
      <div
        ref={editorRef}
        className={`mnc-crop-editor ${page ? '' : 'is-empty'} ${useFullPage ? 'is-full-page' : ''}`}
        style={page ? { aspectRatio: `${page.canvas.width} / ${page.canvas.height}` } : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {page ? (
          <>
            <canvas
              className="mnc-crop-source"
              width={page.canvas.width}
              height={page.canvas.height}
              ref={sourceCanvasRef}
            />
            {!useFullPage && (
              <div className="mnc-crop-selection" style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
              }}>
                <span className="mnc-crop-resize-handle" data-handle="resize" aria-label="Resize crop" />
              </div>
            )}
          </>
        ) : (
          <span>Load a PDF to preview this side</span>
        )}
      </div>
      {page && (
        <div className="mnc-crop-options">
          <label>
            <input
              type="checkbox"
              checked={useFullPage}
              onChange={(event) => onUseFullPageChange(event.target.checked)}
            />
            Use full page (no crop)
          </label>
          <label>
            <input
              type="checkbox"
              checked={lockAspect}
              disabled={useFullPage}
              onChange={(event) => onLockAspectChange(event.target.checked)}
            />
            Keep 88 × 58 mm ratio
          </label>
        </div>
      )}
      {page && !useFullPage && (
        <div className="mnc-crop-percent-fields">
          {[
            ['x', 'Left X'],
            ['y', 'Top Y'],
            ['w', 'Width'],
            ['h', 'Height'],
          ].map(([field, fieldLabel]) => (
            <label key={field}>
              {fieldLabel} (%)
              <input
                type="number"
                min="0"
                max={Math.min(100, field === 'x' || field === 'w'
                  ? maxCropBounds.maxWidthPercent
                  : maxCropBounds.maxHeightPercent)}
                step="0.1"
                value={crop[field].toFixed(1)}
                onChange={(event) => onCropFieldChange(field, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}
      <div className="mnc-crop-editor-actions">
        <button type="button" className="mnc-btn mnc-btn-ghost" onClick={onReset} disabled={!page}>
          Reset crop
        </button>
      </div>
    </div>
  );
}

export default function CardPdfCropTool() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pages, setPages] = useState({ front: null, back: null });
  const [crops, setCrops] = useState({ front: null, back: null });
  const [cropOptions, setCropOptions] = useState({
    front: { lockAspect: true, useFullPage: false },
    back: { lockAspect: true, useFullPage: false },
  });
  const [preparedSides, setPreparedSides] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pairOrientation, setPairOrientation] = useState('vertical');
  const passwordRef = useRef('');

  const renderPageWithPrompt = async (file, pageNumber) => {
    let password = passwordRef.current;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const result = await renderPdfDocumentPage(file, pageNumber, RENDER_SCALE, password);
        passwordRef.current = password;
        return result;
      } catch (error) {
        if (!isPasswordError(error)) throw error;
        if (attempt === 3) break;

        const enteredPassword = window.prompt('This PDF is password-protected. Enter its password to process it locally:');
        if (enteredPassword === null) {
          throw new Error('PDF password prompt cancelled.');
        }
        password = enteredPassword;
      }
    }

    throw new Error('PDF password attempts exceeded.');
  };

  const loadPage = async (side, pageNumber, file = pdfFile) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await renderPageWithPrompt(file, pageNumber);
      setPageCount(result.pageCount);
      setPages((current) => ({ ...current, [side]: { canvas: result.canvas, pageNumber } }));
      setCrops((current) => ({
        ...current,
        [side]: createCenteredCrop(
          result.canvas.width,
          result.canvas.height,
          CARD_ASPECT,
          getCropBounds(result)
        ),
      }));
      setPreparedSides(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    passwordRef.current = '';
    setPdfFile(file);
    setPageCount(0);
    setPages({ front: null, back: null });
    setPreparedSides(null);
    setCrops({ front: null, back: null });
    setErrorMessage('');
  };

  const handleLoadPdf = async () => {
    if (!pdfFile) {
      setErrorMessage('Select a PDF file first.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      passwordRef.current = '';
      const front = await renderPageWithPrompt(pdfFile, 1);
      const backPageNumber = front.pageCount > 1 ? 2 : 1;
      const back = backPageNumber === 1
        ? front
        : await renderPageWithPrompt(pdfFile, backPageNumber);
      setPageCount(front.pageCount);
      setPages({
        front: { canvas: front.canvas, pageNumber: 1 },
        back: { canvas: back.canvas, pageNumber: backPageNumber },
      });
      setCrops({
        front: createCenteredCrop(front.canvas.width, front.canvas.height, CARD_ASPECT, getCropBounds(front)),
        back: createCenteredCrop(back.canvas.width, back.canvas.height, CARD_ASPECT, getCropBounds(back)),
      });
      setPreparedSides(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const updateCrop = (side, crop) => {
    setCrops((current) => ({ ...current, [side]: crop }));
    setPreparedSides(null);
  };

  const updateCropField = (side, field, rawValue) => {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || !pages[side] || !crops[side]) return;

    const options = cropOptions[side];
    const aspect = options.lockAspect
      ? getCropPercentAspect(pages[side].canvas.width, pages[side].canvas.height, CARD_ASPECT)
      : null;
    const bounds = getCropBounds(pages[side]);
    const nextCrop = { ...crops[side], [field]: value };
    if (aspect && field === 'w') nextCrop.h = value / aspect;
    if (aspect && field === 'h') nextCrop.w = value * aspect;
    updateCrop(side, normalizeCropRect(nextCrop, aspect, bounds));
  };

  const updateCropOption = (side, field, value) => {
    const nextOptions = { ...cropOptions[side], [field]: value };
    setCropOptions((current) => ({ ...current, [side]: nextOptions }));
    if (field === 'lockAspect' && value && pages[side] && crops[side]) {
      const aspect = getCropPercentAspect(
        pages[side].canvas.width,
        pages[side].canvas.height,
        CARD_ASPECT
      );
      setCrops((current) => ({
        ...current,
        [side]: normalizeCropRect(current[side], aspect, getCropBounds(pages[side])),
      }));
    }
    setPreparedSides(null);
  };

  const handlePrepareSides = async () => {
    if (!pages.front || !pages.back) {
      setErrorMessage('Load both card sides before exporting.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const renderSide = (side) => cropPercentToCardCanvas(
        pages[side].canvas,
        cropOptions[side].useFullPage ? { x: 0, y: 0, w: 100, h: 100 } : crops[side],
        CARD_SPEC.pxWidth,
        CARD_SPEC.pxHeight,
        true
      );
      const front = renderSide('front');
      const back = cropPercentToCardCanvas(
        pages.back.canvas,
        cropOptions.back.useFullPage ? { x: 0, y: 0, w: 100, h: 100 } : crops.back,
        CARD_SPEC.pxWidth,
        CARD_SPEC.pxHeight,
        true
      );
      const pair = await createPairPreview(front, back, pairOrientation);
      setPreparedSides({ front, back, pair });
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(`Could not prepare the card sides: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!preparedSides) return;

    setLoading(true);
    setErrorMessage('');
    try {
      const [frontBytes, backBytes] = await Promise.all(
        [preparedSides.front, preparedSides.back]
          .map((dataUrl) => fetch(dataUrl).then((response) => response.arrayBuffer()))
      );
      const pdfBytes = await createTwoPageCardPdf(frontBytes, backBytes, CARD_SPEC);
      const blobUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${safeFileName(pdfFile?.name || 'card')}_front-back_${OUTPUT_DPI}dpi.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      setErrorMessage(`Could not create the card PDF: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const changePairOrientation = async (orientation) => {
    setPairOrientation(orientation);
    if (!preparedSides) return;

    setLoading(true);
    setErrorMessage('');
    try {
      const pair = await createPairPreview(preparedSides.front, preparedSides.back, orientation);
      setPreparedSides((current) => current && { ...current, pair });
    } catch (error) {
      setErrorMessage(`Could not prepare the card layout: ${getErrorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadPng = (side) => {
    if (!preparedSides || !pdfFile) return;
    const link = document.createElement('a');
    link.href = preparedSides[side];
    const outputName = side === 'pair' ? `front-back-${pairOrientation}` : side;
    link.download = `${safeFileName(pdfFile.name)}_${outputName}_${OUTPUT_DPI}dpi.png`;
    link.click();
  };

  return (
    <section>
      <div className="mnc-privacy-banner">
        <span>
          <strong>Local-only card preparation:</strong> Your source PDF and password stay in this browser session; nothing is uploaded or saved.
        </span>
      </div>

      <div className="mnc-card">
        <h3>Prepare an original card PDF</h3>
        <p className="mnc-muted">
          Select an existing PDF. Choose a page and crop independently for the front and back; a protected PDF will ask for its password locally.
        </p>
        <div className="mnc-controls-row mnc-crop-upload-row">
          <div className="mnc-upload-box">
            <label htmlFor="card-pdf-source">Source PDF</label>
            <input id="card-pdf-source" type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
          </div>
          <button type="button" className="mnc-btn mnc-btn-primary" disabled={loading || !pdfFile} onClick={handleLoadPdf}>
            {loading ? 'Loading PDF...' : 'Load PDF pages'}
          </button>
          <span className="mnc-muted">Card output: {CARD_SPEC.widthMm} × {CARD_SPEC.heightMm} mm at {OUTPUT_DPI} DPI</span>
        </div>

        {errorMessage && <p className="mnc-crop-error" role="alert">{errorMessage}</p>}

        <div className="mnc-grid-2 mnc-crop-editors">
          {['front', 'back'].map((side) => (
            <CropEditor
              key={side}
              label={`${side[0].toUpperCase()}${side.slice(1)} side`}
              page={pages[side]}
              pageCount={pageCount}
              crop={crops[side]}
              lockAspect={cropOptions[side].lockAspect}
              useFullPage={cropOptions[side].useFullPage}
              maxCropBounds={pages[side] ? getCropBounds(pages[side]) : { maxWidthPercent: 100, maxHeightPercent: 100 }}
              cropSizeMm={pages[side] && crops[side] ? {
                width: crops[side].w * pages[side].canvas.width * 25.4 / (OUTPUT_DPI * 100),
                height: crops[side].h * pages[side].canvas.height * 25.4 / (OUTPUT_DPI * 100),
              } : { width: 0, height: 0 }}
              onPageChange={(pageNumber) => loadPage(side, pageNumber)}
              onCropChange={(crop) => updateCrop(side, crop)}
              onCropFieldChange={(field, value) => updateCropField(side, field, value)}
              onLockAspectChange={(value) => updateCropOption(side, 'lockAspect', value)}
              onUseFullPageChange={(value) => updateCropOption(side, 'useFullPage', value)}
              onReset={() => {
                const page = pages[side];
                if (page) {
                  updateCrop(side, createCenteredCrop(page.canvas.width, page.canvas.height, CARD_ASPECT, getCropBounds(page)));
                }
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="mnc-btn mnc-btn-primary"
          disabled={loading || !pages.front || !pages.back}
          onClick={handlePrepareSides}
        >
          {loading ? 'Preparing card previews...' : 'Prepare front and back previews'}
        </button>
      </div>

      {preparedSides && (
        <div className="mnc-card mnc-mt-20">
          <h3>Card-size output preview</h3>
          <p className="mnc-muted">
            The combined PDF contains two pages: front first, then back. Each page is {CARD_SPEC.widthMm} × {CARD_SPEC.heightMm} mm.
            Digital lighting is preview-only; downloads and print use the original prepared pixels.
          </p>
          <div className="mnc-card-crop-output digital-light-preview">
            <figure>
              <img src={preparedSides.front} alt="Prepared card front" />
              <figcaption>Front side</figcaption>
            </figure>
            <figure>
              <img src={preparedSides.back} alt="Prepared card back" />
              <figcaption>Back side</figcaption>
            </figure>
          </div>
          <div className="mnc-center-actions">
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadPng('front')}>Download front PNG</button>
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadPng('back')}>Download back PNG</button>
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadPng('pair')}>
              Download {pairOrientation === 'vertical' ? 'vertical' : 'side-by-side'} PNG
            </button>
            <button type="button" className="mnc-btn mnc-btn-success" disabled={loading} onClick={handleDownloadPdf}>
              {loading ? 'Creating PDF...' : 'Download two-page card PDF'}
            </button>
          </div>
        </div>
      )}

      {preparedSides && (
        <div className="mnc-card mnc-mt-20 card-pair-print-card">
          <div className="mnc-row-between">
            <div>
              <h3>Front + back print layout</h3>
              <p className="mnc-muted">
                {pairOrientation === 'vertical' ? 'Front and back stacked vertically' : 'Front and back arranged side-by-side'}, with a {PAIR_GAP_MM} mm gap.
              </p>
            </div>
            <button type="button" className="mnc-btn mnc-btn-success" onClick={() => window.print()}>
              Print {pairOrientation === 'vertical' ? 'vertical' : 'side-by-side'}
            </button>
          </div>
          <div className={`card-pair-print-sheet printable-sheet ${pairOrientation}`}>
            <img
              className={`card-pair-print-image digital-light-preview-image ${pairOrientation}`}
              src={preparedSides.pair}
              alt="Card front and back combined for printing"
              style={{
                width: pairOrientation === 'vertical' ? `${CARD_SPEC.widthMm}mm` : `${CARD_SPEC.widthMm * 2 + PAIR_GAP_MM}mm`,
                height: pairOrientation === 'vertical'
                  ? `${CARD_SPEC.heightMm * 2 + PAIR_GAP_MM}mm`
                  : `${CARD_SPEC.heightMm}mm`,
              }}
            />
          </div>
          <div className="mnc-center-actions card-pair-layout-actions">
            <button
              type="button"
              className={`mnc-btn ${pairOrientation === 'vertical' ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
              disabled={loading || pairOrientation === 'vertical'}
              onClick={() => changePairOrientation('vertical')}
            >
              Stack vertically
            </button>
            <button
              type="button"
              className={`mnc-btn ${pairOrientation === 'horizontal' ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
              disabled={loading || pairOrientation === 'horizontal'}
              onClick={() => changePairOrientation('horizontal')}
            >
              Side-by-side
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

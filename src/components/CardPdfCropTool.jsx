import React, { useEffect, useRef, useState } from 'react';
import { SHOP_CONFIG } from '../config/shopConfig';
import { createTwoPageCardPdf } from '../utils/cardPdfExport';
import {
  createCenteredCrop,
  getCropPercentAspect,
  updateCropRect,
} from '../utils/cropGeometry';
import { cropPercentToCardCanvas, renderPdfDocumentPage } from '../utils/pdfRenderer';

const OUTPUT_DPI = 300;
const RENDER_SCALE = OUTPUT_DPI / 72;
const CARD_SPEC = SHOP_CONFIG.cr80CardSpec;
const CARD_ASPECT = CARD_SPEC.widthMm / CARD_SPEC.heightMm;

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

function CropEditor({ label, page, pageCount, crop, onPageChange, onCropChange, onReset }) {
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
    if (!page) return;
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
      aspect,
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
      <p className="mnc-muted">Draw a crop, drag inside it to move, or use the corner handle to resize.</p>
      <div
        ref={editorRef}
        className={`mnc-crop-editor ${page ? '' : 'is-empty'}`}
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
            <div className="mnc-crop-selection" style={{
              left: `${crop.x}%`,
              top: `${crop.y}%`,
              width: `${crop.w}%`,
              height: `${crop.h}%`,
            }}>
              <span className="mnc-crop-resize-handle" data-handle="resize" aria-label="Resize crop" />
            </div>
          </>
        ) : (
          <span>Load a PDF to preview this side</span>
        )}
      </div>
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
  const [preparedSides, setPreparedSides] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
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
        [side]: createCenteredCrop(result.canvas.width, result.canvas.height, CARD_ASPECT),
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
        front: createCenteredCrop(front.canvas.width, front.canvas.height, CARD_ASPECT),
        back: createCenteredCrop(back.canvas.width, back.canvas.height, CARD_ASPECT),
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

  const handlePrepareSides = () => {
    if (!pages.front || !pages.back) {
      setErrorMessage('Load both card sides before exporting.');
      return;
    }

    try {
      const front = cropPercentToCardCanvas(
        pages.front.canvas,
        crops.front,
        CARD_SPEC.pxWidth,
        CARD_SPEC.pxHeight
      );
      const back = cropPercentToCardCanvas(
        pages.back.canvas,
        crops.back,
        CARD_SPEC.pxWidth,
        CARD_SPEC.pxHeight
      );
      setPreparedSides({ front, back });
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(`Could not prepare the card sides: ${getErrorMessage(error)}`);
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

  const downloadPng = (side) => {
    if (!preparedSides || !pdfFile) return;
    const link = document.createElement('a');
    link.href = preparedSides[side];
    link.download = `${safeFileName(pdfFile.name)}_${side}_${OUTPUT_DPI}dpi.png`;
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
              onPageChange={(pageNumber) => loadPage(side, pageNumber)}
              onCropChange={(crop) => updateCrop(side, crop)}
              onReset={() => {
                const page = pages[side];
                if (page) {
                  updateCrop(side, createCenteredCrop(page.canvas.width, page.canvas.height, CARD_ASPECT));
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
          Prepare front and back previews
        </button>
      </div>

      {preparedSides && (
        <div className="mnc-card mnc-mt-20">
          <h3>Card-size output preview</h3>
          <p className="mnc-muted">The combined PDF contains two pages: front first, then back. Each page is {CARD_SPEC.widthMm} × {CARD_SPEC.heightMm} mm.</p>
          <div className="mnc-card-crop-output">
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
            <button type="button" className="mnc-btn mnc-btn-success" disabled={loading} onClick={handleDownloadPdf}>
              {loading ? 'Creating PDF...' : 'Download two-page card PDF'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

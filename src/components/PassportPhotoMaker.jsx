import React, { useState, useEffect } from 'react';
import { SHOP_CONFIG } from '../config/shopConfig';
import { getPassportSheetLayout, splitCopiesIntoSheets } from '../utils/passportSheetLayout';

const PAPER_SIZES = {
  a4: { label: 'A4 (210 × 297 mm)', widthMm: 210, heightMm: 297 },
  photo4x6: { label: '4 × 6 in (101.6 × 152.4 mm)', widthMm: 101.6, heightMm: 152.4 },
  letter: { label: 'Letter (216 × 279 mm)', widthMm: 215.9, heightMm: 279.4 },
  legal: { label: 'Legal (216 × 356 mm)', widthMm: 215.9, heightMm: 355.6 },
};

export default function PassportPhotoMaker() {
  const [imageSrc, setImageSrc] = useState(null);
  const [photoCount, setPhotoCount] = useState(8);
  const [copyCountMode, setCopyCountMode] = useState('8');
  const [customPhotoCount, setCustomPhotoCount] = useState('8');
  const [paperSize, setPaperSize] = useState('a4');
  const [customPaperWidth, setCustomPaperWidth] = useState('210');
  const [customPaperHeight, setCustomPaperHeight] = useState('297');
  const [brightness, setBrightness] = useState(102);
  const [contrast, setContrast] = useState(104);
  const [croppedUrl, setCroppedUrl] = useState(null);

  const paper = paperSize === 'custom'
    ? { widthMm: Number(customPaperWidth), heightMm: Number(customPaperHeight) }
    : PAPER_SIZES[paperSize];
  const validPaper = Number.isFinite(paper.widthMm) && Number.isFinite(paper.heightMm)
    && paper.widthMm >= 40 && paper.widthMm <= 1000
    && paper.heightMm >= 50 && paper.heightMm <= 1500;
  const validPhotoCount = Number.isInteger(photoCount) && photoCount >= 1 && photoCount <= 500;
  const layout = validPaper ? getPassportSheetLayout(paper.widthMm, paper.heightMm) : null;
  const sheetCounts = validPhotoCount && layout?.capacity
    ? splitCopiesIntoSheets(photoCount, layout.capacity)
    : [];

  const onFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.onload = () => {
      const { pxWidth, pxHeight } = SHOP_CONFIG.passportSpec;
      const canvas = document.createElement('canvas');
      canvas.width = pxWidth;
      canvas.height = pxHeight;
      const ctx = canvas.getContext('2d');

      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      const targetRatio = pxWidth / pxHeight;
      const srcRatio = img.width / img.height;

      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcRatio > targetRatio) {
        sw = img.height * targetRatio;
        sx = (img.width - sw) / 2;
      } else {
        sh = img.width / targetRatio;
        sy = (img.height - sh) / 2;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, pxWidth, pxHeight);
      setCroppedUrl(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.src = imageSrc;
  }, [imageSrc, brightness, contrast]);

  return (
    <section>
      {validPaper && (
        <style>{`@page passport-sheet { size: ${paper.widthMm}mm ${paper.heightMm}mm; margin: 0; }`}</style>
      )}
      <div className="mnc-privacy-banner">
        <span>
          ⚡ <strong>Offline / Fast (300 DPI):</strong> Customer photo aapke browser mein hi 3.5 cm × 4.5 cm mein crop hoti hai — koi server upload nahi hota.
        </span>
      </div>

      <div className="mnc-card">
        <h3>Passport Photo Settings (3.5 cm × 4.5 cm @ 300 DPI)</h3>
        <div className="mnc-controls-row" style={{ marginTop: '12px' }}>
          <input type="file" accept="image/*" onChange={onFileSelect} />
          <label>
            Copies:{' '}
            <select
              value={copyCountMode}
              onChange={(e) => {
                const value = e.target.value;
                setCopyCountMode(value);
                if (value !== 'custom') setPhotoCount(Number(value));
                else setPhotoCount(Number(customPhotoCount));
              }}
            >
              <option value={6}>6 Photos</option>
              <option value={8}>8 Photos</option>
              <option value={12}>12 Photos</option>
              <option value={24}>24 Photos</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          {copyCountMode === 'custom' && (
            <label>
              Custom copies (1–500):{' '}
              <input
                type="number"
                min="1"
                max="500"
                step="1"
                value={customPhotoCount}
                onChange={(e) => {
                  setCustomPhotoCount(e.target.value);
                  setPhotoCount(e.target.value === '' ? 0 : Number(e.target.value));
                }}
              />
            </label>
          )}
          <label>
            Paper size:{' '}
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
              {Object.entries(PAPER_SIZES).map(([key, size]) => (
                <option key={key} value={key}>{size.label}</option>
              ))}
              <option value="custom">Custom size</option>
            </select>
          </label>
          {paperSize === 'custom' && (
            <div className="mnc-passport-custom-paper">
              <label>
                Width (mm):{' '}
                <input
                  type="number"
                  min="40"
                  max="1000"
                  step="0.1"
                  value={customPaperWidth}
                  onChange={(e) => setCustomPaperWidth(e.target.value)}
                />
              </label>
              <label>
                Height (mm):{' '}
                <input
                  type="number"
                  min="50"
                  max="1500"
                  step="0.1"
                  value={customPaperHeight}
                  onChange={(e) => setCustomPaperHeight(e.target.value)}
                />
              </label>
            </div>
          )}
          <label>
            Brightness ({brightness}%):{' '}
            <input type="range" min="80" max="130" value={brightness} onChange={(e) => setBrightness(+e.target.value)} />
          </label>
          <label>
            Contrast ({contrast}%):{' '}
            <input type="range" min="80" max="130" value={contrast} onChange={(e) => setContrast(+e.target.value)} />
          </label>
        </div>
      </div>

      {croppedUrl && (
        <div className="mnc-card mnc-mt-20 passport-print-card">
          <div className="mnc-row-between">
            <div>
              <h3>Print Sheet Preview</h3>
              {layout?.capacity > 0 && validPhotoCount && (
                <p className="mnc-muted">
                  {photoCount} copies · {layout.capacity} photos per {paperSize === 'custom' ? 'sheet' : PAPER_SIZES[paperSize].label.split(' (')[0]} · {sheetCounts.length} sheet{sheetCounts.length !== 1 ? 's' : ''}
                </p>
              )}
              {!validPaper && <p className="mnc-passport-error">Enter a paper width of 40–1000 mm and height of 50–1500 mm.</p>}
              {layout?.capacity === 0 && <p className="mnc-passport-error">Paper size is too small for one passport photo.</p>}
              {!validPhotoCount && <p className="mnc-passport-error">Enter a whole number of copies between 1 and 500.</p>}
            </div>
            <button type="button" className="mnc-btn mnc-btn-success" onClick={() => window.print()}>
              🖨️ Print Sheet
            </button>
          </div>
          {sheetCounts.map((count, sheetIndex) => (
            <div
              key={sheetIndex}
              className="mnc-passport-grid passport-print-sheet printable-sheet"
              style={{
                width: `${paper.widthMm}mm`,
                height: `${paper.heightMm}mm`,
                gridTemplateColumns: `repeat(${layout.columns}, 35mm)`,
                gridTemplateRows: `repeat(${layout.rows}, 45mm)`,
              }}
            >
              {Array.from({ length: count }).map((_, photoIndex) => (
                <img
                  key={photoIndex}
                  src={croppedUrl}
                  alt={`Passport copy ${sheetIndex * layout.capacity + photoIndex + 1}`}
                  className="passport-photo-item"
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

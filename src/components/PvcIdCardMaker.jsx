import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { buildParsedAadhaarCards, AADHAAR_PVC_SPEC } from '../utils/aadhaarTemplateParser';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_card_calibration_v31_';

const COMPACT_300_DPI = 300;
const COMPACT_CARD_SPEC = {
  widthMm: 90,
  heightMm: 60,
  dpi: COMPACT_300_DPI,
  pxWidth: Math.round((90 * COMPACT_300_DPI) / 25.4),
  pxHeight: Math.round((60 * COMPACT_300_DPI) / 25.4),
  renderScale: 2.5,
};

const CARD_PRESETS = {
  eaadhaar: {
    label: 'e-Aadhaar PDF (Auto-Fit Template)',
    y: 72.2,
    h: 20.6,
    frontX: 7.6,
    backX: 50.5,
    w: 42.0,
  },
  voterId: {
    label: 'e-EPIC Voter ID PDF',
    y: 10.9,
    h: 19.1,
    frontX: 5,
    backX: 54.4,
    w: 42.4,
  },
  panCard: {
    label: 'e-PAN Card PDF',
    y: 66.0,
    h: 25.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
  },
  eshram: {
    label: 'e-Shram Card PDF',
    y: 14.0,
    h: 27.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
  },
};

export default function PvcIdCardMaker() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('eaadhaar');
  const [useTemplateParser, setUseTemplateParser] = useState(true);
  const [layoutMode, setLayoutMode] = useState('a4');
  const [previewZoom, setPreviewZoom] = useState(1.25);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [photoBrightness, setPhotoBrightness] = useState(120);
  const [photoContrast, setPhotoContrast] = useState(105);
  const [boldWeight, setBoldWeight] = useState('700');

  const [crop, setCrop] = useState(() => {
    try {
      const saved = localStorage.getItem(`${PVC_STORAGE_PREFIX}eaadhaar`);
      return saved ? JSON.parse(saved) : CARD_PRESETS.eaadhaar;
    } catch {
      return CARD_PRESETS.eaadhaar;
    }
  });

  const [cardPair, setCardPair] = useState(null);
  const [parsedInfo, setParsedInfo] = useState(null);

  const isAadhaarMode = selectedPreset === 'eaadhaar';
  const isVoterMode = selectedPreset === 'voterId';
  const hasCardBorder = isAadhaarMode || isVoterMode;
  const outputSpec = isAadhaarMode
    ? AADHAAR_PVC_SPEC
    : isVoterMode
      ? COMPACT_CARD_SPEC
      : SHOP_CONFIG.cr80CardSpec;
  const outputDpi = isAadhaarMode ? AADHAAR_PVC_SPEC.dpi : isVoterMode ? COMPACT_300_DPI : 300;

  useEffect(() => {
    try {
      localStorage.setItem(`${PVC_STORAGE_PREFIX}${selectedPreset}`, JSON.stringify(crop));
    } catch {
      // Ignore storage errors
    }
  }, [crop, selectedPreset]);

  const applyPreset = (key) => {
    setSelectedPreset(key);
    try {
      const saved = localStorage.getItem(`${PVC_STORAGE_PREFIX}${key}`);
      setCrop(saved ? JSON.parse(saved) : { ...CARD_PRESETS[key] });
    } catch {
      setCrop({ ...CARD_PRESETS[key] });
    }
  };

  const updateField = (field, val) => {
    const num = parseFloat(val);
    setCrop((prev) => ({
      ...prev,
      [field]: Number.isNaN(num) ? 0 : num,
    }));
  };

  const handleExtract = async () => {
    if (!pdfFile) {
      setErrorMsg('Kripya pehle Aadhaar, Voter, ya PAN PDF file select karein.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setParsedInfo(null);

    try {
      if (isAadhaarMode && useTemplateParser) {
        const result = await buildParsedAadhaarCards(pdfFile, pdfPassword.trim(), {
          photoBrightness,
          photoContrast,
          boldWeight,
        });
        setParsedInfo(result.parsed);
        setCardPair({
          name: pdfFile.name.replace(/\.pdf$/i, ''),
          frontUrl: result.frontUrl,
          backUrl: result.backUrl,
          dpi: result.dpi,
          widthMm: result.widthMm,
          heightMm: result.heightMm,
          hasBorder: true,
        });
        return;
      }

      const { pxWidth, pxHeight } = outputSpec;
      const sourceRenderScale = isAadhaarMode
        ? AADHAAR_PVC_SPEC.renderScale
        : isVoterMode
          ? COMPACT_CARD_SPEC.renderScale
          : 3;
      const pageCanvas = await renderPdfPageToCanvas(pdfFile, sourceRenderScale, pdfPassword.trim());

      const frontUrl = cropPercentToCardCanvas(
        pageCanvas,
        { x: crop.frontX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight
      );
      const backUrl = cropPercentToCardCanvas(
        pageCanvas,
        { x: crop.backX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight
      );

      setCardPair({
        name: pdfFile.name.replace(/\.pdf$/i, ''),
        frontUrl,
        backUrl,
        dpi: outputDpi,
        widthMm: 90,
        heightMm: 60,
        hasBorder: hasCardBorder,
      });
    } catch (err) {
      if (err?.name === 'PasswordException') {
        setErrorMsg('Yeh PDF password-protected hai (jaise e-Aadhaar). Kripya sahi PDF password dalein.');
      } else {
        setErrorMsg(`PDF process nahi ho paayi: ${err?.message || 'File check karke dobara try karein.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pdfFile && isAadhaarMode && useTemplateParser && cardPair) {
      handleExtract();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoBrightness, photoContrast, boldWeight]);

  const downloadSide = (side) => {
    if (!cardPair) return;
    const link = document.createElement('a');
    link.href = side === 'front' ? cardPair.frontUrl : cardPair.backUrl;
    link.download = `${cardPair.name}_${side}_${cardPair.dpi}dpi.png`;
    link.click();
  };

  return (
    <section className="mnc-pvc-root">
      <style>{`
        .mnc-pvc-print-only-stage {
          margin: 3mm 5mm 0 5mm !important;
          padding: 0 !important;
          display: flex !important;
          flex-direction: row !important;
          justify-content: center !important;
          align-items: flex-start !important;
          gap: 2mm !important;
        }

        .mnc-pvc-print-only-stage .cr80-card-img,
        .mnc-pvc-print-only-stage img.cr80-card-img,
        .mnc-pvc-print-only-stage .mnc-pvc-card-box {
          width: 90mm !important;
          height: 60mm !important;
          min-width: 90mm !important;
          min-height: 60mm !important;
          max-width: 90mm !important;
          max-height: 60mm !important;
          display: block !important;
          object-fit: fill !important;
        }

        .mnc-pvc-card-bordered {
          border: 3px solid #000000 !important;
          box-sizing: border-box !important;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 3mm 5mm 6mm 5mm;
          }

          html, body {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .mnc-pvc-print-only-stage,
          .mnc-pvc-print-only-stage * {
            visibility: visible !important;
          }

          .mnc-pvc-print-only-stage {
            position: fixed !important;
            top: 3mm !important;
            left: 5mm !important;
            right: 5mm !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            zoom: 1 !important;
            display: flex !important;
            flex-direction: row !important;
            justify-content: center !important;
            align-items: flex-start !important;
            gap: 2mm !important;
            width: calc(210mm - 10mm) !important;
            max-width: 200mm !important;
            max-height: 285mm !important;
            page-break-before: avoid !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>

      <div className="mnc-privacy-banner">
        <span>
          🔒 <strong>100% Local Processing:</strong> Document Parsing + Auto-Fit Template @ {AADHAAR_PVC_SPEC.dpi} DPI ({AADHAAR_PVC_SPEC.pxWidth}×{AADHAAR_PVC_SPEC.pxHeight}px) | Card: 90 × 60 mm, Gap: 2mm.
        </span>
      </div>

      <div className="mnc-card">
        <h3>1. Select Card Type & Upload PDF</h3>

        <div className="mnc-preset-row" style={{ marginTop: '10px', justifyContent: 'flex-start' }}>
          {Object.entries(CARD_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              className={`mnc-btn ${selectedPreset === key ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
              onClick={() => applyPreset(key)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mnc-controls-row" style={{ marginTop: '16px', justifyContent: 'flex-start' }}>
          <div className="mnc-upload-box">
            <label>Upload ID Card PDF *</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
            />
          </div>

          {!isVoterMode && (
            <div className="mnc-upload-box">
              <label>PDF Password (e-Aadhaar ke liye)</label>
              <input
                type="password"
                placeholder="e.g. ANIL1995"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>
          )}

          {isAadhaarMode && (
            <div className="mnc-upload-box">
              <label>Mode</label>
              <select
                value={useTemplateParser ? 'template' : 'raw'}
                onChange={(e) => setUseTemplateParser(e.target.value === 'template')}
                style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="template">Auto-Fit Template (Recommended)</option>
                <option value="raw">Direct Crop Fallback</option>
              </select>
            </div>
          )}

          <div className="mnc-upload-box">
            <label>Print Output Layout</label>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="a4">A4 Sheet (90 × 60 mm)</option>
              <option value="tray">PVC Card Tray (Epson L805/L8050)</option>
            </select>
          </div>
        </div>

        {!useTemplateParser && (
          <div className="mnc-yellow-calibration">
            <div className="mnc-calib-header">
              <strong>🎯 Direct Crop Calibration Bar (% of PDF Page):</strong>
            </div>
            <div className="mnc-calib-inputs">
              <label>
                Top Y (%)
                <input type="number" step="0.1" value={crop.y} onChange={(e) => updateField('y', e.target.value)} />
              </label>
              <label>
                Height (%)
                <input type="number" step="0.1" value={crop.h} onChange={(e) => updateField('h', e.target.value)} />
              </label>
              <label>
                Front X (%)
                <input type="number" step="0.1" value={crop.frontX} onChange={(e) => updateField('frontX', e.target.value)} />
              </label>
              <label>
                Back X (%)
                <input type="number" step="0.1" value={crop.backX} onChange={(e) => updateField('backX', e.target.value)} />
              </label>
              <label>
                Width (%)
                <input type="number" step="0.1" value={crop.w} onChange={(e) => updateField('w', e.target.value)} />
              </label>
            </div>
          </div>
        )}

        {errorMsg && (
          <p style={{ color: '#dc2626', fontSize: '13px', fontWeight: 600, marginTop: '10px' }}>
            ⚠️ {errorMsg}
          </p>
        )}

        <div style={{ marginTop: '16px' }}>
          <button type="button" className="mnc-btn mnc-btn-primary" disabled={loading} onClick={handleExtract}>
            {loading ? `⏳ Parsing & Rendering (${outputDpi} DPI)...` : '⚡ Generate Auto-Fit PVC Card'}
          </button>
        </div>
      </div>

      {cardPair && (
        <div className={`mnc-card mnc-mt-20 pvc-preview-card ${layoutMode === 'a4' ? 'pvc-a4-print-card' : ''}`}>
          <div className="mnc-row-between">
            <div>
              <h3>2. Card Preview ({useTemplateParser && isAadhaarMode ? 'Auto-Fit Template Mode' : 'Crop Mode'})</h3>
              <p className="mnc-muted">
                Card Size: {cardPair.widthMm}mm × {cardPair.heightMm}mm @ {cardPair.dpi} DPI | Gap: 2mm | Top: 3mm | L/R: 5mm
              </p>
              {parsedInfo && (
                <p className="mnc-muted">
                  Parsed: <strong>{parsedInfo.name}</strong> {parsedInfo.dobOrYob ? `• ${parsedInfo.dobOrYob}` : ''} {parsedInfo.gender ? `• ${parsedInfo.gender}` : ''}
                </p>
              )}
            </div>
            <div className="mnc-preset-row">
              <div className="pvc-preview-zoom-controls" aria-label="Preview zoom controls">
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom <= 0.75}
                  onClick={() => setPreviewZoom((zoom) => Math.max(0.75, +(zoom - 0.25).toFixed(2)))}
                >
                  −
                </button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom >= 2.5}
                  onClick={() => setPreviewZoom((zoom) => Math.min(2.5, +(zoom + 0.25).toFixed(2)))}
                >
                  +
                </button>
              </div>
              <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadSide('front')}>
                ⬇ Front PNG
              </button>
              <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadSide('back')}>
                ⬇ Back PNG
              </button>
              <button type="button" className="mnc-btn mnc-btn-success" onClick={() => window.print()}>
                🖨️ Print Card
              </button>
            </div>
          </div>

          {isAadhaarMode && useTemplateParser && (
            <div
              style={{
                marginTop: '12px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '18px',
                alignItems: 'center',
              }}
            >
              <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                Photo Brightness ({photoBrightness}%):
                <input
                  type="range"
                  min="90"
                  max="160"
                  value={photoBrightness}
                  onChange={(e) => setPhotoBrightness(Number(e.target.value))}
                />
              </label>

              <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                Photo Contrast ({photoContrast}%):
                <input
                  type="range"
                  min="85"
                  max="140"
                  value={photoContrast}
                  onChange={(e) => setPhotoContrast(Number(e.target.value))}
                />
              </label>

              <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                Text Weight:
                <select
                  value={boldWeight}
                  onChange={(e) => setBoldWeight(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="600">Medium Bold</option>
                  <option value="700">Strong Bold (Default)</option>
                  <option value="800">Extra Bold</option>
                </select>
              </label>
            </div>
          )}

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom ${layoutMode === 'a4' ? 'a4-preview-zoom' : ''} printable-sheet mnc-pvc-print-only-stage`}
            style={{ '--pvc-preview-zoom': previewZoom, marginTop: '3mm', marginLeft: '5mm', marginRight: '5mm', gap: '2mm' }}
          >
            <div className={`mnc-pvc-card-box ${hasCardBorder ? 'mnc-pvc-card-bordered' : ''}`}>
              <img src={cardPair.frontUrl} alt="Card Front" className="cr80-card-img" />
            </div>

            <div className={`mnc-pvc-card-box ${hasCardBorder ? 'mnc-pvc-card-bordered' : ''}`}>
              <img src={cardPair.backUrl} alt="Card Back" className="cr80-card-img" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

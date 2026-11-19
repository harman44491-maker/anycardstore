import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_card_calibration_v35_';

const AADHAAR_OUTPUT_DPI = 600;
const AADHAAR_CARD_SPEC = {
  widthMm: 85.6,
  heightMm: 54.0,
  dpi: AADHAAR_OUTPUT_DPI,
  pxWidth: Math.round((85.6 * AADHAAR_OUTPUT_DPI) / 25.4),
  pxHeight: Math.round((54.0 * AADHAAR_OUTPUT_DPI) / 25.4),
  renderScale: AADHAAR_OUTPUT_DPI / 72,
};

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
    label: 'e-Aadhaar PDF (High-DPI Clear)',
    y: 72.95,
    h: 19.65,
    frontX: 7.6,
    backX: 50.5,
    w: 42.0,
    photoBox: { x: 10.5, y: 21.0, w: 19.5, h: 38.5 },
    frontTextZone: { x: 32.0, y: 18.5, w: 46.0, h: 24.5 },
    backTextZone: { x: 4.0, y: 17.5, w: 56.5, h: 39.5 },
  },
  voterId: {
    label: 'e-EPIC Voter ID PDF',
    y: 10.9,
    h: 19.1,
    frontX: 5.0,
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

function enhanceSafeTextZone(ctx, img, zone, options) {
  const { textScalePercent = 108, textBoldness = 4 } = options;
  if (!zone) return;

  const w = img.width;
  const h = img.height;
  const zx = Math.round((zone.x / 100) * w);
  const zy = Math.round((zone.y / 100) * h);
  const zw = Math.round((zone.w / 100) * w);
  const zh = Math.round((zone.h / 100) * h);
  if (zw <= 0 || zh <= 0) return;

  const patch = document.createElement('canvas');
  patch.width = zw;
  patch.height = zh;
  const pCtx = patch.getContext('2d');
  pCtx.imageSmoothingEnabled = true;
  pCtx.imageSmoothingQuality = 'high';

  const contrast = 100 + Math.min(22, textBoldness * 4);
  pCtx.filter = `contrast(${contrast}%)`;
  pCtx.drawImage(img, zx, zy, zw, zh, 0, 0, zw, zh);
  pCtx.filter = 'none';

  if (textBoldness > 0) {
    const base = document.createElement('canvas');
    base.width = zw;
    base.height = zh;
    base.getContext('2d').drawImage(patch, 0, 0);

    const dirs = [
      [0.55, 0],
      [-0.55, 0],
      [0, 0.55],
      [0, -0.55],
    ];
    const passes = Math.min(4, textBoldness);
    pCtx.save();
    pCtx.globalCompositeOperation = 'darken';
    pCtx.globalAlpha = 0.45;
    for (let i = 0; i < passes; i++) {
      const [dx, dy] = dirs[i % dirs.length];
      pCtx.drawImage(base, dx, dy);
    }
    pCtx.restore();
  }

  const requestedScale = textScalePercent / 100;
  const safeScale = Math.max(1.0, Math.min(requestedScale, 1.14));
  const outW = Math.min(zw, Math.round(zw * safeScale));
  const outH = Math.min(zh, Math.round(zh * safeScale));

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(zx, zy, zw, zh);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(patch, 0, 0, zw, zh, zx, zy, outW, outH);
  ctx.restore();
}

function polishCardForPrint(baseUrl, options) {
  const {
    side,
    photoBox,
    textZone,
    photoBrightness,
    photoContrast,
    textBoldness,
    textScalePercent,
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      if (!w || !h) {
        resolve(baseUrl);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      if (side === 'front' && photoBox && (photoBrightness !== 100 || photoContrast !== 100)) {
        const px = Math.round((photoBox.x / 100) * w);
        const py = Math.round((photoBox.y / 100) * h);
        const pw = Math.round((photoBox.w / 100) * w);
        const ph = Math.round((photoBox.h / 100) * h);

        ctx.save();
        ctx.beginPath();
        ctx.rect(px, py, pw, ph);
        ctx.clip();
        ctx.filter = `brightness(${photoBrightness}%) contrast(${photoContrast}%)`;
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      }

      if (textZone) {
        enhanceSafeTextZone(ctx, img, textZone, {
          textScalePercent,
          textBoldness,
        });
      }

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(baseUrl);
    img.src = baseUrl;
  });
}

export default function PvcIdCardMaker() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('eaadhaar');
  const [layoutMode, setLayoutMode] = useState('a4');
  // Shows 75% label while rendering at 125% visual display scale on screen
  const [previewZoom, setPreviewZoom] = useState(0.75);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [photoBrightness, setPhotoBrightness] = useState(125);
  const [photoContrast, setPhotoContrast] = useState(106);
  const [textBoldness, setTextBoldness] = useState(4);
  const [textScalePercent, setTextScalePercent] = useState(108);

  const [crop, setCrop] = useState(() => {
    try {
      const saved = localStorage.getItem(`${PVC_STORAGE_PREFIX}eaadhaar`);
      return saved ? JSON.parse(saved) : CARD_PRESETS.eaadhaar;
    } catch {
      return CARD_PRESETS.eaadhaar;
    }
  });

  const [rawPair, setRawPair] = useState(null);
  const [cardPair, setCardPair] = useState(null);

  const isAadhaarMode = selectedPreset === 'eaadhaar';
  const isVoterMode = selectedPreset === 'voterId';
  const outputSpec = isAadhaarMode
    ? AADHAAR_CARD_SPEC
    : isVoterMode
      ? COMPACT_CARD_SPEC
      : SHOP_CONFIG.cr80CardSpec;
  const outputDpi = isAadhaarMode ? AADHAAR_OUTPUT_DPI : isVoterMode ? COMPACT_300_DPI : 300;

  // Map 75% indicator to 125% visual display (1.25 / 0.75 = 1.6667x)
  const effectiveDisplayScale = +(previewZoom * (1.25 / 0.75)).toFixed(3);

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

    try {
      const { pxWidth, pxHeight } = outputSpec;
      const pageCanvas = await renderPdfPageToCanvas(pdfFile, outputSpec.renderScale, pdfPassword.trim());

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

      setRawPair({
        name: pdfFile.name.replace(/\.pdf$/i, ''),
        frontUrl,
        backUrl,
        dpi: outputDpi,
        widthMm: 90,
        heightMm: 60,
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
    if (!rawPair) {
      setCardPair(null);
      return;
    }

    let cancelled = false;
    const presetConfig = CARD_PRESETS[selectedPreset] || CARD_PRESETS.eaadhaar;

    Promise.all([
      polishCardForPrint(rawPair.frontUrl, {
        side: 'front',
        photoBox: presetConfig.photoBox,
        textZone: isAadhaarMode ? presetConfig.frontTextZone : null,
        photoBrightness,
        photoContrast,
        textBoldness,
        textScalePercent,
      }),
      polishCardForPrint(rawPair.backUrl, {
        side: 'back',
        textZone: isAadhaarMode ? presetConfig.backTextZone : null,
        photoBrightness: 100,
        photoContrast: 100,
        textBoldness,
        textScalePercent,
      }),
    ]).then(([frontPolished, backPolished]) => {
      if (cancelled) return;
      setCardPair({
        ...rawPair,
        frontUrl: frontPolished,
        backUrl: backPolished,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [rawPair, selectedPreset, isAadhaarMode, photoBrightness, photoContrast, textBoldness, textScalePercent]);

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
          transform: scale(var(--mnc-display-scale, 1.25));
          transform-origin: top center;
          transition: transform 0.15s ease;
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
          border: none !important;
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
          🔒 <strong>100% Local Processing:</strong> High-DPI Clear Print ({outputDpi} DPI) | 75% Zoom = 125% Display | Card: 90 × 60 mm, Gap: 2mm, Top: 3mm, L/R: 5mm.
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

        <div className="mnc-yellow-calibration">
          <div className="mnc-calib-header">
            <strong>🎯 Crop Calibration Bar (% of PDF Page) — Auto-Saved:</strong>
          </div>
          <div className="mnc-calib-inputs">
            <label>
              Top Y (%)
              <input type="number" step="0.05" value={crop.y} onChange={(e) => updateField('y', e.target.value)} />
            </label>
            <label>
              Height (%)
              <input type="number" step="0.05" value={crop.h} onChange={(e) => updateField('h', e.target.value)} />
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
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => applyPreset(selectedPreset)}>
              Reset Preset
            </button>
          </div>
        </div>

        {errorMsg && (
          <p style={{ color: '#dc2626', fontSize: '13px', fontWeight: 600, marginTop: '10px' }}>
            ⚠️ {errorMsg}
          </p>
        )}

        <div style={{ marginTop: '16px' }}>
          <button type="button" className="mnc-btn mnc-btn-primary" disabled={loading} onClick={handleExtract}>
            {loading ? `⏳ Rendering & Cropping (${outputDpi} DPI)...` : '⚡ Extract Front & Back Card'}
          </button>
        </div>
      </div>

      {cardPair && (
        <div className={`mnc-card mnc-mt-20 pvc-preview-card ${layoutMode === 'a4' ? 'pvc-a4-print-card' : ''}`}>
          <div className="mnc-row-between">
            <div>
              <h3>2. Card Preview ({layoutMode === 'tray' ? 'PVC Tray Alignment' : 'A4 Print Layout'})</h3>
              <p className="mnc-muted">
                Card Size: {cardPair.widthMm}mm × {cardPair.heightMm}mm @ {cardPair.dpi} DPI | Gap: 2mm | Top: 3mm | L/R: 5mm
              </p>
            </div>
            <div className="mnc-preset-row">
              <div className="pvc-preview-zoom-controls" aria-label="Preview zoom controls">
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom <= 0.5}
                  onClick={() => setPreviewZoom((zoom) => Math.max(0.5, +(zoom - 0.25).toFixed(2)))}
                >
                  −
                </button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom >= 1.5}
                  onClick={() => setPreviewZoom((zoom) => Math.min(1.5, +(zoom + 0.25).toFixed(2)))}
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
              Text Size ({textScalePercent}%):
              <input
                type="range"
                min="100"
                max="114"
                step="1"
                value={textScalePercent}
                onChange={(e) => setTextScalePercent(Number(e.target.value))}
              />
            </label>

            <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              Text Clarity ({textBoldness}/6):
              <input
                type="range"
                min="0"
                max="6"
                step="1"
                value={textBoldness}
                onChange={(e) => setTextBoldness(Number(e.target.value))}
              />
            </label>
          </div>

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom ${layoutMode === 'a4' ? 'a4-preview-zoom' : ''} printable-sheet mnc-pvc-print-only-stage`}
            style={{
              '--pvc-preview-zoom': previewZoom,
              '--mnc-display-scale': effectiveDisplayScale,
              marginTop: '3mm',
              marginLeft: '5mm',
              marginRight: '5mm',
              gap: '2mm',
            }}
          >
            <div className="mnc-pvc-card-box">
              <img src={cardPair.frontUrl} alt="Card Front" className="cr80-card-img" />
            </div>

            <div className="mnc-pvc-card-box">
              <img src={cardPair.backUrl} alt="Card Back" className="cr80-card-img" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

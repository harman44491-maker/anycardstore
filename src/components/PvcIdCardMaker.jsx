import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_crop_v2_';
const AADHAAR_OUTPUT_DPI = 600;
const AADHAAR_CARD_SPEC = {
  widthMm: 85.6,
  heightMm: 54,
  dpi: AADHAAR_OUTPUT_DPI,
  pxWidth: Math.round((85.6 * AADHAAR_OUTPUT_DPI) / 25.4),
  pxHeight: Math.round((54 * AADHAAR_OUTPUT_DPI) / 25.4),
  renderScale: AADHAAR_OUTPUT_DPI / 72,
};

const CARD_PRESETS = {
  eaadhaar: {
    label: 'e-Aadhaar PDF (Bottom Cut)',
    y: 72.2,
    h: 20.6,
    frontX: 7.6,
    backX: 50.5,
    w: 42.0,
    photoBox: { x: 4.5, y: 26.0, w: 23.0, h: 48.0 }, // Customer photo area on Front card (%)
  },
  voterId: {
    label: 'e-EPIC Voter ID PDF',
    y: 12.0,
    h: 27.5,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 5.0, y: 25.0, w: 24.0, h: 48.0 },
  },
  panCard: {
    label: 'e-PAN Card PDF',
    y: 66.0,
    h: 25.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 5.0, y: 28.0, w: 22.0, h: 44.0 },
  },
  eshram: {
    label: 'e-Shram Card PDF',
    y: 14.0,
    h: 27.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 5.0, y: 25.0, w: 23.0, h: 48.0 },
  },
};

// Helper: Apply selective brightness/contrast only to the photo region of the front card
function applySelectivePhotoEnhance(baseDataUrl, photoBox, brightness, contrast, targetSide) {
  return new Promise((resolve) => {
    if (targetSide !== 'front' || (brightness === 100 && contrast === 100)) {
      resolve(baseDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // 1. Draw full card untouched (keeps QR & text razor sharp)
      ctx.drawImage(img, 0, 0);

      // 2. Re-draw ONLY the customer photo box with brightness/contrast filter
      const px = Math.round((photoBox.x / 100) * img.width);
      const py = Math.round((photoBox.y / 100) * img.height);
      const pw = Math.round((photoBox.w / 100) * img.width);
      const ph = Math.round((photoBox.h / 100) * img.height);

      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = baseDataUrl;
  });
}

export default function PvcIdCardMaker() {
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('eaadhaar');
  const [layoutMode, setLayoutMode] = useState('a4');
  const [previewZoom, setPreviewZoom] = useState(1.25);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Selective Photo Enhancement Controls
  const [photoBrightness, setPhotoBrightness] = useState(112);
  const [photoContrast, setPhotoContrast] = useState(106);

  const [crop, setCrop] = useState(() => {
    try {
      const saved = localStorage.getItem(`${PVC_STORAGE_PREFIX}eaadhaar`);
      return saved ? JSON.parse(saved) : CARD_PRESETS.eaadhaar;
    } catch {
      return CARD_PRESETS.eaadhaar;
    }
  });

  // Raw un-filtered crops + Enhanced output URLs
  const [rawPair, setRawPair] = useState(null);
  const [cardPair, setCardPair] = useState(null);

  const outputSpec = selectedPreset === 'eaadhaar' ? AADHAAR_CARD_SPEC : SHOP_CONFIG.cr80CardSpec;
  const outputDpi = selectedPreset === 'eaadhaar' ? AADHAAR_OUTPUT_DPI : 300;

  useEffect(() => {
    try {
      localStorage.setItem(`${PVC_STORAGE_PREFIX}${selectedPreset}`, JSON.stringify(crop));
    } catch {}
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
      const sourceRenderScale = selectedPreset === 'eaadhaar' ? AADHAAR_CARD_SPEC.renderScale : 4.16;
      const pageCanvas = await renderPdfPageToCanvas(pdfFile, sourceRenderScale, pdfPassword.trim());

      const rawFront = cropPercentToCardCanvas(
        pageCanvas,
        { x: crop.frontX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight
      );
      const rawBack = cropPercentToCardCanvas(
        pageCanvas,
        { x: crop.backX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight
      );

      setRawPair({
        name: pdfFile.name.replace(/\.pdf$/i, ''),
        frontUrl: rawFront,
        backUrl: rawBack,
        dpi: outputDpi,
        widthMm: outputSpec.widthMm || 85.6,
        heightMm: outputSpec.heightMm || 54,
      });
    } catch (err) {
      if (err?.name === 'PasswordException') {
        setErrorMsg('Yeh PDF password-protected hai (jaise e-Aadhaar). Kripya sahi PDF password dalein.');
      } else {
        setErrorMsg('PDF process nahi ho paayi. File check karke dobara try karein.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Re-apply selective photo brightness/contrast live whenever sliders move
  useEffect(() => {
    if (!rawPair) {
      setCardPair(null);
      return;
    }

    let cancelled = false;
    const photoBox = crop.photoBox || CARD_PRESETS[selectedPreset]?.photoBox || { x: 4.5, y: 26, w: 23, h: 48 };

    applySelectivePhotoEnhance(rawPair.frontUrl, photoBox, photoBrightness, photoContrast, 'front')
      .then((enhancedFront) => {
        if (cancelled) return;
        setCardPair({
          ...rawPair,
          frontUrl: enhancedFront,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [rawPair, photoBrightness, photoContrast, crop.photoBox, selectedPreset]);

  const downloadSide = (side) => {
    if (!cardPair) return;
    const link = document.createElement('a');
    link.href = side === 'front' ? cardPair.frontUrl : cardPair.backUrl;
    link.download = `${cardPair.name}_${side}_${cardPair.dpi}dpi.png`;
    link.click();
  };

  return (
    <section>
      <div className="mnc-privacy-banner">
        <span>
          🔒 <strong>100% Local Processing:</strong> Aadhaar 600 DPI, baaki PVC cards 300 DPI. Selective photo brightness aur zoom browser mein hi kaam karte hain.
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
            <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
          </div>

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

          <div className="mnc-upload-box">
            <label>Print Output Layout</label>
            <select
              value={layoutMode}
              onChange={(e) => setLayoutMode(e.target.value)}
              style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            >
              <option value="a4">A4 Sheet (85.6 × 54 mm)</option>
              <option value="tray">PVC Card Tray (Epson L805/L8050)</option>
            </select>
          </div>
        </div>

        <div className="mnc-yellow-calibration">
          <div className="mnc-calib-header">
            <strong>🎯 Crop Calibration Bar (% of PDF Page) — Auto-Saved:</strong>
            <span className="mnc-calib-hint">
              Card position adjust karein (CR80: 85.6mm × 54mm).
            </span>
          </div>
          <div className="mnc-calib-inputs">
            <label>
              Top Y (%)
              <input type="number" step="0.5" value={crop.y} onChange={(e) => updateField('y', e.target.value)} />
            </label>
            <label>
              Height (%)
              <input type="number" step="0.5" value={crop.h} onChange={(e) => updateField('h', e.target.value)} />
            </label>
            <label>
              Front X (%)
              <input type="number" step="0.5" value={crop.frontX} onChange={(e) => updateField('frontX', e.target.value)} />
            </label>
            <label>
              Back X (%)
              <input type="number" step="0.5" value={crop.backX} onChange={(e) => updateField('backX', e.target.value)} />
            </label>
            <label>
              Width (%)
              <input type="number" step="0.5" value={crop.w} onChange={(e) => updateField('w', e.target.value)} />
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
            {loading ? `⏳ Unlocking & Cropping (${outputDpi} DPI)...` : '⚡ Extract Front & Back Card'}
          </button>
        </div>
      </div>

      {cardPair && (
        <div className="mnc-card mnc-mt-20">
          <div className="mnc-row-between">
            <div>
              <h3>2. Card Preview ({layoutMode === 'tray' ? 'PVC Tray Alignment' : 'A4 Print Layout'})</h3>
              <p className="mnc-muted">Exact CR80 Size: {cardPair.widthMm}mm × {cardPair.heightMm}mm @ {cardPair.dpi} DPI</p>
            </div>
            <div className="mnc-preset-row">
              <div className="pvc-preview-zoom-controls">
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom <= 0.75}
                  onClick={() => setPreviewZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                >
                  −
                </button>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  disabled={previewZoom >= 2.5}
                  onClick={() => setPreviewZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
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

          {/* Selective Photo Brightness & Contrast Bar */}
          <div className="mnc-photo-retouch-bar">
            <strong>✨ Customer Photo Retouch (Sirf Photo Saaf Karein, Text/QR Untouched):</strong>
            <label>
              Photo Brightness ({photoBrightness}%):
              <input
                type="range"
                min="80"
                max="160"
                value={photoBrightness}
                onChange={(e) => setPhotoBrightness(Number(e.target.value))}
              />
            </label>
            <label>
              Photo Contrast ({photoContrast}%):
              <input
                type="range"
                min="80"
                max="150"
                value={photoContrast}
                onChange={(e) => setPhotoContrast(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="mnc-btn mnc-btn-ghost"
              onClick={() => {
                setPhotoBrightness(100);
                setPhotoContrast(100);
              }}
            >
              Original Photo
            </button>
          </div>

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom printable-sheet`}
            style={{ '--pvc-preview-zoom': previewZoom }}
          >
            <img src={cardPair.frontUrl} alt="Card Front" className="cr80-card-img" />
            <img src={cardPair.backUrl} alt="Card Back" className="cr80-card-img" />
          </div>
        </div>
      )}
    </section>
  );
}

import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_card_calibration_v2_';
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
    photoBox: { x: 4.5, y: 26.0, w: 23.0, h: 48.0 },
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

// Selective brightness/contrast ONLY on the customer photo area (keeps QR & text crisp)
function applySelectivePhotoEnhance(baseDataUrl, photoBox, brightness, contrast) {
  return new Promise((resolve) => {
    if (brightness === 100 && contrast === 100) {
      resolve(baseDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');

      // Draw full card untouched
      ctx.drawImage(img, 0, 0);

      // Re-draw ONLY customer photo box with brightness/contrast
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

  // Pre-crop full PDF inspection & zoom
  const [fullPdfPreviewUrl, setFullPdfPreviewUrl] = useState(null);
  const [showFullPdfInspector, setShowFullPdfInspector] = useState(false);
  const [pdfInspectorZoom, setPdfInspectorZoom] = useState(1);

  // Selective customer photo brightness/contrast controls
  const [photoBrightness, setPhotoBrightness] = useState(100);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [showPhotoBoxTuning, setShowPhotoBoxTuning] = useState(false);

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

  const outputSpec = selectedPreset === 'eaadhaar' ? AADHAAR_CARD_SPEC : SHOP_CONFIG.cr80CardSpec;
  const outputDpi = selectedPreset === 'eaadhaar' ? AADHAAR_OUTPUT_DPI : 300;

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

  const updatePhotoBoxField = (field, val) => {
    const num = parseFloat(val);
    const currentBox = crop.photoBox || CARD_PRESETS[selectedPreset].photoBox;
    setCrop((prev) => ({
      ...prev,
      photoBox: {
        ...currentBox,
        [field]: Number.isNaN(num) ? 0 : num,
      },
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
      const sourceRenderScale = selectedPreset === 'eaadhaar' ? AADHAAR_CARD_SPEC.renderScale : 3;
      const pageCanvas = await renderPdfPageToCanvas(pdfFile, sourceRenderScale, pdfPassword.trim());

      // Save lightweight preview of full PDF page for pre-crop visual box alignment
      setFullPdfPreviewUrl(pageCanvas.toDataURL('image/jpeg', 0.85));

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

  // Live update front card whenever photoBrightness, photoContrast, or photoBox changes
  useEffect(() => {
    if (!rawPair) {
      setCardPair(null);
      return;
    }

    let cancelled = false;
    const activePhotoBox = crop.photoBox || CARD_PRESETS[selectedPreset]?.photoBox || { x: 4.5, y: 26, w: 23, h: 48 };

    applySelectivePhotoEnhance(rawPair.frontUrl, activePhotoBox, photoBrightness, photoContrast)
      .then((enhancedFrontUrl) => {
        if (cancelled) return;
        setCardPair({
          ...rawPair,
          frontUrl: enhancedFrontUrl,
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

  const activePhotoBox = crop.photoBox || CARD_PRESETS[selectedPreset]?.photoBox || { x: 4.5, y: 26, w: 23, h: 48 };

  return (
    <section>
      <div className="mnc-privacy-banner">
        <span>
          🔒 <strong>100% Local Processing:</strong> Aadhaar 600 DPI, baaki PVC cards 300 DPI. Customer ka password aur PDF data sirf browser mein process hota hai.
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
              onChange={(e) => {
                setPdfFile(e.target.files?.[0] || null);
                setFullPdfPreviewUrl(null);
              }}
            />
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
              Aadhaar ya Voter PDF mein card position thodi alag ho to yahan se adjust karein (CR80: 85.6mm × 54mm).
            </span>
          </div>
          <div className="mnc-calib-inputs">
            <label>
              Top Y (%)
              <input type="number" step="0.2" value={crop.y} onChange={(e) => updateField('y', e.target.value)} />
            </label>
            <label>
              Height (%)
              <input type="number" step="0.2" value={crop.h} onChange={(e) => updateField('h', e.target.value)} />
            </label>
            <label>
              Front X (%)
              <input type="number" step="0.2" value={crop.frontX} onChange={(e) => updateField('frontX', e.target.value)} />
            </label>
            <label>
              Back X (%)
              <input type="number" step="0.2" value={crop.backX} onChange={(e) => updateField('backX', e.target.value)} />
            </label>
            <label>
              Width (%)
              <input type="number" step="0.2" value={crop.w} onChange={(e) => updateField('w', e.target.value)} />
            </label>
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => applyPreset(selectedPreset)}>
              Reset Preset
            </button>
            {fullPdfPreviewUrl && (
              <button
                type="button"
                className="mnc-btn mnc-btn-ghost"
                onClick={() => setShowFullPdfInspector((v) => !v)}
              >
                {showFullPdfInspector ? '🙈 Hide Full PDF Box View' : '🔍 Zoom Full PDF & Check Crop Box'}
              </button>
            )}
          </div>

          {/* Pre-crop Full PDF Visual Inspector with Zoom */}
          {fullPdfPreviewUrl && showFullPdfInspector && (
            <div style={{ marginTop: '14px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #eab308' }}>
              <div className="mnc-row-between" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>
                  🟢 Green Box = Front Card | 🔵 Blue Box = Back Card (Numbers badal kar box align karein aur dubara Extract dabayein)
                </span>
                <div className="pvc-preview-zoom-controls">
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    disabled={pdfInspectorZoom <= 0.75}
                    onClick={() => setPdfInspectorZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                  >
                    −
                  </button>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{Math.round(pdfInspectorZoom * 100)}%</span>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    disabled={pdfInspectorZoom >= 2}
                    onClick={() => setPdfInspectorZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))}
                  >
                    +
                  </button>
                </div>
              </div>

              <div style={{ maxHeight: '420px', overflow: 'auto', border: '1px solid #cbd5e1', textAlign: 'center', background: '#334155', padding: '10px' }}>
                <div style={{ position: 'relative', display: 'inline-block', width: `${460 * pdfInspectorZoom}px` }}>
                  <img src={fullPdfPreviewUrl} alt="Full PDF Page" style={{ width: '100%', display: 'block' }} />
                  {/* Front Crop Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${crop.frontX}%`,
                      top: `${crop.y}%`,
                      width: `${crop.w}%`,
                      height: `${crop.h}%`,
                      border: '2px solid #16a34a',
                      background: 'rgba(22, 163, 74, 0.14)',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Back Crop Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${crop.backX}%`,
                      top: `${crop.y}%`,
                      width: `${crop.w}%`,
                      height: `${crop.h}%`,
                      border: '2px solid #2563eb',
                      background: 'rgba(37, 99, 235, 0.14)',
                      pointerEvents: 'none',
                    }}
                  />
                </div>
              </div>
            </div>
          )}
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
        <div className={`mnc-card mnc-mt-20 pvc-preview-card ${layoutMode === 'a4' ? 'pvc-a4-print-card' : ''}`}>
          <div className="mnc-row-between">
            <div>
              <h3>2. Card Preview ({layoutMode === 'tray' ? 'PVC Tray Alignment' : 'A4 Print Layout'})</h3>
              <p className="mnc-muted">Exact CR80 Size: {cardPair.widthMm}mm × {cardPair.heightMm}mm @ {cardPair.dpi} DPI</p>
              <p className="mnc-muted">Preview zoom only changes the screen view. For a clean A4 print, turn off Headers and footers in the print dialog.</p>
            </div>
            <div className="mnc-preset-row">
              <div className="pvc-preview-zoom-controls" aria-label="Preview zoom controls">
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  aria-label="Zoom out"
                  disabled={previewZoom <= 0.75}
                  onClick={() => setPreviewZoom((zoom) => Math.max(0.75, +(zoom - 0.25).toFixed(2)))}
                >
                  −
                </button>
                <span>{Math.round(previewZoom * 100)}%</span>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  aria-label="Zoom in"
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

          {/* Selective Photo Brightness & Contrast Bar (Only affects customer photo, NOT QR/text) */}
          <div
            style={{
              marginTop: '14px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '12px 16px',
            }}
          >
            <div className="mnc-preset-row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                ✨ Customer Photo Brightness & Contrast (Sirf Photo Saaf Karein, Text & QR Untouched):
              </strong>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  onClick={() => setShowPhotoBoxTuning((v) => !v)}
                >
                  {showPhotoBoxTuning ? 'Hide Photo Area' : '⚙ Photo Area Box'}
                </button>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  onClick={() => {
                    setPhotoBrightness(100);
                    setPhotoContrast(100);
                  }}
                >
                  Reset Photo (100%)
                </button>
              </div>
            </div>

            <div className="mnc-controls-row" style={{ marginTop: '10px', justifyContent: 'flex-start', gap: '24px' }}>
              <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Photo Brightness ({photoBrightness}%):
                <input
                  type="range"
                  min="80"
                  max="170"
                  value={photoBrightness}
                  onChange={(e) => setPhotoBrightness(Number(e.target.value))}
                />
              </label>

              <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Photo Contrast ({photoContrast}%):
                <input
                  type="range"
                  min="80"
                  max="150"
                  value={photoContrast}
                  onChange={(e) => setPhotoContrast(Number(e.target.value))}
                />
              </label>
            </div>

            {showPhotoBoxTuning && (
              <div className="mnc-calib-inputs" style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1' }}>
                <label>
                  Photo Left X (%)
                  <input type="number" step="0.5" value={activePhotoBox.x} onChange={(e) => updatePhotoBoxField('x', e.target.value)} />
                </label>
                <label>
                  Photo Top Y (%)
                  <input type="number" step="0.5" value={activePhotoBox.y} onChange={(e) => updatePhotoBoxField('y', e.target.value)} />
                </label>
                <label>
                  Photo Width (%)
                  <input type="number" step="0.5" value={activePhotoBox.w} onChange={(e) => updatePhotoBoxField('w', e.target.value)} />
                </label>
                <label>
                  Photo Height (%)
                  <input type="number" step="0.5" value={activePhotoBox.h} onChange={(e) => updatePhotoBoxField('h', e.target.value)} />
                </label>
              </div>
            )}
          </div>

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom ${layoutMode === 'a4' ? 'a4-preview-zoom' : ''} printable-sheet`}
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

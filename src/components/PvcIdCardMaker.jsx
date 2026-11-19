import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_card_calibration_v5_';
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
    photoBox: { x: 11, y: 22.8, w: 19.5, h: 37.5 },
    frontTextBox: { x: 32.5, y: 19.5, w: 45.5, h: 21 },
    backTextBox: { x: 4.5, y: 21.5, w: 54.5, h: 27.5 },
  },
  voterId: {
    label: 'e-EPIC Voter ID PDF',
    y: 12.0,
    h: 27.5,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 3.5, y: 21.0, w: 27.5, h: 55.0 },
    frontTextBox: { x: 31.0, y: 23.0, w: 63.0, h: 50.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 56.0, h: 56.0 },
  },
  panCard: {
    label: 'e-PAN Card PDF',
    y: 66.0,
    h: 25.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 3.5, y: 24.0, w: 26.0, h: 52.0 },
    frontTextBox: { x: 30.0, y: 24.0, w: 64.0, h: 52.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 88.0, h: 55.0 },
  },
  eshram: {
    label: 'e-Shram Card PDF',
    y: 14.0,
    h: 27.0,
    frontX: 6.0,
    backX: 51.0,
    w: 43.0,
    photoBox: { x: 3.5, y: 21.0, w: 27.0, h: 55.0 },
    frontTextBox: { x: 31.0, y: 23.0, w: 62.0, h: 48.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 56.0, h: 56.0 },
  },
};

function applySelectiveTextBoldAndScale(ctx, sourceImg, box, textBoldness, textScalePercent) {
  const w = sourceImg.width;
  const h = sourceImg.height;
  const tx = Math.round((box.x / 100) * w);
  const ty = Math.round((box.y / 100) * h);
  const tw = Math.round((box.w / 100) * w);
  const th = Math.round((box.h / 100) * h);

  if (tw <= 0 || th <= 0) return;

  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = tw;
  regionCanvas.height = th;
  const rCtx = regionCanvas.getContext('2d');
  rCtx.imageSmoothingEnabled = true;
  rCtx.imageSmoothingQuality = 'high';

  rCtx.drawImage(sourceImg, tx, ty, tw, th, 0, 0, tw, th);

  if (textBoldness > 0) {
    const baseRegion = document.createElement('canvas');
    baseRegion.width = tw;
    baseRegion.height = th;
    baseRegion.getContext('2d').drawImage(regionCanvas, 0, 0);

    const offsets = [
      [0.65, 0],
      [-0.65, 0],
      [0, 0.65],
      [0, -0.65],
    ];
    const passes = Math.min(4, Math.max(1, Math.round(textBoldness)));
    rCtx.save();
    rCtx.globalCompositeOperation = 'darken';
    rCtx.globalAlpha = 0.52;
    for (let i = 0; i < passes; i++) {
      const [dx, dy] = offsets[i % offsets.length];
      const mult = i >= 2 ? 1.2 : 0.7;
      rCtx.drawImage(baseRegion, dx * mult, dy * mult);
    }
    rCtx.restore();
  }

  const scale = textScalePercent / 100;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tx, ty, tw, th);

  ctx.beginPath();
  ctx.rect(tx, ty, tw, th);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(regionCanvas, 0, 0, tw, th, tx, ty, Math.round(tw * scale), Math.round(th * scale));
  ctx.restore();
}

function enhanceCardCanvas(baseDataUrl, options) {
  const {
    side,
    photoBox,
    frontTextBox,
    backTextBox,
    photoBrightness,
    photoContrast,
    textBoldness,
    textScale,
  } = options;

  return new Promise((resolve) => {
    const needsPhotoEdit = side === 'front' && (photoBrightness !== 100 || photoContrast !== 100);
    const needsTextEdit = textBoldness > 0 || textScale !== 100;

    if (!needsPhotoEdit && !needsTextEdit) {
      resolve(baseDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(img, 0, 0);

      if (side === 'front') {
        if (needsPhotoEdit && photoBox) {
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

        if (needsTextEdit && frontTextBox) {
          applySelectiveTextBoldAndScale(ctx, img, frontTextBox, textBoldness, textScale);
        }
      }

      if (side === 'back' && needsTextEdit && backTextBox) {
        applySelectiveTextBoldAndScale(ctx, img, backTextBox, textBoldness, textScale);
      }

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

  const [fullPdfPreviewUrl, setFullPdfPreviewUrl] = useState(null);
  const [showFullPdfInspector, setShowFullPdfInspector] = useState(false);
  const [pdfInspectorZoom, setPdfInspectorZoom] = useState(1);

  const [photoBrightness, setPhotoBrightness] = useState(133);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [textBoldness, setTextBoldness] = useState(4);
  const [textScale, setTextScale] = useState(100);

  const [showBoxesOnCard, setShowBoxesOnCard] = useState(false);
  const [showBoxTuning, setShowBoxTuning] = useState(false);

  const [showTextZoomModal, setShowTextZoomModal] = useState(false);
  const [textZoomSide, setTextZoomSide] = useState('front');
  const [textZoomLevel, setTextZoomLevel] = useState(2.25);

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

  const activePhotoBox = crop.photoBox || CARD_PRESETS[selectedPreset]?.photoBox || { x: 11, y: 22.8, w: 19.5, h: 37.5 };
  const activeFrontTextBox = crop.frontTextBox || CARD_PRESETS[selectedPreset]?.frontTextBox || { x: 32.5, y: 19.5, w: 45.5, h: 21 };
  const activeBackTextBox = crop.backTextBox || CARD_PRESETS[selectedPreset]?.backTextBox || { x: 4.5, y: 21.5, w: 54.5, h: 27.5 };

  const updateSubBoxField = (boxKey, field, val) => {
    const num = parseFloat(val);
    const fallbackBox =
      boxKey === 'photoBox'
        ? activePhotoBox
        : boxKey === 'frontTextBox'
        ? activeFrontTextBox
        : activeBackTextBox;

    setCrop((prev) => ({
      ...prev,
      [boxKey]: {
        ...(prev[boxKey] || fallbackBox),
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

  useEffect(() => {
    if (!rawPair) {
      setCardPair(null);
      return;
    }

    let cancelled = false;

    Promise.all([
      enhanceCardCanvas(rawPair.frontUrl, {
        side: 'front',
        photoBox: activePhotoBox,
        frontTextBox: activeFrontTextBox,
        backTextBox: activeBackTextBox,
        photoBrightness,
        photoContrast,
        textBoldness,
        textScale,
      }),
      enhanceCardCanvas(rawPair.backUrl, {
        side: 'back',
        photoBox: activePhotoBox,
        frontTextBox: activeFrontTextBox,
        backTextBox: activeBackTextBox,
        photoBrightness: 100,
        photoContrast: 100,
        textBoldness,
        textScale,
      }),
    ]).then(([enhancedFrontUrl, enhancedBackUrl]) => {
      if (cancelled) return;
      setCardPair({
        ...rawPair,
        frontUrl: enhancedFrontUrl,
        backUrl: enhancedBackUrl,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    rawPair,
    photoBrightness,
    photoContrast,
    textBoldness,
    textScale,
    activePhotoBox,
    activeFrontTextBox,
    activeBackTextBox,
  ]);

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
          🔒 <strong>100% Local Processing:</strong> Aadhaar 600 DPI, baaki PVC cards 300 DPI. Photo retouch, Name/DOB/Address Text Bold & Font Size browser mein hi kaam karte hain.
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

          {fullPdfPreviewUrl && showFullPdfInspector && (
            <div style={{ marginTop: '14px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #eab308' }}>
              <div className="mnc-row-between" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>
                  🟢 Green Box = Front Card | 🔵 Blue Box = Back Card
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
              <button
                type="button"
                className={`mnc-btn ${showTextZoomModal ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
                onClick={() => setShowTextZoomModal((v) => !v)}
              >
                🔍 {showTextZoomModal ? 'Close Text Zoom' : 'Zoom Text (Up to 400%)'}
              </button>
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

          {showTextZoomModal && (
            <div
              style={{
                marginTop: '14px',
                background: '#0f172a',
                color: '#f8fafc',
                borderRadius: '10px',
                padding: '14px 16px',
              }}
            >
              <div className="mnc-row-between" style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13px' }}>🔍 Text High-Zoom Inspector:</strong>
                  <button
                    type="button"
                    className={`mnc-btn ${textZoomSide === 'front' ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
                    onClick={() => setTextZoomSide('front')}
                  >
                    Front (Name / DOB / Gender)
                  </button>
                  <button
                    type="button"
                    className={`mnc-btn ${textZoomSide === 'back' ? 'mnc-btn-primary' : 'mnc-btn-ghost'}`}
                    onClick={() => setTextZoomSide('back')}
                  >
                    Back (Address / PIN)
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px' }}>Zoom ({Math.round(textZoomLevel * 100)}%):</span>
                  <input
                    type="range"
                    min="1.5"
                    max="4"
                    step="0.25"
                    value={textZoomLevel}
                    onChange={(e) => setTextZoomLevel(Number(e.target.value))}
                  />
                </div>
              </div>

              <div
                style={{
                  maxHeight: '340px',
                  overflow: 'auto',
                  background: '#1e293b',
                  borderRadius: '8px',
                  padding: '12px',
                  border: '1px solid #334155',
                }}
              >
                <img
                  src={textZoomSide === 'front' ? cardPair.frontUrl : cardPair.backUrl}
                  alt="Zoomed Card Text"
                  style={{
                    width: `${420 * textZoomLevel}px`,
                    height: 'auto',
                    display: 'block',
                    borderRadius: '6px',
                  }}
                />
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: '14px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'grid',
              gap: '14px',
            }}
          >
            <div>
              <div className="mnc-preset-row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                  ✨ Customer Photo Brightness & Contrast (Full Photo Selection):
                </strong>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    onClick={() => setShowBoxesOnCard((v) => !v)}
                  >
                    {showBoxesOnCard ? 'Hide Selection Boxes' : '👁️ Show Photo & Text Boxes'}
                  </button>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    onClick={() => setShowBoxTuning((v) => !v)}
                  >
                    {showBoxTuning ? 'Hide Box Coordinates' : '⚙ Resize Photo & Text Boxes'}
                  </button>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    onClick={() => {
                      setPhotoBrightness(133);
                      setPhotoContrast(100);
                    }}
                  >
                    Reset Photo
                  </button>
                </div>
              </div>

              <div className="mnc-controls-row" style={{ marginTop: '8px', justifyContent: 'flex-start', gap: '24px' }}>
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
            </div>

            <div style={{ paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
              <div className="mnc-preset-row" style={{ justifyContent: 'space-between' }}>
                <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                  🖋️ Selective Text Bold & Font Size (Front: Name/DOB/Gender • Back: Address — QR Untouched):
                </strong>
                <button
                  type="button"
                  className="mnc-btn mnc-btn-ghost"
                  onClick={() => {
                    setTextBoldness(4);
                    setTextScale(100);
                  }}
                >
                  Reset Text
                </button>
              </div>

              <div className="mnc-controls-row" style={{ marginTop: '8px', justifyContent: 'flex-start', gap: '24px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Text Boldness ({textBoldness === 0 ? 'Normal' : `Level ${textBoldness}`}):
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                    value={textBoldness}
                    onChange={(e) => setTextBoldness(Number(e.target.value))}
                  />
                </label>

                <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Text Font Size ({textScale}%):
                  <input
                    type="range"
                    min="100"
                    max="135"
                    step="2"
                    value={textScale}
                    onChange={(e) => setTextScale(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            {showBoxTuning && (
              <div style={{ paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'grid', gap: '10px' }}>
                <div className="mnc-calib-inputs">
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', minWidth: '155px' }}>🔴 Photo Box (%):</span>
                  <label>X <input type="number" step="0.5" value={activePhotoBox.x} onChange={(e) => updateSubBoxField('photoBox', 'x', e.target.value)} /></label>
                  <label>Y <input type="number" step="0.5" value={activePhotoBox.y} onChange={(e) => updateSubBoxField('photoBox', 'y', e.target.value)} /></label>
                  <label>W <input type="number" step="0.5" value={activePhotoBox.w} onChange={(e) => updateSubBoxField('photoBox', 'w', e.target.value)} /></label>
                  <label>H <input type="number" step="0.5" value={activePhotoBox.h} onChange={(e) => updateSubBoxField('photoBox', 'h', e.target.value)} /></label>
                </div>

                <div className="mnc-calib-inputs">
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', minWidth: '155px' }}>🟢 Front Name/DOB (%):</span>
                  <label>X <input type="number" step="0.5" value={activeFrontTextBox.x} onChange={(e) => updateSubBoxField('frontTextBox', 'x', e.target.value)} /></label>
                  <label>Y <input type="number" step="0.5" value={activeFrontTextBox.y} onChange={(e) => updateSubBoxField('frontTextBox', 'y', e.target.value)} /></label>
                  <label>W <input type="number" step="0.5" value={activeFrontTextBox.w} onChange={(e) => updateSubBoxField('frontTextBox', 'w', e.target.value)} /></label>
                  <label>H <input type="number" step="0.5" value={activeFrontTextBox.h} onChange={(e) => updateSubBoxField('frontTextBox', 'h', e.target.value)} /></label>
                </div>

                <div className="mnc-calib-inputs">
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', minWidth: '155px' }}>🔵 Back Address (%):</span>
                  <label>X <input type="number" step="0.5" value={activeBackTextBox.x} onChange={(e) => updateSubBoxField('backTextBox', 'x', e.target.value)} /></label>
                  <label>Y <input type="number" step="0.5" value={activeBackTextBox.y} onChange={(e) => updateSubBoxField('backTextBox', 'y', e.target.value)} /></label>
                  <label>W <input type="number" step="0.5" value={activeBackTextBox.w} onChange={(e) => updateSubBoxField('backTextBox', 'w', e.target.value)} /></label>
                  <label>H <input type="number" step="0.5" value={activeBackTextBox.h} onChange={(e) => updateSubBoxField('backTextBox', 'h', e.target.value)} /></label>
                </div>
              </div>
            )}
          </div>

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom ${layoutMode === 'a4' ? 'a4-preview-zoom' : ''} printable-sheet`}
            style={{ '--pvc-preview-zoom': previewZoom }}
          >
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={cardPair.frontUrl} alt="Card Front" className="cr80-card-img" />
              {showBoxesOnCard && (
                <>
                  <div
                    className="no-print"
                    style={{
                      position: 'absolute',
                      left: `${activePhotoBox.x}%`,
                      top: `${activePhotoBox.y}%`,
                      width: `${activePhotoBox.w}%`,
                      height: `${activePhotoBox.h}%`,
                      border: '2px dashed #ef4444',
                      background: 'rgba(239, 68, 68, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                  <div
                    className="no-print"
                    style={{
                      position: 'absolute',
                      left: `${activeFrontTextBox.x}%`,
                      top: `${activeFrontTextBox.y}%`,
                      width: `${activeFrontTextBox.w}%`,
                      height: `${activeFrontTextBox.h}%`,
                      border: '2px dashed #16a34a',
                      background: 'rgba(22, 163, 74, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                </>
              )}
            </div>

            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={cardPair.backUrl} alt="Card Back" className="cr80-card-img" />
              {showBoxesOnCard && (
                <div
                  className="no-print"
                  style={{
                    position: 'absolute',
                    left: `${activeBackTextBox.x}%`,
                    top: `${activeBackTextBox.y}%`,
                    width: `${activeBackTextBox.w}%`,
                    height: `${activeBackTextBox.h}%`,
                    border: '2px dashed #2563eb',
                    background: 'rgba(37, 99, 235, 0.12)',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

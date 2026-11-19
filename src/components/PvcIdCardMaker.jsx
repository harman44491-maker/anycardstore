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

// Exact calibrated boxes from user screenshot for e-Aadhaar
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

// Helper: Apply Boldness + Font Size Scale ONLY inside a target text box
function applySelectiveTextBoldAndScale(ctx, sourceImg, box, textBoldness, textScalePercent) {
  const w = sourceImg.width;
  const h = sourceImg.height;
  const tx = Math.round((box.x / 100) * w);
  const ty = Math.round((box.y / 100) * h);
  const tw = Math.round((box.w / 100) * w);
  const th = Math.round((box.h / 100) * h);

  if (tw <= 0 || th <= 0) return;

  // Offscreen canvas for isolated text region
  const regionCanvas = document.createElement('canvas');
  regionCanvas.width = tw;
  regionCanvas.height = th;
  const rCtx = regionCanvas.getContext('2d');
  rCtx.imageSmoothingEnabled = true;
  rCtx.imageSmoothingQuality = 'high';

  // Copy original region
  rCtx.drawImage(sourceImg, tx, ty, tw, th, 0, 0, tw, th);

  // Thicken dark text strokes via sub-pixel darken shifts
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

  // Clear target box with clean white background, then draw scaled text from top-left anchor
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

      // Draw full base card untouched
      ctx.drawImage(img, 0, 0);

      // Front card: Photo retouch + Name/DOB/Gender text bold & font scale
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

      // Back card: Address text bold & font scale ONLY (QR code untouched)
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

  // Pre-crop full PDF inspection & zoom
  const [fullPdfPreviewUrl, setFullPdfPreviewUrl] = useState(null);
  const [showFullPdfInspector, setShowFullPdfInspector] = useState(false);
  const [pdfInspectorZoom, setPdfInspectorZoom] = useState(1);

  // Default retouch values matching user's screenshot
  const [photoBrightness, setPhotoBrightness] = useState(133);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [textBoldness, setTextBoldness] = useState(4);
  const [textScale, setTextScale] = useState(100); // 100% to 135% font zoom

  // Visual guide & box fine-tuning toggles
  const [showBoxesOnCard, setShowBoxesOnCard] = useState(false);
  const [showBoxTuning, setShowBoxTuning] = useState(false);

  // High-zoom Text Loupe / Magnifier Inspector
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

  // Re-render Front & Back selectively when Photo or Text controls change
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
              style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5

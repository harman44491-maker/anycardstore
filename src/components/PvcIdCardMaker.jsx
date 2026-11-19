import React, { useState, useEffect } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const PVC_STORAGE_PREFIX = 'mnc_pvc_card_calibration_v22_';

const AADHAAR_OUTPUT_DPI = 600;
const AADHAAR_CARD_SPEC = {
  widthMm: 85.6,
  heightMm: 54,
  dpi: AADHAAR_OUTPUT_DPI,
  pxWidth: Math.round((85.6 * AADHAAR_OUTPUT_DPI) / 25.4),
  pxHeight: Math.round((54 * AADHAAR_OUTPUT_DPI) / 25.4),
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
    label: 'e-Aadhaar PDF (Bottom Cut)',
    y: 72.2,
    h: 20.6,
    frontX: 7.6,
    backX: 50.5,
    w: 42.0,
    photoBox: { x: 10.5, y: 22.3, w: 19.5, h: 37.5 },
    frontTextBox: { x: 32.5, y: 20.5, w: 41, h: 28 },
    frontDisclaimerBox: { x: 33.5, y: 45, w: 65, h: 36.5 },
    backTextBox: { x: 4.5, y: 19.5, w: 55, h: 43 },
    backQrBox: { x: 60.5, y: 18.5, w: 39, h: 58 },
  },
  voterId: {
    label: 'e-EPIC Voter ID PDF',
    y: 13.5,
    h: 25.5,
    frontX: 5.2,
    backX: 50.6,
    w: 44.0,
    photoBox: { x: 3.5, y: 21.0, w: 27.5, h: 55.0 },
    frontTextBox: { x: 31.0, y: 23.0, w: 63.0, h: 50.0 },
    frontDisclaimerBox: { x: 31.0, y: 73.0, w: 60.0, h: 15.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 56.0, h: 56.0 },
    backQrBox: { x: 62.0, y: 20.0, w: 31.0, h: 52.0 },
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
    frontDisclaimerBox: { x: 30.0, y: 76.0, w: 60.0, h: 14.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 88.0, h: 55.0 },
    backQrBox: { x: 62.0, y: 20.0, w: 31.0, h: 52.0 },
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
    frontDisclaimerBox: { x: 31.0, y: 72.0, w: 60.0, h: 15.0 },
    backTextBox: { x: 5.0, y: 20.0, w: 56.0, h: 56.0 },
    backQrBox: { x: 62.0, y: 20.0, w: 31.0, h: 52.0 },
  },
};

function isValidImageUrl(url) {
  return typeof url === 'string' && url.length > 60 && (url.startsWith('data:image/') || url.startsWith('blob:'));
}

function createSafePreviewDataUrl(sourceCanvas, maxWidth = 800) {
  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return '';
  try {
    const scale = Math.min(1, maxWidth / sourceCanvas.width);
    const w = Math.max(1, Math.round(sourceCanvas.width * scale));
    const h = Math.max(1, Math.round(sourceCanvas.height * scale));
    const thumb = document.createElement('canvas');
    thumb.width = w;
    thumb.height = h;
    const ctx = thumb.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sourceCanvas, 0, 0, w, h);
    const url = thumb.toDataURL('image/jpeg', 0.8);
    return isValidImageUrl(url) ? url : '';
  } catch {
    return '';
  }
}

function safeCropCardUrl(sourceCanvas, rectPercent, outWidth, outHeight, mimeType = 'image/png', quality = 0.92) {
  try {
    const fromUtil = cropPercentToCardCanvas(sourceCanvas, rectPercent, outWidth, outHeight);
    if (isValidImageUrl(fromUtil)) return fromUtil;
  } catch {
    // Fallback below
  }

  if (!sourceCanvas || !sourceCanvas.width || !sourceCanvas.height) return '';
  const { x, y, w, h } = rectPercent;
  const target = document.createElement('canvas');
  target.width = outWidth;
  target.height = outHeight;
  const ctx = target.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.drawImage(
    sourceCanvas,
    (sourceCanvas.width * x) / 100,
    (sourceCanvas.height * y) / 100,
    (sourceCanvas.width * w) / 100,
    (sourceCanvas.height * h) / 100,
    0,
    0,
    outWidth,
    outHeight
  );
  const url = mimeType === 'image/jpeg' ? target.toDataURL('image/jpeg', quality) : target.toDataURL('image/png');
  return isValidImageUrl(url) ? url : '';
}

function applySelectiveTextBoldScaleAndMove(ctx, sourceImg, box, options) {
  const { textBoldness, textScalePercent, offsetX = 0, offsetY = 0 } = options;
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

    const dpiFactor = Math.max(1, w / 1011);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.75, 0.75],
      [-0.75, 0.75],
      [0.75, -0.75],
      [-0.75, -0.75],
    ];

    const passes = Math.min(12, Math.max(1, Math.round(textBoldness)));
    rCtx.save();
    rCtx.globalCompositeOperation = 'darken';
    rCtx.globalAlpha = 0.65;
    for (let i = 0; i < passes; i++) {
      const [dx, dy] = dirs[i % dirs.length];
      const ring = 1 + Math.floor(i / 4) * 0.65;
      const shift = ring * 0.85 * dpiFactor;
      rCtx.drawImage(baseRegion, dx * shift, dy * shift);
    }
    rCtx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(tx, ty, tw, th);

  const scale = textScalePercent / 100;
  const destX = tx + Math.round((offsetX / 100) * w);
  const destY = ty + Math.round((offsetY / 100) * h);
  const destW = Math.round(tw * scale);
  const destH = Math.round(th * scale);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(regionCanvas, 0, 0, tw, th, destX, destY, destW, destH);
  ctx.restore();
}

function applyBoxShrinkAndMove(ctx, sourceImg, box, options) {
  const { scalePercent = 100, offsetX = 0, offsetY = 0, align = 'top-left' } = options;
  if (!box) return;
  if (scalePercent === 100 && offsetX === 0 && offsetY === 0) return;

  const w = sourceImg.width;
  const h = sourceImg.height;
  const bx = Math.round((box.x / 100) * w);
  const by = Math.round((box.y / 100) * h);
  const bw = Math.round((box.w / 100) * w);
  const bh = Math.round((box.h / 100) * h);

  if (bw <= 0 || bh <= 0) return;

  const scale = scalePercent / 100;
  const newW = Math.round(bw * scale);
  const newH = Math.round(bh * scale);

  const baseDestX = align === 'center' ? bx + Math.round((bw - newW) / 2) : bx;
  const baseDestY = align === 'center' ? by + Math.round((bh - newH) / 2) : by;

  const destX = baseDestX + Math.round((offsetX / 100) * w);
  const destY = baseDestY + Math.round((offsetY / 100) * h);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, bw, bh);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = align === 'center' ? 'medium' : 'high';
  ctx.drawImage(sourceImg, bx, by, bw, bh, destX, destY, newW, newH);
  ctx.restore();
}

function enhanceCardCanvas(baseDataUrl, options) {
  const {
    side,
    photoBox,
    frontTextBox,
    frontDisclaimerBox,
    backTextBox,
    backQrBox,
    photoBrightness,
    photoContrast,
    textBoldness,
    textScale,
    disclaimerScale,
    disclaimerOffsetX,
    disclaimerOffsetY,
    backAddressOffsetX,
    backAddressOffsetY,
    qrScale,
    qrOffsetX,
    qrOffsetY,
  } = options;

  return new Promise((resolve) => {
    const needsPhotoEdit = side === 'front' && (photoBrightness !== 100 || photoContrast !== 100);
    const needsFrontTextEdit = side === 'front' && (textBoldness > 0 || textScale !== 100);
    const needsFrontDisclaimerEdit =
      side === 'front' && (disclaimerScale !== 100 || disclaimerOffsetX !== 0 || disclaimerOffsetY !== 0);
    const needsBackTextEdit =
      side === 'back' && (textBoldness > 0 || textScale !== 100 || backAddressOffsetX !== 0 || backAddressOffsetY !== 0);
    const needsBackQrEdit = side === 'back' && (qrScale !== 100 || qrOffsetX !== 0 || qrOffsetY !== 0);

    if (!needsPhotoEdit && !needsFrontTextEdit && !needsFrontDisclaimerEdit && !needsBackTextEdit && !needsBackQrEdit) {
      resolve(baseDataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      if (!w || !h) {
        resolve(baseDataUrl);
        return;
      }

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

        if (needsFrontDisclaimerEdit && frontDisclaimerBox) {
          applyBoxShrinkAndMove(ctx, img, frontDisclaimerBox, {
            scalePercent: disclaimerScale,
            offsetX: disclaimerOffsetX,
            offsetY: disclaimerOffsetY,
            align: 'top-left',
          });
        }

        if (needsFrontTextEdit && frontTextBox) {
          applySelectiveTextBoldScaleAndMove(ctx, img, frontTextBox, {
            textBoldness,
            textScalePercent: textScale,
            offsetX: 0,
            offsetY: 0,
          });
        }
      }

      if (side === 'back') {
        if (needsBackQrEdit && backQrBox) {
          applyBoxShrinkAndMove(ctx, img, backQrBox, {
            scalePercent: qrScale,
            offsetX: qrOffsetX,
            offsetY: qrOffsetY,
            align: 'center',
          });
        }

        if (needsBackTextEdit && backTextBox) {
          applySelectiveTextBoldScaleAndMove(ctx, img, backTextBox, {
            textBoldness,
            textScalePercent: textScale,
            offsetX: backAddressOffsetX,
            offsetY: backAddressOffsetY,
          });
        }
      }

      const outUrl = canvas.toDataURL('image/png');
      resolve(isValidImageUrl(outUrl) ? outUrl : baseDataUrl);
    };
    img.onerror = () => resolve(baseDataUrl);
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
  const [textBoldness, setTextBoldness] = useState(5);
  const [textScale, setTextScale] = useState(130);

  const [disclaimerScale, setDisclaimerScale] = useState(73);
  const [disclaimerOffsetX, setDisclaimerOffsetX] = useState(7.5);
  const [disclaimerOffsetY, setDisclaimerOffsetY] = useState(12);

  const [backAddressOffsetX, setBackAddressOffsetX] = useState(0);
  const [backAddressOffsetY, setBackAddressOffsetY] = useState(-0.5);

  const [qrScale, setQrScale] = useState(65);
  const [qrOffsetX, setQrOffsetX] = useState(9);
  const [qrOffsetY, setQrOffsetY] = useState(3.5);

  const [showBoxesOnCard, setShowBoxesOnCard] = useState(false);
  const [showBoxTuning, setShowBoxTuning] = useState(true);

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

  const isAadhaarMode = selectedPreset === 'eaadhaar';
  const isVoterMode = selectedPreset === 'voterId';
  const outputSpec = isAadhaarMode
    ? AADHAAR_CARD_SPEC
    : isVoterMode
      ? COMPACT_CARD_SPEC
      : SHOP_CONFIG.cr80CardSpec;
  const outputDpi = isAadhaarMode ? AADHAAR_OUTPUT_DPI : isVoterMode ? COMPACT_300_DPI : 300;

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

  const activePhotoBox = crop.photoBox || CARD_PRESETS[selectedPreset]?.photoBox || { x: 10.5, y: 22.3, w: 19.5, h: 37.5 };
  const activeFrontTextBox = crop.frontTextBox || CARD_PRESETS[selectedPreset]?.frontTextBox || { x: 32.5, y: 20.5, w: 41, h: 28 };
  const activeFrontDisclaimerBox =
    crop.frontDisclaimerBox || CARD_PRESETS[selectedPreset]?.frontDisclaimerBox || { x: 33.5, y: 45, w: 65, h: 36.5 };
  const activeBackTextBox = crop.backTextBox || CARD_PRESETS[selectedPreset]?.backTextBox || { x: 4.5, y: 19.5, w: 55, h: 43 };
  const activeBackQrBox = crop.backQrBox || CARD_PRESETS[selectedPreset]?.backQrBox || { x: 60.5, y: 18.5, w: 39, h: 58 };

  const updateSubBoxField = (boxKey, field, val) => {
    const num = parseFloat(val);
    const boxMap = {
      photoBox: activePhotoBox,
      frontTextBox: activeFrontTextBox,
      frontDisclaimerBox: activeFrontDisclaimerBox,
      backTextBox: activeBackTextBox,
      backQrBox: activeBackQrBox,
    };

    setCrop((prev) => ({
      ...prev,
      [boxKey]: {
        ...(prev[boxKey] || boxMap[boxKey]),
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
      const sourceRenderScale = isAadhaarMode
        ? AADHAAR_CARD_SPEC.renderScale
        : isVoterMode
          ? COMPACT_CARD_SPEC.renderScale
          : 3;
      const pageCanvas = await renderPdfPageToCanvas(pdfFile, sourceRenderScale, pdfPassword.trim());

      const previewMaxWidth = isAadhaarMode ? 1000 : 800;
      const previewUrl = createSafePreviewDataUrl(pageCanvas, previewMaxWidth);
      if (previewUrl) {
        setFullPdfPreviewUrl(previewUrl);
      }

      const cropMime = isVoterMode ? 'image/jpeg' : 'image/png';
      const cropQuality = isVoterMode ? 0.9 : 0.92;

      const frontUrl = safeCropCardUrl(
        pageCanvas,
        { x: crop.frontX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight,
        cropMime,
        cropQuality
      );
      const backUrl = safeCropCardUrl(
        pageCanvas,
        { x: crop.backX, y: crop.y, w: crop.w, h: crop.h },
        pxWidth,
        pxHeight,
        cropMime,
        cropQuality
      );

      if (!frontUrl || !backUrl) {
        setErrorMsg('Card image generate nahi ho paayi. Crop values ya PDF file check karein.');
        return;
      }

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

    if (isVoterMode) {
      setCardPair(rawPair);
      return;
    }

    let cancelled = false;

    const commonOpts = {
      photoBox: activePhotoBox,
      frontTextBox: activeFrontTextBox,
      frontDisclaimerBox: activeFrontDisclaimerBox,
      backTextBox: activeBackTextBox,
      backQrBox: activeBackQrBox,
      photoBrightness,
      photoContrast,
      textBoldness,
      textScale,
      disclaimerScale,
      disclaimerOffsetX,
      disclaimerOffsetY,
      backAddressOffsetX,
      backAddressOffsetY,
      qrScale,
      qrOffsetX,
      qrOffsetY,
    };

    Promise.all([
      enhanceCardCanvas(rawPair.frontUrl, { side: 'front', ...commonOpts }),
      enhanceCardCanvas(rawPair.backUrl, { side: 'back', ...commonOpts }),
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
    isVoterMode,
    photoBrightness,
    photoContrast,
    textBoldness,
    textScale,
    disclaimerScale,
    disclaimerOffsetX,
    disclaimerOffsetY,
    backAddressOffsetX,
    backAddressOffsetY,
    qrScale,
    qrOffsetX,
    qrOffsetY,
    activePhotoBox,
    activeFrontTextBox,
    activeFrontDisclaimerBox,
    activeBackTextBox,
    activeBackQrBox,
  ]);

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
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div className="mnc-privacy-banner">
        <span>
          🔒 <strong>100% Local Processing:</strong> Aadhaar 600 DPI ({AADHAAR_CARD_SPEC.pxWidth}×{AADHAAR_CARD_SPEC.pxHeight}px), e-EPIC Voter 300 DPI ({COMPACT_CARD_SPEC.pxWidth}×{COMPACT_CARD_SPEC.pxHeight}px). Card size: 90 × 60 mm, Gap: 2mm, Top: 3mm, L/R: 5mm.
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
            <span className="mnc-calib-hint">
              {isVoterMode
                ? 'e-EPIC Voter PDF 300 DPI aur compact resolution par crop hoga (Aadhaar 600 DPI settings par koi asar nahi).'
                : 'Aadhaar ya Voter PDF mein card position thodi alag ho to yahan se adjust karein (Card: 90mm × 60mm, Gap: 2mm).'}
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
              <p className="mnc-muted">Card Size: {cardPair.widthMm}mm × {cardPair.heightMm}mm @ {cardPair.dpi} DPI | Gap: 2mm | Top: 3mm | L/R: 5mm</p>
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

          {!isVoterMode && (
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
                      {showBoxesOnCard ? 'Hide Selection Boxes' : '👁️ Show All Boxes'}
                    </button>
                    <button
                      type="button"
                      className="mnc-btn mnc-btn-ghost"
                      onClick={() => setShowBoxTuning((v) => !v)}
                    >
                      {showBoxTuning ? 'Hide Box Coordinates' : '⚙ Resize All Boxes'}
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
                    🖋️ Selective Text Bold (3x Power: 0–12) & Unclipped Font Size (Front: Name/DOB • Back: Address):
                  </strong>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    onClick={() => {
                      setTextBoldness(5);
                      setTextScale(130);
                    }}
                  >
                    Reset Text
                  </button>
                </div>

                <div className="mnc-controls-row" style={{ marginTop: '8px', justifyContent: 'flex-start', gap: '24px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Text Boldness ({textBoldness === 0 ? 'Normal' : `Level ${textBoldness} / 12`}):
                    <input
                      type="range"
                      min="0"
                      max="12"
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
                      max="140"
                      step="2"
                      value={textScale}
                      onChange={(e) => setTextScale(Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>

              <div style={{ paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'grid', gap: '12px' }}>
                <div className="mnc-preset-row" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                    📐 Resize & Position Controls (Up/Down & Left/Right Move):
                  </strong>
                  <button
                    type="button"
                    className="mnc-btn mnc-btn-ghost"
                    onClick={() => {
                      setDisclaimerScale(73);
                      setDisclaimerOffsetX(7.5);
                      setDisclaimerOffsetY(12);
                      setBackAddressOffsetX(0);
                      setBackAddressOffsetY(-0.5);
                      setQrScale(65);
                      setQrOffsetX(9);
                      setQrOffsetY(3.5);
                    }}
                  >
                    Reset Positions
                  </button>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #fed7aa' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#c2410c', marginBottom: '6px' }}>
                    🟠 1. Front Disclaimer Box (Size & Move):
                  </div>
                  <div className="mnc-controls-row" style={{ justifyContent: 'flex-start', gap: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Size ({disclaimerScale}%):
                      <input type="range" min="65" max="100" step="1" value={disclaimerScale} onChange={(e) => setDisclaimerScale(Number(e.target.value))} />
                    </label>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Left / Right ({disclaimerOffsetX}%):
                      <input type="range" min="-15" max="15" step="0.5" value={disclaimerOffsetX} onChange={(e) => setDisclaimerOffsetX(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setDisclaimerOffsetX((v) => +(v - 0.5).toFixed(1))}>◀</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setDisclaimerOffsetX((v) => +(v + 0.5).toFixed(1))}>▶</button>
                    </label>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Up / Down ({disclaimerOffsetY}%):
                      <input type="range" min="-15" max="15" step="0.5" value={disclaimerOffsetY} onChange={(e) => setDisclaimerOffsetY(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setDisclaimerOffsetY((v) => +(v - 0.5).toFixed(1))}>▲</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setDisclaimerOffsetY((v) => +(v + 0.5).toFixed(1))}>▼</button>
                    </label>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8', marginBottom: '6px' }}>
                    🔵 2. Back Address Text (Move Left/Right & Up/Down):
                  </div>
                  <div className="mnc-controls-row" style={{ justifyContent: 'flex-start', gap: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Left / Right ({backAddressOffsetX}%):
                      <input type="range" min="-15" max="15" step="0.5" value={backAddressOffsetX} onChange={(e) => setBackAddressOffsetX(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setBackAddressOffsetX((v) => +(v - 0.5).toFixed(1))}>◀</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setBackAddressOffsetX((v) => +(v + 0.5).toFixed(1))}>▶</button>
                    </label>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Up / Down ({backAddressOffsetY}%):
                      <input type="range" min="-15" max="15" step="0.5" value={backAddressOffsetY} onChange={(e) => setBackAddressOffsetY(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setBackAddressOffsetY((v) => +(v - 0.5).toFixed(1))}>▲</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setBackAddressOffsetY((v) => +(v + 0.5).toFixed(1))}>▼</button>
                    </label>
                  </div>
                </div>

                <div style={{ background: '#fff', padding: '8px 12px', borderRadius: '8px', border: '1px solid #ddd6fe' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9', marginBottom: '6px' }}>
                    🟣 3. Back QR Code (Size & Move Left/Right, Up/Down):
                  </div>
                  <div className="mnc-controls-row" style={{ justifyContent: 'flex-start', gap: '18px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Size ({qrScale}%):
                      <input type="range" min="65" max="100" step="1" value={qrScale} onChange={(e) => setQrScale(Number(e.target.value))} />
                    </label>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Left / Right ({qrOffsetX}%):
                      <input type="range" min="-15" max="15" step="0.5" value={qrOffsetX} onChange={(e) => setQrOffsetX(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setQrOffsetX((v) => +(v - 0.5).toFixed(1))}>◀</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setQrOffsetX((v) => +(v + 0.5).toFixed(1))}>▶</button>
                    </label>
                    <label style={{ fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Up / Down ({qrOffsetY}%):
                      <input type="range" min="-15" max="15" step="0.5" value={qrOffsetY} onChange={(e) => setQrOffsetY(Number(e.target.value))} />
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setQrOffsetY((v) => +(v - 0.5).toFixed(1))}>▲</button>
                      <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setQrOffsetY((v) => +(v + 0.5).toFixed(1))}>▼</button>
                    </label>
                  </div>
                </div>
              </div>

              {showBoxTuning && (
                <div style={{ paddingTop: '12px', borderTop: '1px dashed #cbd5e1', display: 'grid', gap: '10px' }}>
                  <div className="mnc-calib-inputs">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626', minWidth: '175px' }}>🔴 Photo Box (%):</span>
                    <label>X <input type="number" step="0.5" value={activePhotoBox.x} onChange={(e) => updateSubBoxField('photoBox', 'x', e.target.value)} /></label>
                    <label>Y <input type="number" step="0.5" value={activePhotoBox.y} onChange={(e) => updateSubBoxField('photoBox', 'y', e.target.value)} /></label>
                    <label>W <input type="number" step="0.5" value={activePhotoBox.w} onChange={(e) => updateSubBoxField('photoBox', 'w', e.target.value)} /></label>
                    <label>H <input type="number" step="0.5" value={activePhotoBox.h} onChange={(e) => updateSubBoxField('photoBox', 'h', e.target.value)} /></label>
                  </div>

                  <div className="mnc-calib-inputs">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a', minWidth: '175px' }}>🟢 Front Name/DOB (%):</span>
                    <label>X <input type="number" step="0.5" value={activeFrontTextBox.x} onChange={(e) => updateSubBoxField('frontTextBox', 'x', e.target.value)} /></label>
                    <label>Y <input type="number" step="0.5" value={activeFrontTextBox.y} onChange={(e) => updateSubBoxField('frontTextBox', 'y', e.target.value)} /></label>
                    <label>W <input type="number" step="0.5" value={activeFrontTextBox.w} onChange={(e) => updateSubBoxField('frontTextBox', 'w', e.target.value)} /></label>
                    <label>H <input type="number" step="0.5" value={activeFrontTextBox.h} onChange={(e) => updateSubBoxField('frontTextBox', 'h', e.target.value)} /></label>
                  </div>

                  <div className="mnc-calib-inputs">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#d97706', minWidth: '175px' }}>🟠 Front Disclaimer (%):</span>
                    <label>X <input type="number" step="0.5" value={activeFrontDisclaimerBox.x} onChange={(e) => updateSubBoxField('frontDisclaimerBox', 'x', e.target.value)} /></label>
                    <label>Y <input type="number" step="0.5" value={activeFrontDisclaimerBox.y} onChange={(e) => updateSubBoxField('frontDisclaimerBox', 'y', e.target.value)} /></label>
                    <label>W <input type="number" step="0.5" value={activeFrontDisclaimerBox.w} onChange={(e) => updateSubBoxField('frontDisclaimerBox', 'w', e.target.value)} /></label>
                    <label>H <input type="number" step="0.5" value={activeFrontDisclaimerBox.h} onChange={(e) => updateSubBoxField('frontDisclaimerBox', 'h', e.target.value)} /></label>
                  </div>

                  <div className="mnc-calib-inputs">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#2563eb', minWidth: '175px' }}>🔵 Back Address (%):</span>
                    <label>X <input type="number" step="0.5" value={activeBackTextBox.x} onChange={(e) => updateSubBoxField('backTextBox', 'x', e.target.value)} /></label>
                    <label>Y <input type="number" step="0.5" value={activeBackTextBox.y} onChange={(e) => updateSubBoxField('backTextBox', 'y', e.target.value)} /></label>
                    <label>W <input type="number" step="0.5" value={activeBackTextBox.w} onChange={(e) => updateSubBoxField('backTextBox', 'w', e.target.value)} /></label>
                    <label>H <input type="number" step="0.5" value={activeBackTextBox.h} onChange={(e) => updateSubBoxField('backTextBox', 'h', e.target.value)} /></label>
                  </div>

                  <div className="mnc-calib-inputs">
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', minWidth: '175px' }}>🟣 Back QR Code (%):</span>
                    <label>X <input type="number" step="0.5" value={activeBackQrBox.x} onChange={(e) => updateSubBoxField('backQrBox', 'x', e.target.value)} /></label>
                    <label>Y <input type="number" step="0.5" value={activeBackQrBox.y} onChange={(e) => updateSubBoxField('backQrBox', 'y', e.target.value)} /></label>
                    <label>W <input type="number" step="0.5" value={activeBackQrBox.w} onChange={(e) => updateSubBoxField('backQrBox', 'w', e.target.value)} /></label>
                    <label>H <input type="number" step="0.5" value={activeBackQrBox.h} onChange={(e) => updateSubBoxField('backQrBox', 'h', e.target.value)} /></label>
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            className={`mnc-pvc-stage ${layoutMode} pvc-preview-zoom ${layoutMode === 'a4' ? 'a4-preview-zoom' : ''} printable-sheet mnc-pvc-print-only-stage`}
            style={{ '--pvc-preview-zoom': previewZoom, marginTop: '3mm', marginLeft: '5mm', marginRight: '5mm', gap: '2mm' }}
          >
            <div className="mnc-pvc-card-box" style={{ position: 'relative', display: 'inline-block' }}>
              <img src={cardPair.frontUrl} alt="Card Front" className="cr80-card-img" />
              {!isVoterMode && showBoxesOnCard && (
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
                  <div
                    className="no-print"
                    style={{
                      position: 'absolute',
                      left: `${activeFrontDisclaimerBox.x}%`,
                      top: `${activeFrontDisclaimerBox.y}%`,
                      width: `${activeFrontDisclaimerBox.w}%`,
                      height: `${activeFrontDisclaimerBox.h}%`,
                      border: '2px dashed #d97706',
                      background: 'rgba(217, 119, 6, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                </>
              )}
            </div>

            <div className="mnc-pvc-card-box" style={{ position: 'relative', display: 'inline-block' }}>
              <img src={cardPair.backUrl} alt="Card Back" className="cr80-card-img" />
              {!isVoterMode && showBoxesOnCard && (
                <>
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
                  <div
                    className="no-print"
                    style={{
                      position: 'absolute',
                      left: `${activeBackQrBox.x}%`,
                      top: `${activeBackQrBox.y}%`,
                      width: `${activeBackQrBox.w}%`,
                      height: `${activeBackQrBox.h}%`,
                      border: '2px dashed #7c3aed',
                      background: 'rgba(124, 58, 237, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

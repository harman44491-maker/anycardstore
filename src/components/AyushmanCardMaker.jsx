import React, { useState, useEffect, useRef } from 'react';
import { renderPdfPageToCanvas, cropPercentToCardCanvas } from '../utils/pdfRenderer';
import { SHOP_CONFIG } from '../config/shopConfig';

const STORAGE_KEY = 'mnc_ayushman_crop_calibration_v1';

const PRESETS = {
  sehatPunjab: {
    label: 'Mukhya Mantri Sehat Yojana',
    y: 12,
    h: 28,
    frontX: 6,
    backX: 51,
    w: 43,
  },
  ayushmanBharat: {
    label: 'Ayushman Bharat (PM-JAY)',
    y: 14,
    h: 27,
    frontX: 6,
    backX: 51,
    w: 43,
  },
};

export default function AyushmanCardMaker() {
  const [files, setFiles] = useState([null, null, null, null, null]);
  const [crop, setCrop] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : PRESETS.sehatPunjab;
    } catch {
      return PRESETS.sehatPunjab;
    }
  });

  const [cards, setCards] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const frontCanvasRef = useRef(null);
  const backCanvasRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(crop));
    } catch {
      // Ignore storage errors
    }
  }, [crop]);

  const setFileAt = (index, file) => {
    setFiles((prev) => prev.map((item, idx) => (idx === index ? file || null : item)));
  };

  const updateCropField = (field, rawVal) => {
    const num = parseFloat(rawVal);
    setCrop((prev) => ({
      ...prev,
      [field]: Number.isNaN(num) ? 0 : num,
    }));
  };

  const handleGenerate = async () => {
    const selected = files.filter(Boolean);
    if (!selected.length) {
      alert('Kripya kam se kam 1 PDF file select karein.');
      return;
    }

    setLoading(true);
    try {
      const { pxWidth, pxHeight } = SHOP_CONFIG.cr80CardSpec;
      const generated = [];

      for (const file of selected) {
        const pageCanvas = await renderPdfPageToCanvas(file, 3);
        const frontDataUrl = cropPercentToCardCanvas(
          pageCanvas,
          { x: crop.frontX, y: crop.y, w: crop.w, h: crop.h },
          pxWidth,
          pxHeight
        );
        const backDataUrl = cropPercentToCardCanvas(
          pageCanvas,
          { x: crop.backX, y: crop.y, w: crop.w, h: crop.h },
          pxWidth,
          pxHeight
        );

        generated.push({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name.replace(/\.pdf$/i, ''),
          frontDataUrl,
          backDataUrl,
        });
      }

      setCards(generated);
      setActiveIndex(0);
    } catch (err) {
      console.error('PDF conversion error:', err);
      alert('PDF read karne mein error aaya. Kripya valid PDF file check karein.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const current = cards[activeIndex];
    if (!current) return;

    const paint = (url, canvas) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = url;
    };

    paint(current.frontDataUrl, frontCanvasRef.current);
    paint(current.backDataUrl, backCanvasRef.current);
  }, [cards, activeIndex]);

  const downloadPng = (side) => {
    const current = cards[activeIndex];
    if (!current) return;
    const link = document.createElement('a');
    link.href = side === 'front' ? current.frontDataUrl : current.backDataUrl;
    link.download = `${current.name}_${side}_300dpi.png`;
    link.click();
  };

  const activeCard = cards[activeIndex];

  return (
    <section>
      <div className="mnc-privacy-banner">
        <span>
          ⚡ <strong>Offline / Fast (300 DPI):</strong> Yeh poora code aapke browser mein hi PDF ko 300 DPI par convert karta hai — kisi server par customer ka data upload nahi hota.
        </span>
      </div>

      <div className="mnc-card">
        <div className="mnc-row-between">
          <div>
            <h3>1. Upload Ayushman / Mukhya Mantri Sehat Card PDF(s)</h3>
            <p className="mnc-muted">Ek baar mein 5 PDFs tak select karein. Har card exact CR80 PVC size (85.6mm × 54mm) mein niklega.</p>
          </div>
          <div className="mnc-preset-row">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                className="mnc-btn mnc-btn-ghost"
                onClick={() => setCrop({ ...preset })}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mnc-yellow-calibration">
          <div className="mnc-calib-header">
            <strong>🎯 Crop Calibration Bar (% of PDF Page) — Auto-Saved:</strong>
            <span className="mnc-calib-hint">
              Kyunki Ayushman Bharat aur Mukhya Mantri Sehat Yojana ke PDF mein card ki position thodi upar-neeche ho sakti hai, ek baar set kar lein; har card exact 85.6mm × 54mm niklega.
            </span>
          </div>
          <div className="mnc-calib-inputs">
            <label>
              Top Y (%)
              <input type="number" step="0.5" min="0" max="90" value={crop.y} onChange={(e) => updateCropField('y', e.target.value)} />
            </label>
            <label>
              Height (%)
              <input type="number" step="0.5" min="5" max="90" value={crop.h} onChange={(e) => updateCropField('h', e.target.value)} />
            </label>
            <label>
              Front X (%)
              <input type="number" step="0.5" min="0" max="90" value={crop.frontX} onChange={(e) => updateCropField('frontX', e.target.value)} />
            </label>
            <label>
              Back X (%)
              <input type="number" step="0.5" min="0" max="90" value={crop.backX} onChange={(e) => updateCropField('backX', e.target.value)} />
            </label>
            <label>
              Card Width (%)
              <input type="number" step="0.5" min="10" max="90" value={crop.w} onChange={(e) => updateCropField('w', e.target.value)} />
            </label>
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => setCrop(PRESETS.sehatPunjab)}>
              Reset Default
            </button>
          </div>
        </div>

        <div className="mnc-grid-5">
          {files.map((_, idx) => (
            <div className="mnc-upload-box" key={idx}>
              <label>Select File {idx + 1} {idx === 0 ? '*' : ''}</label>
              <input type="file" accept="application/pdf" onChange={(e) => setFileAt(idx, e.target.files?.[0])} />
            </div>
          ))}
        </div>

        <button type="button" className="mnc-btn mnc-btn-primary" disabled={loading} onClick={handleGenerate}>
          {loading ? '⏳ Rendering 300 DPI...' : '⚡ Generate CR80 Cards'}
        </button>
      </div>

      {cards.length > 0 && activeCard && (
        <div className="mnc-card mnc-mt-20">
          <div className="mnc-row-between">
            <div>
              <h3>2. Front & Back Preview (CR80 PVC Size: 85.6mm × 54mm)</h3>
              <p className="mnc-muted">
                Card {activeIndex + 1} of {cards.length} — <strong>{activeCard.name}</strong>
              </p>
            </div>
            <div className="mnc-preset-row">
              <button
                type="button"
                className="mnc-btn mnc-btn-ghost"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                ◀ Previous
              </button>
              <button
                type="button"
                className="mnc-btn mnc-btn-ghost"
                disabled={activeIndex === cards.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(cards.length - 1, i + 1))}
              >
                Next ▶
              </button>
            </div>
          </div>

          <div className="mnc-slider-stage">
            <div className="mnc-side-box">
              <span>FRONT SIDE (300 DPI)</span>
              <canvas ref={frontCanvasRef} width={1011} height={638} className="mnc-preview-canvas" />
            </div>
            <div className="mnc-side-box">
              <span>BACK SIDE (300 DPI)</span>
              <canvas ref={backCanvasRef} width={1011} height={638} className="mnc-preview-canvas" />
            </div>
          </div>

          <div className="mnc-center-actions">
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadPng('front')}>
              ⬇ Download Front PNG
            </button>
            <button type="button" className="mnc-btn mnc-btn-ghost" onClick={() => downloadPng('back')}>
              ⬇ Download Back PNG
            </button>
          </div>
        </div>
      )}

      {cards.length > 0 && (
        <div className="mnc-card mnc-mt-20">
          <div className="mnc-row-between">
            <div>
              <h3>3. A4 Size Print Sheet ({cards.length} Card{cards.length > 1 ? 's' : ''})</h3>
              <p className="mnc-muted">Exact 85.6mm × 54mm dimensions for A4 printing & lamination.</p>
            </div>
            <button type="button" className="mnc-btn mnc-btn-success" onClick={() => window.print()}>
              🖨️ Print / Save as A4 PDF
            </button>
          </div>

          <div className="mnc-a4-preview printable-sheet">
            {cards.map((card) => (
              <div className="mnc-card-pair" key={card.id}>
                <img src={card.frontDataUrl} alt={`${card.name} Front`} className="cr80-card-img" />
                <img src={card.backDataUrl} alt={`${card.name} Back`} className="cr80-card-img" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

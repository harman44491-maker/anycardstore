import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import './AyushmanCardMaker.css';

// Configure Vite-compatible PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const INITIAL_FILES = [null, null, null, null, null];

export default function AyushmanCardMaker() {
  const [files, setFiles] = useState(INITIAL_FILES);
  const [extractedCards, setExtractedCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Crop calibration state (% of PDF page)
  const [cropConfig, setCropConfig] = useState({
    cropY: 12,
    cropH: 28,
    frontX: 6,
    backX: 51,
    cropW: 43,
  });

  const frontCanvasRef = useRef(null);
  const backCanvasRef = useRef(null);

  const handleFileChange = (index, file) => {
    const updated = [...files];
    updated[index] = file || null;
    setFiles(updated);
  };

  const handleConfigChange = (key, value) => {
    setCropConfig((prev) => ({
      ...prev,
      [key]: parseFloat(value) || 0,
    }));
  };

  const processPDFs = async () => {
    const validFiles = files.filter(Boolean);
    if (validFiles.length === 0) {
      alert('Please select at least 1 PDF file.');
      return;
    }

    setIsProcessing(true);
    const results = [];

    const yRatio = cropConfig.cropY / 100;
    const hRatio = cropConfig.cropH / 100;
    const frontXRatio = cropConfig.frontX / 100;
    const backXRatio = cropConfig.backX / 100;
    const wRatio = cropConfig.cropW / 100;

    try {
      for (const file of validFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Scale 3 (~300 DPI) for sharp PVC & A4 printing
        const viewport = page.getViewport({ scale: 3 });
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = viewport.width;
        fullCanvas.height = viewport.height;
        const ctx = fullCanvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;

        const cropSide = (xRatio) => {
          const sideCanvas = document.createElement('canvas');
          sideCanvas.width = 1011; // CR80 300 DPI width
          sideCanvas.height = 638; // CR80 300 DPI height
          sideCanvas.getContext('2d').drawImage(
            fullCanvas,
            fullCanvas.width * xRatio,
            fullCanvas.height * yRatio,
            fullCanvas.width * wRatio,
            fullCanvas.height * hRatio,
            0,
            0,
            1011,
            638
          );
          return sideCanvas.toDataURL('image/png');
        };

        results.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.pdf$/i, ''),
          frontDataUrl: cropSide(frontXRatio),
          backDataUrl: cropSide(backXRatio),
        });
      }

      setExtractedCards(results);
      setCurrentIndex(0);
    } catch (error) {
      console.error('PDF processing failed:', error);
      alert('Error reading one of the PDF files. Please check the file and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Draw active slide onto preview canvases whenever index or cards update
  useEffect(() => {
    if (extractedCards.length === 0) return;
    const activeCard = extractedCards[currentIndex];
    if (!activeCard) return;

    const drawToCanvas = (dataUrl, canvasEl) => {
      if (!canvasEl) return;
      const ctx = canvasEl.getContext('2d');
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        ctx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
      };
      img.src = dataUrl;
    };

    drawToCanvas(activeCard.frontDataUrl, frontCanvasRef.current);
    drawToCanvas(activeCard.backDataUrl, backCanvasRef.current);
  }, [extractedCards, currentIndex]);

  const downloadSingle = (side) => {
    const activeCard = extractedCards[currentIndex];
    if (!activeCard) return;

    const link = document.createElement('a');
    link.href = side === 'front' ? activeCard.frontDataUrl : activeCard.backDataUrl;
    link.download = `${activeCard.name}_${side}.png`;
    link.click();
  };

  const resetAll = () => {
    setFiles(INITIAL_FILES);
    setExtractedCards([]);
    setCurrentIndex(0);
  };

  const activeCard = extractedCards[currentIndex];

  return (
    <div className="acm-layout">
      {/* Sidebar */}
      <aside className="acm-sidebar">
        <div className="acm-brand">
          <span className="acm-brand-badge">id</span> Maker
        </div>
        <a href="#dashboard" className="acm-nav-item">🏠 Dashboard</a>
        <div className="acm-nav-label">Services</div>
        <a href="#passport" className="acm-nav-item">📷 Passport Photo</a>
        <a href="#editor" className="acm-nav-item">✏️ Editor</a>
        <a href="#ayushman" className="acm-nav-item active">🪪 Ayushman / Sehat Cards</a>
        <a href="#pvc" className="acm-nav-item">🪪 PVC ID Cards</a>
        <a href="#pagemaker" className="acm-nav-item">📄 Page Maker</a>
        <div className="acm-nav-label">Shop</div>
        <a href="#contact" className="acm-nav-item">📞 Contact</a>
      </aside>

      {/* Main Workspace */}
      <main className="acm-main">
        <div className="acm-top-bar">
          <h1 className="acm-page-title">Make Ayushman / Mukhya Mantri Sehat Cards</h1>
          <div className="acm-shop-greeting">Mahadev Net Cafe • Patiala</div>
        </div>

        {/* Step 1: Upload & Calibration */}
        <section className="acm-card-box">
          <h2>Upload Health Card PDF(s)</h2>
          <p className="acm-sub-text">
            Select up to 5 PDF files to split Front & Back cards at 300 DPI automatically.
          </p>

          <div className="acm-upload-grid">
            {files.map((file, idx) => (
              <div className="acm-file-field" key={idx}>
                <label>
                  Select File {idx + 1} {idx === 0 ? '*' : ''}
                </label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => handleFileChange(idx, e.target.files?.[0])}
                />
              </div>
            ))}
          </div>

          <div className="acm-calibration-bar">
            <strong>Crop Calibration (% of PDF Page):</strong>
            <label>
              Top Y:
              <input
                type="number"
                value={cropConfig.cropY}
                min="0"
                max="90"
                onChange={(e) => handleConfigChange('cropY', e.target.value)}
              />
              %
            </label>
            <label>
              Height:
              <input
                type="number"
                value={cropConfig.cropH}
                min="5"
                max="90"
                onChange={(e) => handleConfigChange('cropH', e.target.value)}
              />
              %
            </label>
            <label>
              Front X:
              <input
                type="number"
                value={cropConfig.frontX}
                min="0"
                max="90"
                onChange={(e) => handleConfigChange('frontX', e.target.value)}
              />
              %
            </label>
            <label>
              Back X:
              <input
                type="number"
                value={cropConfig.backX}
                min="0"
                max="90"
                onChange={(e) => handleConfigChange('backX', e.target.value)}
              />
              %
            </label>
            <label>
              Width:
              <input
                type="number"
                value={cropConfig.cropW}
                min="10"
                max="90"
                onChange={(e) => handleConfigChange('cropW', e.target.value)}
              />
              %
            </label>
          </div>

          <div className="acm-btn-group">
            <button className="acm-btn" onClick={processPDFs} disabled={isProcessing}>
              {isProcessing ? '⏳ Processing...' : '⚡ Generate Cards'}
            </button>
            {extractedCards.length > 0 && (
              <button className="acm-btn acm-btn-secondary" onClick={resetAll}>
                🔄 Clear All
              </button>
            )}
          </div>
        </section>

        {/* Step 2: Front & Back Preview */}
        {extractedCards.length > 0 && activeCard && (
          <section className="acm-card-box">
            <div className="acm-slider-controls">
              <div>
                <h2>Front and Back Preview</h2>
                <p className="acm-sub-text" style={{ marginBottom: 0 }}>
                  Showing Card {currentIndex + 1} of {extractedCards.length} ({activeCard.name})
                </p>
              </div>
              <div className="acm-btn-group">
                <button
                  className="acm-btn acm-btn-secondary"
                  disabled={currentIndex === 0}
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                >
                  ◀ Previous
                </button>
                <button
                  className="acm-btn acm-btn-secondary"
                  disabled={currentIndex === extractedCards.length - 1}
                  onClick={() => setCurrentIndex((i) => Math.min(extractedCards.length - 1, i + 1))}
                >
                  Next ▶
                </button>
              </div>
            </div>

            <div className="acm-preview-pair">
              <div className="acm-card-side">
                <span>FRONT SIDE (85.6mm × 54mm)</span>
                <canvas ref={frontCanvasRef} width={1011} height={638} />
              </div>
              <div className="acm-card-side">
                <span>BACK SIDE (85.6mm × 54mm)</span>
                <canvas ref={backCanvasRef} width={1011} height={638} />
              </div>
            </div>

            <div className="acm-action-bar">
              <button className="acm-btn acm-btn-secondary" onClick={() => downloadSingle('front')}>
                ⬇ Download Front PNG
              </button>
              <button className="acm-btn acm-btn-secondary" onClick={() => downloadSingle('back')}>
                ⬇ Download Back PNG
              </button>
            </div>
          </section>
        )}

        {/* Step 3: A4 Print Sheet */}
        {extractedCards.length > 0 && (
          <section className="acm-card-box">
            <h2>A4 Size Print Sheet (CR80 PVC Size: 85.6mm × 54mm)</h2>
            <p className="acm-sub-text">
              Up to 5 cards fit cleanly on a single A4 page for printing or saving as PDF.
            </p>

            <div className="acm-a4-wrapper">
              <div className="acm-a4-sheet">
                {extractedCards.map((card) => (
                  <div className="acm-a4-row" key={card.id}>
                    <img src={card.frontDataUrl} alt={`${card.name} Front`} />
                    <img src={card.backDataUrl} alt={`${card.name} Back`} />
                  </div>
                ))}
              </div>
            </div>

            <div className="acm-action-bar">
              <button className="acm-btn acm-btn-success" onClick={() => window.print()}>
                🖨️ Print / Save as A4 PDF
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

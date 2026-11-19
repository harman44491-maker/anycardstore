import React, { useState, useEffect } from 'react';
import { SHOP_CONFIG } from '../config/shopConfig';

export default function PassportPhotoMaker() {
  const [imageSrc, setImageSrc] = useState(null);
  const [photoCount, setPhotoCount] = useState(8);
  const [brightness, setBrightness] = useState(102);
  const [contrast, setContrast] = useState(104);
  const [croppedUrl, setCroppedUrl] = useState(null);

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
            Copies on Sheet:{' '}
            <select value={photoCount} onChange={(e) => setPhotoCount(+e.target.value)}>
              <option value={6}>6 Photos</option>
              <option value={8}>8 Photos</option>
              <option value={12}>12 Photos</option>
              <option value={24}>24 Photos</option>
            </select>
          </label>
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
        <div className="mnc-card mnc-mt-20">
          <div className="mnc-row-between">
            <h3>Print Sheet Preview</h3>
            <button type="button" className="mnc-btn mnc-btn-success" onClick={() => window.print()}>
              🖨️ Print Sheet
            </button>
          </div>
          <div className="mnc-passport-grid printable-sheet">
            {Array.from({ length: photoCount }).map((_, i) => (
              <img key={i} src={croppedUrl} alt={`Passport ${i + 1}`} className="passport-photo-item" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

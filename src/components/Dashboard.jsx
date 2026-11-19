import React from 'react';
import { SHOP_CONFIG } from '../config/shopConfig';

const TOOLS = [
  {
    id: 'ayushman',
    title: 'Ayushman & Sehat Card Maker',
    desc: 'Split up to 5 health card PDFs into Front & Back at 300 DPI and print on A4.',
    badge: 'A4 · 90×57 mm',
  },
  {
    id: 'pvc',
    title: 'Aadhaar / Voter / PAN PVC Card',
    desc: 'Unlock e-Aadhaar PDFs with password, crop Front & Back to CR80 size for A4 or PVC tray.',
    badge: '85.6×54 mm',
  },
  {
    id: 'passport',
    title: 'Passport Photo Sheet Maker',
    desc: 'Crop photos to 3.5 cm × 4.5 cm (300 DPI) with brightness/contrast and arrange on sheets.',
    badge: '3.5×4.5 cm',
  },
];

export default function Dashboard({ onOpenTool }) {
  return (
    <section>
      <div className="mnc-privacy-banner">
        <span>
          ⚡ <strong>Offline / Fast (300 DPI):</strong> Poori processing aapke browser mein hi hoti hai — customer ka koi bhi PDF ya photo data kisi server par upload nahi hota.
        </span>
      </div>

      <div className="mnc-grid-3">
        {TOOLS.map((tool) => (
          <div className="mnc-card" key={tool.id}>
            <div className="mnc-card-top">
              <h3>{tool.title}</h3>
              <span className="mnc-tag">{tool.badge}</span>
            </div>
            <p className="mnc-muted">{tool.desc}</p>
            <button
              type="button"
              className="mnc-btn mnc-btn-primary mnc-mt-20"
              onClick={() => onOpenTool(tool.id)}
            >
              Open Tool →
            </button>
          </div>
        ))}
      </div>

      <div className="mnc-card mnc-mt-20">
        <h3>Shop & Print Standards</h3>
        <ul className="mnc-list">
          <li><strong>Shop:</strong> {SHOP_CONFIG.shopName} ({SHOP_CONFIG.cscName})</li>
          <li><strong>Passport Standard:</strong> {SHOP_CONFIG.passportSpec.widthCm} cm × {SHOP_CONFIG.passportSpec.heightCm} cm at {SHOP_CONFIG.passportSpec.dpi} DPI</li>
          <li><strong>PVC Card Standard:</strong> {SHOP_CONFIG.cr80CardSpec.widthMm} mm × {SHOP_CONFIG.cr80CardSpec.heightMm} mm (CR80)</li>
          <li><strong>Privacy:</strong> 100% client-side execution — zero server uploads.</li>
        </ul>
      </div>
    </section>
  );
}

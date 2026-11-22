import React from 'react';
import { SHOP_CONFIG } from '../config/shopConfig';

const TITLES = {
  dashboard: 'Counter Dashboard',
  ayushman: 'Ayushman & Mukhya Mantri Sehat Card Maker',
  passport: 'Passport Photo Sheet Maker (3.5 × 4.5 cm)',
  pvc: 'Aadhaar, Voter & PAN PVC ID Card Maker',
  cropprint: 'Card PDF Crop & Print',
};

export default function TopBar({ activeTool }) {
  return (
    <header className="mnc-topbar">
      <div>
        <h1>{TITLES[activeTool] || 'Mahadev Net Cafe'}</h1>
        <p className="mnc-muted">{SHOP_CONFIG.address}</p>
      </div>
      <div className="mnc-contact-pill">
        <span>📞 {SHOP_CONFIG.phone}</span>
      </div>
    </header>
  );
}

import React from 'react';

const TITLES = {
  dashboard: 'Professional Service Dashboard',
  contact: 'Contact & Customer Support',
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
        <p className="mnc-muted">Mahadev Net Cafe · Digital Document & Print Studio</p>
      </div>

    </header>
  );
}

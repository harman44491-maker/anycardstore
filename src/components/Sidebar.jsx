import React from 'react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'ayushman', label: 'Ayushman / Sehat Card', icon: '🩺' },
  { id: 'pvc', label: 'Aadhaar / PVC ID Card', icon: '🪪' },
  { id: 'cropprint', label: 'Card PDF Crop & Print', icon: '✂️' },
  { id: 'passport', label: 'Passport Photo Sheet', icon: '📷' },
  { id: 'contact', label: 'Contact Us', icon: '💬' },
];

export default function Sidebar({ activeTool, onSelectTool }) {
  return (
    <aside className="mnc-sidebar">
      <div className="mnc-brand">
        <span className="mnc-badge">MNC</span>
        <div>
          <div className="mnc-brand-title">Mahadev Net Cafe</div>
          <div className="mnc-brand-sub">Print & Card Studio</div>
        </div>
      </div>

      <div className="mnc-nav-group">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mnc-nav-btn ${activeTool === item.id ? 'active' : ''}`}
            onClick={() => onSelectTool(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

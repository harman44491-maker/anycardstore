import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './components/Dashboard';
import AyushmanCardMaker from './components/AyushmanCardMaker';
import PassportPhotoMaker from './components/PassportPhotoMaker';
import PvcIdCardMaker from './components/PvcIdCardMaker';
import CardPdfCropTool from './components/CardPdfCropTool';
import ContactUs from './components/ContactUs';
import './styles/global.css';
import './styles/print.css';

export default function App() {
  const [activeTool, setActiveTool] = useState('dashboard');

  const renderActiveTool = () => {
    switch (activeTool) {
      case 'ayushman':
        return <AyushmanCardMaker />;
      case 'passport':
        return <PassportPhotoMaker />;
      case 'pvc':
        return <PvcIdCardMaker />;
      case 'cropprint':
        return <CardPdfCropTool />;
      case 'contact':
        return <ContactUs />;
      case 'dashboard':
      default:
        return <Dashboard onOpenTool={setActiveTool} />;
    }
  };

  return (
    <div className="mnc-app">
      <Sidebar activeTool={activeTool} onSelectTool={setActiveTool} />
      <div className="mnc-main-shell">
        <TopBar activeTool={activeTool} />
        <main className="mnc-content">{renderActiveTool()}</main>
      </div>
    </div>
  );
}

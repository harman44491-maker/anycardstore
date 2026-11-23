import React from 'react';

const WHATSAPP_URL = 'https://wa.me/918146244491?text=' + encodeURIComponent(
  'Hello Mahadev Net Cafe, I need help with your online photo and card services.'
);

const SUPPORT_OPTIONS = [
  {
    icon: '📷',
    title: 'Passport Photo & Photo Sheet',
    description: 'Get help with passport-size photo setup, photo sheets and print settings.',
  },
  {
    icon: '🪪',
    title: 'Aadhaar, PAN & PVC Cards',
    description: 'Need assistance with card sizing, front/back alignment or PDF preparation?',
  },
  {
    icon: '📄',
    title: 'PDF Crop & Print',
    description: 'Questions about PDF cropping, page selection or print-ready files?',
  },
];

export default function ContactUs() {
  return (
    <section className="mnc-contact-page">
      <div className="mnc-contact-hero">
        <span className="mnc-contact-kicker">WE'RE HERE TO HELP</span>
        <h2>How can we help you today?</h2>
        <p>Connect with Mahadev Net Cafe for assistance with passport photos, PVC cards, PDF tools and printing services.</p>
        <a className="mnc-btn mnc-btn-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noreferrer">
          <span aria-hidden="true">💬</span> Chat with us on WhatsApp <span aria-hidden="true">↗</span>
        </a>
      </div>

      <div className="mnc-contact-section">
        <h3>What do you need help with?</h3>
        <div className="mnc-contact-grid">
          {SUPPORT_OPTIONS.map((item) => (
            <article className="mnc-card mnc-contact-option" key={item.title}>
              <span className="mnc-contact-icon">{item.icon}</span>
              <h4>{item.title}</h4>
              <p className="mnc-muted">{item.description}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="mnc-contact-note">
        <strong>Quick support, right on WhatsApp.</strong>
        <p>Tap the WhatsApp button above and send your question. Our team will guide you.</p>
      </div>
    </section>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase, supabaseReady } from './supabase';
import { Home, CreditCard, Camera, FileText, History, Wallet, Settings, LogOut, Menu, Search, UploadCloud, Download, Printer, ArrowLeftRight, Image, ShieldCheck, Plus, X, Sun, Moon, FileImage, LayoutDashboard, User, LockKeyhole } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './style.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const cards = [
  ['Aadhaar', 'aadhaar'], ['APAAR', 'apaar'], ['ABC Card', 'abc'], ['Advance Ayushman', 'advance-ayushman'],
  ['Auto Cropper Card', 'auto-cropper'], ['Ayushman', 'ayushman'], ['BOCW', 'bocw'], ['Driving Licence', 'driving-licence'],
  ['E-Shram', 'e-shram'], ['E-UDID', 'e-udid'], ['Farmer ID', 'farmer-id'], ['ABHA', 'abha'],
  ['Voter ID', 'voter-id'], ['PAN Card', 'pan-card'], ['Labour Card', 'labour-card']
].map(([name, slug]) => ({ name, slug }));

function App() {
  const [page, setPage] = useState('Dashboard');
  const [user, setUser] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [dark, setDark] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState('Ayushman');
  const [history, setHistory] = useState([]);
  const [wallet, setWallet] = useState('0.00');

  useEffect(() => {
    if (!supabaseReady) { setSessionChecked(true); return; }
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setSessionChecked(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && supabaseReady) {
      supabase.from('profiles').select('full_name,wallet_balance').eq('id', user.id).maybeSingle().then(({ data }) => {
        if (data?.wallet_balance != null) setWallet(Number(data.wallet_balance).toFixed(2));
      });
      supabase.from('work_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10).then(({ data }) => setHistory(data || []));
    }
  }, [user]);

  async function authSubmit(e) {
    e.preventDefault();
    setAuthError('');
    if (!supabaseReady) { setAuthError('Supabase setup pending. Add your project URL and anon key in the .env file first.'); return; }
    let result;
    if (authMode === 'signup') result = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    else result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setAuthError(result.error.message);
    else if (authMode === 'signup') setAuthError('Account created. If email confirmation is enabled, confirm your email and then log in.');
    else setUser(result.data.user);
  }

  async function logout() { if (supabaseReady) await supabase.auth.signOut(); setUser(null); }

  const addHistory = async (type, label) => {
    const row = { type, label, created_at: new Date().toISOString() };
    setHistory(h => [row, ...h]);
    if (user && supabaseReady) await supabase.from('work_history').insert({ user_id: user.id, type, label });
  };

  if (!sessionChecked) return <div className="loading">Loading Mahadev Digital Portal…</div>;
  if (!user) return <Auth mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} fullName={fullName} setFullName={setFullName} onSubmit={authSubmit} error={authError} />;

  return (
    <div className={dark ? 'app dark' : 'app'}>
      <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-mark">M</div>
          <div><b>MAHADEV</b><small>NET CAFE</small></div>
          <button className="mobile-close" onClick={() => setMobileNav(false)}><X /></button>
        </div>
        <nav>
          <div className="nav-label">MAIN MENU</div>
          <Nav icon={<LayoutDashboard />} label="Dashboard" page={page} setPage={setPage} />
          <div className="nav-label">SERVICES</div>
          <Nav icon={<Camera />} label="Passport Photo" page={page} setPage={setPage} />
          <Nav icon={<CreditCard />} label="Cards" page={page} setPage={setPage} />
          <Nav icon={<FileText />} label="Document Converter" page={page} setPage={setPage} />
          <div className="nav-label">ACCOUNT</div>
          <Nav icon={<History />} label="Work History" page={page} setPage={setPage} />
          <Nav icon={<Wallet />} label="Wallet" page={page} setPage={setPage} />
        </nav>
        <div className="side-bottom">
          <button onClick={logout}><LogOut size={17} /> Log out</button>
          <span>v1.0.0</span>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setMobileNav(!mobileNav)}><Menu /></button>
          <div className="welcome">Hey, <b>Mahadev Net Cafe</b></div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun /> : <Moon />}</button>
            <div className="avatar">{(user.email || 'M')[0].toUpperCase()}</div>
          </div>
        </header>
        <div className="content">
          {page === 'Dashboard' ? <Dashboard wallet={wallet} history={history} setPage={setPage} /> :
            page === 'Cards' ? <Cards query={query} setQuery={setQuery} onSelect={(c) => { setSelectedCard(c.name); setPage('Card Studio'); }} /> :
              page === 'Card Studio' ? <CardStudio card={selectedCard} addHistory={addHistory} /> :
                page === 'Passport Photo' ? <PassportStudio addHistory={addHistory} /> :
                  page === 'Document Converter' ? <Converter addHistory={addHistory} /> :
                    page === 'Work History' ? <HistoryPage history={history} /> : <WalletPage wallet={wallet} />}
        </div>
      </main>
    </div>
  );
}

function Auth({ mode, setMode, email, setEmail, password, setPassword, fullName, setFullName, onSubmit, error }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><div className="brand-mark">M</div><div><b>MAHADEV NET CAFE</b><small>Digital Services Portal</small></div></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">Sign in to access card printing and document tools.</p>
        <form onSubmit={onSubmit}>
          {mode === 'signup' && <label>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your name" /></label>}
          <label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
          <label>Password<input type="password" required minLength="6" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
          {error && <div className="alert">{error}</div>}
          <button className="primary full" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="switch-auth">{mode === 'login' ? "Don't have an account?" : "Already registered?"} <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
        <div className="secure"><ShieldCheck size={15} /> Secure account access powered by Supabase</div>
      </div>
    </div>
  );
}

function Nav({ icon, label, page, setPage }) {
  return <button className={page === label || (label === 'Cards' && page === 'Card Studio') ? 'nav-item active' : 'nav-item'} onClick={() => setPage(label)}>{icon}<span>{label}</span></button>;
}

function PageTitle({ icon, title, subtitle, action }) {
  return <div className="page-title"><div className="title-icon">{icon}</div><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="title-action">{action}</div>}</div>;
}

function Dashboard({ wallet, history, setPage }) {
  return (
    <>
      <PageTitle icon={<Home />} title="Dashboard" subtitle="Your card printing and document workspace." action={<button className="primary" onClick={() => setPage('Cards')}><Plus size={16} /> New Card</button>} />
      <div className="welcome-banner">
        <div><span className="eyebrow">MAHADEV DIGITAL PORTAL</span><h2>All your printing tools in one place.</h2><p>Create card layouts, prepare passport photos and convert documents.</p></div>
        <div className="banner-art"><CreditCard size={72} /></div>
      </div>
      <div className="stats">
        <Stat icon={<Wallet />} label="Wallet Balance" value={`₹${wallet}`} tone="gold" />
        <Stat icon={<CreditCard />} label="Cards Created" value={history.filter(x => x.type === 'Card').length} tone="green" />
        <Stat icon={<ArrowLeftRight />} label="Transactions" value="0" tone="purple" />
        <Stat icon={<FileText />} label="Files Processed" value={history.filter(x => x.type !== 'Card').length} tone="blue" />
      </div>
      <div className="section-head"><h2>Quick Services</h2></div>
      <div className="service-grid">
        <Service icon={<CreditCard />} title="Card Printing" desc="Choose a card template and prepare print-ready files." onClick={() => setPage('Cards')} />
        <Service icon={<Camera />} title="Passport Photo" desc="Single or multiple photos with print sheet preview." onClick={() => setPage('Passport Photo')} />
        <Service icon={<FileText />} title="Document Converter" desc="Convert images to PDF or PDF pages to images." onClick={() => setPage('Document Converter')} />
      </div>
      <div className="panel history-panel"><div className="panel-head"><h2>Recent Work</h2><button className="text-btn" onClick={() => setPage('Work History')}>View all</button></div><HistoryTable history={history.slice(0, 5)} /></div>
    </>
  );
}

function Stat({ icon, label, value, tone }) {
  return <div className={`stat ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><div className="stat-icon">{icon}</div></div>;
}

function Service({ icon, title, desc, onClick }) {
  return <button className="service-card" onClick={onClick}><div className="service-icon">{icon}</div><h3>{title}</h3><p>{desc}</p><span className="service-link">Open service →</span></button>;
}

function Cards({ query, setQuery, onSelect }) {
  const filtered = cards.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <>
      <PageTitle icon={<CreditCard />} title="Punjab Card Services" subtitle="Search and select a card template to start." />
      <div className="search-box"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search card by name…" /></div>
      <div className="card-grid">{filtered.map(c => <button className="template-card" key={c.slug} onClick={() => onSelect(c)}><div className="template-logo"><CreditCard /></div><h3>{c.name}</h3><p>Card printing template</p><span className="template-open">Open editor →</span></button>)}</div>
      {!filtered.length && <div className="empty">No matching card templates found.</div>}
    </>
  );
}

function isPdfFile(file) { return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''); }

// Text sharpness & bold enhancer filter
function enhanceCardText(sourceCanvas) {
  const enhanced = document.createElement('canvas');
  enhanced.width = sourceCanvas.width;
  enhanced.height = sourceCanvas.height;
  const ctx = enhanced.getContext('2d');
  ctx.filter = 'contrast(135%) brightness(97%)';
  ctx.drawImage(sourceCanvas, 0, 0);
  return enhanced;
}

// PRECISE CROPPER FOR AADHAAR LETTER (Skips instructions, targets bottom card area)
async function renderPdfSides(doc, scale, splitSinglePage) {
  const renderPage = async (pageNo) => {
    const page = await doc.getPage(pageNo), viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    return enhanceCardText(canvas);
  };

  const toSide = (canvas) => ({ data: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });

  if (doc.numPages >= 2) {
    const p1 = await renderPage(1);
    const p2 = await renderPage(2);
    // Niche wale card area ko accurately crop karne ke liye sy = 60% set kiya gaya hai
    const cropBottom = (src) => {
      const sy = Math.floor(src.height * 0.60);
      const sh = src.height - sy;
      const c = document.createElement('canvas');
      c.width = src.width; c.height = sh;
      c.getContext('2d').drawImage(src, 0, sy, src.width, sh, 0, 0, src.width, sh);
      return c;
    };
    return [toSide(cropBottom(p1)), toSide(cropBottom(p2))];
  }

  const pageCanvas = await renderPage(1);
  const sy = Math.floor(pageCanvas.height * 0.60);
  const sh = pageCanvas.height - sy;
  const halfW = Math.floor(pageCanvas.width / 2);

  const cropPart = (sx, sw) => {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  };

  return [toSide(cropPart(0, halfW)), toSide(cropPart(halfW, pageCanvas.width - halfW))];
}

function processAadhaarImage(dataUrl) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(135%) brightness(97%)';
      ctx.drawImage(img, 0, 0);

      // Niche wale card area ko isolate karne ke liye sy = 60%
      const sy = Math.floor(img.height * 0.60);
      const sh = img.height - sy;
      const halfW = Math.floor(img.width / 2);

      const makeSide = (sx, sw) => {
        const sc = document.createElement('canvas');
        sc.width = sw; sc.height = sh;
        sc.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
        return { data: sc.toDataURL('image/png'), width: sc.width, height: sc.height };
      };

      resolve([makeSide(0, halfW), makeSide(halfW, img.width - halfW)]);
    };
    img.src = dataUrl;
  });
}

const CARD_STUDIO_LAYOUTS = {
  aadhaar: { width: 101, height: 60, gap: 2, rowGap: 1.5, margin: 3, borderSideInset: 2, borderBottomInset: 2, previewScale: 14, printScale: 20, splitSinglePage: true },
  ayushman: { width: 87, height: 52, gap: 3, rowGap: 1.5, margin: 5, borderSideInset: 0, borderBottomInset: 0, previewScale: 2.2, printScale: 3.2, splitSinglePage: false },
  default: { width: 87, height: 5

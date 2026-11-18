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

// UPDATED: Text ko bold/sharp banane ke liye contrast filter add kiya gaya hai
function enhanceCardText(sourceCanvas) {
  const enhanced = document.createElement('canvas');
  enhanced.width = sourceCanvas.width;
  enhanced.height = sourceCanvas.height;
  const ctx = enhanced.getContext('2d');
  ctx.filter = 'contrast(135%) brightness(97%)';
  ctx.drawImage(sourceCanvas, 0, 0);
  return enhanced;
}

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
  if (doc.numPages >= 2) return [toSide(await renderPage(1)), toSide(await renderPage(2))];
  const pageCanvas = await renderPage(1);
  const pageRatio = pageCanvas.width / pageCanvas.height;
  if (!splitSinglePage && pageRatio < 2) return [toSide(pageCanvas), null];
  let source = pageCanvas, sourceY = 0, sourceHeight = pageCanvas.height;
  if (splitSinglePage && pageRatio < 2) {
    sourceY = Math.floor(pageCanvas.height * .72);
    sourceHeight = pageCanvas.height - sourceY;
  }
  const leftWidth = Math.floor(pageCanvas.width / 2), rightWidth = pageCanvas.width - leftWidth;
  const crop = (sx, width) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = sourceHeight;
    canvas.getContext('2d').drawImage(source, sx, sourceY, width, sourceHeight, 0, 0, width, sourceHeight);
    return canvas;
  };
  const trimCard = canvas => {
    const context = canvas.getContext('2d'), pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    const skipTop = Math.floor(canvas.height * .06);
    for (let y = skipTop; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      if (pixels[i + 3] > 24 && (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245)) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < left || bottom < top) return canvas;
    // UPDATED: Padding kam ki gayi taaki niche ka space/height kam rahe
    const pad = 1;
    const x = Math.max(0, left - pad), y = Math.max(0, top - pad);
    const width = Math.min(canvas.width - x, right - left + 1 + pad * 2), height = Math.min(canvas.height - y, bottom - top + 1 + pad * 2);
    const trimmed = document.createElement('canvas');
    trimmed.width = width;
    trimmed.height = height;
    trimmed.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return trimmed;
  };
  return [toSide(trimCard(crop(0, leftWidth))), toSide(trimCard(crop(leftWidth, rightWidth)))];
}

// UPDATED: Aadhaar card ki height 65.1 se kam karke 60mm aur rowGap 1.5mm kiya gaya hai
const CARD_STUDIO_LAYOUTS = {
  aadhaar: { width: 101, height: 60, gap: 2, rowGap: 1.5, margin: 3, borderSideInset: 2, borderBottomInset: 2, previewScale: 14, printScale: 20, splitSinglePage: true },
  ayushman: { width: 87, height: 52, gap: 3, rowGap: 1.5, margin: 5, borderSideInset: 0, borderBottomInset: 0, previewScale: 2.2, printScale: 3.2, splitSinglePage: false },
  default: { width: 87, height: 52, gap: 3, rowGap: 1.5, margin: 5, borderSideInset: 0, borderBottomInset: 0, previewScale: 2.2, printScale: 3.2, splitSinglePage: false }
};

function CardStudio({ card, addHistory }) {
  const [files, setFiles] = useState([]);
  const [settingsByCard, setSettingsByCard] = useState({ Aadhaar: { paper: 'A4', orientation: 'portrait', margin: 6 }, Ayushman: { paper: 'A4', orientation: 'portrait', margin: 5 } });
  const [busy, setBusy] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [previewSheets, setPreviewSheets] = useState([]);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const layout = CARD_STUDIO_LAYOUTS[card.toLowerCase()] || CARD_STUDIO_LAYOUTS.default;
  const savedSettings = settingsByCard[card] || {};
  const paper = savedSettings.paper || 'A4', orientation = savedSettings.orientation || 'portrait', margin = savedSettings.margin ?? layout.margin;
  const updateSetting = (key, value) => setSettingsByCard(prev => ({ ...prev, [card]: { ...(prev[card] || {}), [key]: value } }));
  const { width: cardWidth, height: cardHeight, gap: cardGap, rowGap, borderSideInset, borderBottomInset, previewScale, printScale, splitSinglePage } = layout;
  const layoutCssVars = {
    '--card-width': `${cardWidth}mm`,
    '--card-height': `${cardHeight}mm`,
    '--card-gap': `${cardGap}mm`,
    '--pair-width': `${cardWidth * 2 + cardGap}mm`,
    '--card-aspect': `${cardWidth} / ${cardHeight}`,
    '--border-side-inset': `${borderSideInset}mm`,
    '--border-bottom-inset': `${borderBottomInset}mm`
  };
  const pageDimensions = { A4: { width: 210, height: 297 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 } }[paper] || { width: 210, height: 297 };
  const sheetHeight = orientation === 'portrait' ? pageDimensions.height : pageDimensions.width;
  const perSheet = Math.max(1, Math.floor((sheetHeight - 2 * margin + rowGap) / (cardHeight + rowGap)));

  useEffect(() => {
    let cancelled = false;
    async function renderAll() {
      setPreviewSheets([]); setPreviewPage(0); setPreviewError('');
      if (!files.length) return;
      setPreviewLoading(true);
      try {
        const pairs = [];
        for (const file of files) {
          let sides = [];
          if (isPdfFile(file)) {
            const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: pdfPassword || undefined }).promise;
            const renderedSides = await renderPdfSides(doc, previewScale, splitSinglePage);
            sides = renderedSides.map(side => side?.data || '');
            if (!sides[1]) setPreviewError(prev => prev || file.name + ' has one page; the Back side is blank.');
          } else {
            const rawImg = await readData(file);
            sides = [await enhanceImageUrl(rawImg), ''];
          }
          pairs.push({ name: file.name, sides });
        }
        const sheets = [];
        for (let i = 0; i < pairs.length; i += perSheet) sheets.push(pairs.slice(i, i + perSheet));
        if (!cancelled) setPreviewSheets(sheets);
      } catch (err) {
        if (!cancelled) setPreviewError('Preview could not be loaded: ' + err.message);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    renderAll();
    return () => { cancelled = true; };
  }, [files, pdfPassword, perSheet, card, previewScale, splitSinglePage]);

  const changeFiles = next => { setFiles(next); setPreviewPage(0); };

  const addSide = (pdf, side, x, y, w, h) => {
    if (!side) return;
    const ratio = Math.min(w / side.width, h / side.height), drawW = side.width * ratio, drawH = side.height * ratio;
    pdf.addImage(side.data, side.data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH, undefined, 'FAST');
  };

  const generate = async (action = 'download') => {
    if (!files.length) return alert('Please select at least one image or PDF file.');
    setBusy(true);
    try {
      const pdf = new jsPDF({ orientation, unit: 'mm', format: paper.toLowerCase() });
      const pw = pdf.internal.pageSize.getWidth();
      const printMargin = margin, gap = cardGap, sideW = cardWidth, sideH = cardHeight;
      for (let i = 0; i < files.length; i++) {
        if (i > 0 && i % perSheet === 0) pdf.addPage();
        const file = files[i]; let front = null, back = null;
        if (isPdfFile(file)) {
          const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password: pdfPassword || undefined }).promise;
          [front, back] = await renderPdfSides(doc, printScale, splitSinglePage);
        } else {
          const data = await enhanceImageUrl(await readData(file)), props = pdf.getImageProperties(data);
          front = { data, width: props.width, height: props.height };
        }
        const row = i % perSheet, y = printMargin + row * (sideH + rowGap), pairW = sideW * 2 + gap, x = (pw - pairW) / 2;
        addSide(pdf, front, x, y, sideW, sideH);
        addSide(pdf, back, x + sideW + gap, y, sideW, sideH);
        pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(.25);
        pdf.rect(x + borderSideInset, y, sideW - borderSideInset * 2, sideH - borderBottomInset);
        pdf.rect(x + sideW + gap + borderSideInset, y, sideW - borderSideInset * 2, sideH - borderBottomInset);
      }
      if (action === 'print') {
        const blob = pdf.output('blob');
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) alert('Please allow pop-ups to print the PDF.');
        else win.addEventListener('load', () => win.print(), { once: true });
      } else {
        pdf.save(`${card.toLowerCase().replaceAll(' ', '-')}-print.pdf`);
      }
      await addHistory('Card', `${card} (${files.length} set(s))`);
    } catch (e) {
      alert('Could not create PDF: ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const currentSheet = previewSheets[previewPage] || [];
  const allPairs = previewSheets.flat();

  return (
    <>
      <PageTitle icon={<CreditCard />} title={`${card} Card Studio`} subtitle="Upload files, preview every Front + Back pair, then review the A4 print sheet below." />
      <div className="editor-layout card-top-layout">
        <div className="panel pad">
          <h2>Upload card files</h2>
          <p className="muted">Each PDF should contain two pages: Page 1 = Front and Page 2 = Back. Up to {perSheet} uploaded files are arranged on each sheet.</p>
          <FileDrop accept="image/*,application/pdf" multiple onFiles={changeFiles} />
          {files.some(isPdfFile) && (
            <label className="pdf-password-field">
              PDF Password
              <input type="password" value={pdfPassword} onChange={e => setPdfPassword(e.target.value)} placeholder="Enter password for protected PDF" autoComplete="off" />
              <small>Password is used locally in this browser to open the PDF.</small>
            </label>
          )}
          {files.map((f, i) => (
            <div className="file-row" key={i}>
              <FileImage />
              <div><b>{f.name}</b><small>{(f.size / 1024).toFixed(0)} KB · Set {i + 1}</small></div>
              <button className="icon-btn" onClick={() => changeFiles(files.filter((_, j) => j !== i))}><X size={16} /></button>
            </div>
          ))}
          <div className="form-grid">
            <label>Paper size<select value={paper} onChange={e => updateSetting('paper', e.target.value)}><option>A4</option><option>Letter</option><option>Legal</option></select></label>
            <label>Orientation<select value={orientation} onChange={e => updateSetting('orientation', e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
            <label>Margins (mm)<input type="number" min="0" max="30" value={margin} onChange={e => updateSetting('margin', Math.max(0, Math.min(30, +e.target.value || 0)))} /></label>
          </div>
          <button className="primary" disabled={busy || !files.length} onClick={() => generate('download')}><Download size={16} />{busy ? 'Preparing PDF…' : 'Download print-ready PDF'}</button>
        </div>
        <div className="panel pad">
          <h2>Front and Back</h2>
          <p className="muted">Preview of every uploaded file. Front is on the left and Back is on the right.</p>
          {previewLoading ? <div className="preview-empty"><span>Rendering all uploaded files…</span></div> :
            allPairs.length ? (
              <div className="all-card-pairs">
                {allPairs.map((item, i) => (
                  <div className="all-card-pair" key={item.name + '-' + i}>
                    <div className="all-card-pair-title">SET {i + 1} · {item.name}</div>
                    <div className="all-card-pair-sides" style={{ ...layoutCssVars, gridTemplateColumns: '1fr 1fr' }}>
                      <div className="pair-side"><b>FRONT</b>{item.sides[0] ? <img src={item.sides[0]} alt={`Set ${i + 1} Front`} /> : <span className="blank-side">No front image</span>}</div>
                      <div className="pair-side"><b>BACK</b>{item.sides[1] ? <img src={item.sides[1]} alt={`Set ${i + 1} Back`} /> : <span className="blank-side">Blank back</span>}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div className="preview-empty"><Image size={42} /><span>Upload files to preview every Front + Back pair</span></div>}
          {previewError && <div className="print-summary">{previewError}</div>}
        </div>
      </div>
      <div className="panel pad card-print-panel">
        <div className="print-preview-heading">
          <div><h2>A4 Print Preview</h2><p className="muted">This is how the downloaded PDF will be arranged. Up to {perSheet} Front + Back sets per page.</p></div>
          <div className="print-preview-actions">
            <button className="primary" disabled={busy || !files.length} onClick={() => generate('download')}><Download size={15} />{busy ? 'Preparing…' : 'Download PDF'}</button>
            <button className="secondary" disabled={busy || !files.length} onClick={() => generate('print')}><Printer size={15} />Print</button>
          </div>
        </div>
        {files.length ? (
          <>
            <div className="preview-toolbar">
              <span>A4 sheet {previewPage + 1} of {Math.max(1, previewSheets.length)} · Sets {previewPage * perSheet + 1}–{Math.min((previewPage + 1) * perSheet, files.length)} of {files.length}</span>
              <div className="page-controls">
                <button className="icon-btn" disabled={previewPage === 0} onClick={() => setPreviewPage(p => Math.max(0, p - 1))}>‹</button>
                <small>Page {previewPage + 1} / {Math.max(1, previewSheets.length)}</small>
                <button className="icon-

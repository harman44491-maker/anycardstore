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
 ['Aadhaar','aadhaar'],['APAAR','apaar'],['ABC Card','abc'],['Advance Ayushman','advance-ayushman'],['Auto Cropper Card','auto-cropper'],['Ayushman','ayushman'],['BOCW','bocw'],['Driving Licence','driving-licence'],['E-Shram','e-shram'],['E-UDID','e-udid'],['Farmer ID','farmer-id'],['ABHA','abha'],['Voter ID','voter-id'],['PAN Card','pan-card'],['Labour Card','labour-card']
].map(([name,slug])=>({name,slug}));

function App(){
 const [page,setPage]=useState('Dashboard'); const [user,setUser]=useState(null); const [sessionChecked,setSessionChecked]=useState(false); const [authMode,setAuthMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [fullName,setFullName]=useState(''); const [authError,setAuthError]=useState(''); const [mobileNav,setMobileNav]=useState(false); const [dark,setDark]=useState(false); const [query,setQuery]=useState(''); const [selectedCard,setSelectedCard]=useState('Ayushman'); const [history,setHistory]=useState([]); const [wallet,setWallet]=useState('0.00');
 useEffect(()=>{ if(!supabaseReady){setSessionChecked(true);return;} supabase.auth.getSession().then(({data})=>{setUser(data.session?.user||null);setSessionChecked(true)}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user||null)); return ()=>subscription.unsubscribe(); },[]);
 useEffect(()=>{if(user&&supabaseReady){supabase.from('profiles').select('full_name,wallet_balance').eq('id',user.id).maybeSingle().then(({data})=>{if(data?.wallet_balance!=null)setWallet(Number(data.wallet_balance).toFixed(2))});supabase.from('work_history').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(10).then(({data})=>setHistory(data||[]));}},[user]);
 async function authSubmit(e){e.preventDefault();setAuthError('');if(!supabaseReady){setAuthError('Supabase setup pending. Add your project URL and anon key in the .env file first.');return;}let result;if(authMode==='signup')result=await supabase.auth.signUp({email,password,options:{data:{full_name:fullName}}});else result=await supabase.auth.signInWithPassword({email,password});if(result.error)setAuthError(result.error.message);else if(authMode==='signup')setAuthError('Account created. If email confirmation is enabled, confirm your email and then log in.');else setUser(result.data.user);}
 async function logout(){if(supabaseReady)await supabase.auth.signOut();setUser(null)}
 const addHistory=async(type,label)=>{const row={type,label,created_at:new Date().toISOString()};setHistory(h=>[row,...h]);if(user&&supabaseReady)await supabase.from('work_history').insert({user_id:user.id,type,label});};
 if(!sessionChecked)return <div className="loading">Loading Mahadev Digital Portal…</div>;
 if(!user)return <Auth mode={authMode} setMode={setAuthMode} email={email} setEmail={setEmail} password={password} setPassword={setPassword} fullName={fullName} setFullName={setFullName} onSubmit={authSubmit} error={authError}/>;
 return <div className={dark?'app dark':'app'}>
  <aside className={mobileNav?'sidebar open':'sidebar'}><div className="brand"><div className="brand-mark">M</div><div><b>MAHADEV</b><small>NET CAFE</small></div><button className="mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div><nav><div className="nav-label">MAIN MENU</div><Nav icon={<LayoutDashboard/>} label="Dashboard" page={page} setPage={setPage}/><div className="nav-label">SERVICES</div><Nav icon={<Camera/>} label="Passport Photo" page={page} setPage={setPage}/><Nav icon={<CreditCard/>} label="Cards" page={page} setPage={setPage}/><Nav icon={<FileText/>} label="Document Converter" page={page} setPage={setPage}/><div className="nav-label">ACCOUNT</div><Nav icon={<History/>} label="Work History" page={page} setPage={setPage}/><Nav icon={<Wallet/>} label="Wallet" page={page} setPage={setPage}/></nav><div className="side-bottom"><button onClick={logout}><LogOut size={17}/> Log out</button><span>v1.0.0</span></div></aside>
  <main className="main"><header className="topbar"><button className="menu-btn" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button><div className="welcome">Hey, <b>Mahadev Net Cafe</b></div><div className="top-actions"><button className="icon-btn" onClick={()=>setDark(!dark)} title="Toggle theme">{dark?<Sun/>:<Moon/>}</button><div className="avatar">{(user.email||'M')[0].toUpperCase()}</div></div></header>
   <div className="content">{page==='Dashboard'?<Dashboard wallet={wallet} history={history} setPage={setPage}/>:page==='Cards'?<Cards query={query} setQuery={setQuery} onSelect={(c)=>{setSelectedCard(c.name);setPage('Card Studio')}}/>:page==='Card Studio'?<CardStudio card={selectedCard} addHistory={addHistory}/>:page==='Passport Photo'?<PassportStudio addHistory={addHistory}/>:page==='Document Converter'?<Converter addHistory={addHistory}/>:page==='Work History'?<HistoryPage history={history}/>:<WalletPage wallet={wallet}/> }</div>
  </main>
 </div>
}
function Auth({mode,setMode,email,setEmail,password,setPassword,fullName,setFullName,onSubmit,error}){return <div className="auth-wrap"><div className="auth-card"><div className="auth-brand"><div className="brand-mark">M</div><div><b>MAHADEV NET CAFE</b><small>Digital Services Portal</small></div></div><h1>{mode==='login'?'Welcome back':'Create your account'}</h1><p className="muted">Sign in to access card printing and document tools.</p><form onSubmit={onSubmit}>{mode==='signup'&&<label>Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Your name"/></label>}<label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength="6" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{error&&<div className="alert">{error}</div>}<button className="primary full" type="submit">{mode==='login'?'Sign in':'Create account'}</button></form><p className="switch-auth">{mode==='login'?"Don't have an account?":"Already registered?"} <button onClick={()=>setMode(mode==='login'?'signup':'login')}>{mode==='login'?'Create account':'Sign in'}</button></p><div className="secure"><ShieldCheck size={15}/> Secure account access powered by Supabase</div></div></div>}
function Nav({icon,label,page,setPage}){return <button className={page===label|| (label==='Cards'&&page==='Card Studio')?'nav-item active':'nav-item'} onClick={()=>setPage(label)}>{icon}<span>{label}</span></button>}
function PageTitle({icon,title,subtitle,action}){return <div className="page-title"><div className="title-icon">{icon}</div><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div>{action&&<div className="title-action">{action}</div>}</div>}
function Dashboard({wallet,history,setPage}){return <><PageTitle icon={<Home/>} title="Dashboard" subtitle="Your card printing and document workspace." action={<button className="primary" onClick={()=>setPage('Cards')}><Plus size={16}/> New Card</button>}/><div className="welcome-banner"><div><span className="eyebrow">MAHADEV DIGITAL PORTAL</span><h2>All your printing tools in one place.</h2><p>Create card layouts, prepare passport photos and convert documents.</p></div><div className="banner-art"><CreditCard size={72}/></div></div><div className="stats"><Stat icon={<Wallet/>} label="Wallet Balance" value={`₹${wallet}`} tone="gold"/><Stat icon={<CreditCard/>} label="Cards Created" value={history.filter(x=>x.type==='Card').length} tone="green"/><Stat icon={<ArrowLeftRight/>} label="Transactions" value="0" tone="purple"/><Stat icon={<FileText/>} label="Files Processed" value={history.filter(x=>x.type!=='Card').length} tone="blue"/></div><div className="section-head"><h2>Quick Services</h2></div><div className="service-grid"><Service icon={<CreditCard/>} title="Card Printing" desc="Choose a card template and prepare print-ready files." onClick={()=>setPage('Cards')}/><Service icon={<Camera/>} title="Passport Photo" desc="Single or multiple photos with print sheet preview." onClick={()=>setPage('Passport Photo')}/><Service icon={<FileText/>} title="Document Converter" desc="Convert images to PDF or PDF pages to images." onClick={()=>setPage('Document Converter')}/></div><div className="panel history-panel"><div className="panel-head"><h2>Recent Work</h2><button className="text-btn" onClick={()=>setPage('Work History')}>View all</button></div><HistoryTable history={history.slice(0,5)}/></div></>}
function Stat({icon,label,value,tone}){return <div className={`stat ${tone}`}><div><span>{label}</span><strong>{value}</strong></div><div className="stat-icon">{icon}</div></div>}
function Service({icon,title,desc,onClick}){return <button className="service-card" onClick={onClick}><div className="service-icon">{icon}</div><h3>{title}</h3><p>{desc}</p><span className="service-link">Open service →</span></button>}
function Cards({query,setQuery,onSelect}){const filtered=cards.filter(c=>c.name.toLowerCase().includes(query.toLowerCase()));return <><PageTitle icon={<CreditCard/>} title="Punjab Card Services" subtitle="Search and select a card template to start."/><div className="search-box"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search card by name…"/></div><div className="card-grid">{filtered.map(c=><button className="template-card" key={c.slug} onClick={()=>onSelect(c)}><div className="template-logo"><CreditCard/></div><h3>{c.name}</h3><p>Card printing template</p><span className="template-open">Open editor →</span></button>)}</div>{!filtered.length&&<div className="empty">No matching card templates found.</div>}</>}
function isPdfFile(file){return file.type==='application/pdf'||/\.pdf$/i.test(file.name||'');}
async function renderPdfSides(doc,scale,quality){
 const renderPage=async(pageNo)=>{
  const page=await doc.getPage(pageNo),viewport=page.getViewport({scale});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  return canvas;
 };
 const toSide=(canvas)=>({data:canvas.toDataURL('image/jpeg',quality),width:canvas.width,height:canvas.height});
 if(doc.numPages>=2)return [toSide(await renderPage(1)),toSide(await renderPage(2))];
 const pageCanvas=await renderPage(1);
 if(pageCanvas.width/pageCanvas.height>=2){
  const leftWidth=Math.floor(pageCanvas.width/2),rightWidth=pageCanvas.width-leftWidth;
  const crop=(sx,width)=>{
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=pageCanvas.height;
   canvas.getContext('2d').drawImage(pageCanvas,sx,0,width,pageCanvas.height,0,0,width,pageCanvas.height);
   return toSide(canvas);
  };
  return [crop(0,leftWidth),crop(leftWidth,rightWidth)];
 }
 return [toSide(pageCanvas),null];
}
function CardStudio({card,addHistory}){
 const [files,setFiles]=useState([]),[paper,setPaper]=useState('A4'),[orientation,setOrientation]=useState('portrait'),[margin,setMargin]=useState(5),[busy,setBusy]=useState(false),[pdfPassword,setPdfPassword]=useState('');
 const [previewSheets,setPreviewSheets]=useState([]),[previewPage,setPreviewPage]=useState(0),[previewLoading,setPreviewLoading]=useState(false),[previewError,setPreviewError]=useState('');
 const perSheet=5;
 useEffect(()=>{
  let cancelled=false;
  async function renderAll(){
   setPreviewSheets([]);setPreviewPage(0);setPreviewError('');
   if(!files.length)return;
   setPreviewLoading(true);
   try{
    const pairs=[];
    for(const file of files){
     let sides=[];
     if(isPdfFile(file)){
      const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:pdfPassword||undefined}).promise;
      const renderedSides=await renderPdfSides(doc,1.2,.9);
      sides=renderedSides.map(side=>side?.data||'');
      if(!sides[1])setPreviewError(prev=>prev||file.name+' has one page; the Back side is blank.');
     }else sides=[await readData(file),''];
     pairs.push({name:file.name,sides});
    }
    const sheets=[];for(let i=0;i<pairs.length;i+=perSheet)sheets.push(pairs.slice(i,i+perSheet));
    if(!cancelled)setPreviewSheets(sheets);
   }catch(err){if(!cancelled)setPreviewError('Preview could not be loaded: '+err.message);}
   finally{if(!cancelled)setPreviewLoading(false);}
  }
  renderAll();return()=>{cancelled=true;};
 },[files,pdfPassword]);
 const changeFiles=next=>{setFiles(next);setPreviewPage(0);};
 const addSide=(pdf,side,x,y,w,h)=>{
  if(!side)return;
  const ratio=Math.min(w/side.width,h/side.height),drawW=side.width*ratio,drawH=side.height*ratio;
  pdf.addImage(side.data,'JPEG',x+(w-drawW)/2,y+(h-drawH)/2,drawW,drawH,undefined,'FAST');
 };
 const generate=async(action='download')=>{
  if(!files.length)return alert('Please select at least one image or PDF file.');
  setBusy(true);
  try{
   const pdf=new jsPDF({orientation,unit:'mm',format:paper.toLowerCase()});
   const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();
   const printMargin=margin,gap=2,rowGap=2,sideW=87,sideH=49.4;
   for(let i=0;i<files.length;i++){
    if(i>0&&i%perSheet===0)pdf.addPage();
    const file=files[i];let front=null,back=null;
    if(isPdfFile(file)){
     const doc=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer()),password:pdfPassword||undefined}).promise;
     [front,back]=await renderPdfSides(doc,2,.94);
    }else{
     const data=await readData(file),props=pdf.getImageProperties(data);
     front={data,width:props.width,height:props.height};
    }
    const row=i%perSheet,y=printMargin+row*(sideH+rowGap),pairW=sideW*2+gap,x=(pw-pairW)/2;
    addSide(pdf,front,x,y,sideW,sideH);
    addSide(pdf,back,x+sideW+gap,y,sideW,sideH);
   }
   if(action==='print'){const blob=pdf.output('blob');const url=URL.createObjectURL(blob);const win=window.open(url,'_blank');if(!win)alert('Please allow pop-ups to print the PDF.');else win.addEventListener('load',()=>win.print(),{once:true});}else{pdf.save(`${card.toLowerCase().replaceAll(' ','-')}-print.pdf`);}
   await addHistory('Card',`${card} (${files.length} set(s))`);
  }catch(e){alert('Could not create PDF: '+e.message)}finally{setBusy(false)}
 };
 const currentSheet=previewSheets[previewPage]||[];
 const allPairs=previewSheets.flat();
 let setIndex=0;
 return <><PageTitle icon={<CreditCard/>} title={`${card} Card Studio`} subtitle="Upload files, preview every Front + Back pair, then review the A4 print sheet below."/>;
 <div className="editor-layout card-top-layout">
  <div className="panel pad"><h2>Upload card files</h2><p className="muted">Each PDF should contain two pages: Page 1 = Front and Page 2 = Back. Up to five uploaded files are arranged on each A4 sheet.</p>
   <FileDrop accept="image/*,application/pdf" multiple onFiles={changeFiles}/>
   {files.some(isPdfFile)&&<label className="pdf-password-field">PDF Password<input type="password" value={pdfPassword} onChange={e=>setPdfPassword(e.target.value)} placeholder="Enter password for protected PDF" autoComplete="off"/><small>Password is used locally in this browser to open the PDF.</small></label>}
   {files.map((f,i)=><div className="file-row" key={i}><FileImage/><div><b>{f.name}</b><small>{(f.size/1024).toFixed(0)} KB · Set {i+1}</small></div><button className="icon-btn" onClick={()=>changeFiles(files.filter((_,j)=>j!==i))}><X size={16}/></button></div>)}
   <div className="form-grid"><label>Paper size<select value={paper} onChange={e=>setPaper(e.target.value)}><option>A4</option><option>Letter</option><option>Legal</option></select></label><label>Orientation<select value={orientation} onChange={e=>setOrientation(e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label>Margins (mm)<input type="number" min="0" max="30" value={margin} onChange={e=>setMargin(Math.max(0,Math.min(30,+e.target.value||0)))}/></label></div>
   <button className="primary" disabled={busy||!files.length} onClick={generate}><Download size={16}/>{busy?'Preparing PDF…':'Download print-ready PDF'}</button>
  </div>
  <div className="panel pad"><h2>Front and Back</h2><p className="muted">Preview of every uploaded file. Front is on the left and Back is on the right.</p>
   {previewLoading?<div className="preview-empty"><span>Rendering all uploaded files…</span></div>:allPairs.length?<div className="all-card-pairs">{allPairs.map((item,i)=><div className="all-card-pair" key={item.name+'-'+i}><div className="all-card-pair-title">SET {i+1} · {item.name}</div><div className="all-card-pair-sides"><div className="pair-side"><b>FRONT</b>{item.sides[0]?<img src={item.sides[0]} alt={`Set ${i+1} Front`}/>:<span className="blank-side">No front image</span>}</div><div className="pair-side"><b>BACK</b>{item.sides[1]?<img src={item.sides[1]} alt={`Set ${i+1} Back`}/>:<span className="blank-side">Blank back</span>}</div></div></div>)}</div>:<div className="preview-empty"><Image size={42}/><span>Upload files to preview every Front + Back pair</span></div>}
   {previewError&&<div className="print-summary">{previewError}</div>}
  </div>
 </div>
 <div className="panel pad card-print-panel"><div className="print-preview-heading"><div><h2>A4 Print Preview</h2><p className="muted">This is how the downloaded PDF will be arranged. Up to five Front + Back sets per page.</p></div><div className="print-preview-actions"><button className="primary" disabled={busy||!files.length} onClick={()=>generate('download')}><Download size={15}/>{busy?'Preparing…':'Download PDF'}</button><button className="secondary" disabled={busy||!files.length} onClick={()=>generate('print')}><Printer size={15}/>Print</button></div></div>
  {files.length?<><div className="preview-toolbar"><span>A4 sheet {previewPage+1} of {Math.max(1,previewSheets.length)} · Sets {previewPage*5+1}–{Math.min((previewPage+1)*5,files.length)} of {files.length}</span><div className="page-controls"><button className="icon-btn" disabled={previewPage===0} onClick={()=>setPreviewPage(p=>Math.max(0,p-1))}>‹</button><small>Page {previewPage+1} / {Math.max(1,previewSheets.length)}</small><button className="icon-btn" disabled={previewPage>=previewSheets.length-1} onClick={()=>setPreviewPage(p=>Math.min(previewSheets.length-1,p+1))}>›</button></div></div>
   <div className="a4-preview-wrap print-sheet-wrap"><div className="a4-preview multi-pair-sheet" style={{aspectRatio:orientation==='landscape'?'297 / 210':'210 / 297',padding:`${margin}mm`}}>{previewLoading?<span className="preview-status">Rendering print sheet…</span>:currentSheet.map((item,i)=><div className="multi-pair-row" key={item.name+'-'+i}><div className="multi-pair-label">SET {previewPage*5+i+1} · {item.name}</div><div className="multi-pair-sides"><div className="pair-side"><b>FRONT</b>{item.sides[0]?<img src={item.sides[0]} alt="Front side"/>:<span className="blank-side">No front image</span>}</div><div className="pair-side"><b>BACK</b>{item.sides[1]?<img src={item.sides[1]} alt="Back side"/>:<span className="blank-side">Blank back</span>}</div></div></div>)}</div></div>
   <div className="print-summary">Total: {files.length} uploaded file(s) = {files.length} set(s) · Up to 5 sets per {paper} page</div>
  </>:<div className="preview-empty"><Image size={48}/><span>Your A4 print preview will appear here</span></div>}
 </div></>;

}
function PassportStudio({addHistory}){const [mode,setMode]=useState('single');const [files,setFiles]=useState([]);const [name,setName]=useState('');const [date,setDate]=useState('');const [count,setCount]=useState(8);const [size,setSize]=useState('4x6');const [bg,setBg]=useState('#ffffff');const [changeBg,setChangeBg]=useState(false);const [expand,setExpand]=useState(false);const [urls,setUrls]=useState([]);const [busy,setBusy]=useState(false);useEffect(()=>{const u=files.map(f=>URL.createObjectURL(f));setUrls(u);return()=>u.forEach(URL.revokeObjectURL)},[files]);const make=async()=>{if(!files.length)return alert('Please upload a photo.');if(mode==='single'&&files.length>1)setFiles([files[0]]);setBusy(true);try{const page=size==='4x6'?[101.6,152.4]:[210,297];const pdf=new jsPDF({orientation:size==='4x6'?'portrait':'portrait',unit:'mm',format:page});const cols=size==='4x6'?2:5,rows=size==='4x6'?4:6;const w=(page[0]-10-(cols-1)*3)/cols,h=w*1.285;const chosen=mode==='single'?files.slice(0,1):files.slice(0,30);let n=0;for(let i=0;i<Math.min(count,30);i++){const f=chosen[i%chosen.length];const data=await readData(f);const x=5+(i%cols)*(w+3),y=5+Math.floor(i/cols)*(h+3);pdf.setFillColor(bg);pdf.rect(x,y,w,h,'F');pdf.addImage(data,'JPEG',x,y,w,h,undefined,'FAST');n++;}pdf.save('mahadev-passport-photos.pdf');await addHistory('Passport Photo',`${n} photo(s) – ${size} sheet`);}catch(e){alert('Photo sheet error: '+e.message)}finally{setBusy(false)}};return <><PageTitle icon={<Camera/>} title="Passport Size Photo" subtitle="Create passport photo sheets for printing."/><div className="info-banner"><b>Photo information</b><span>For best results, upload a clear, front-facing photo. Standard passport photo crop is approximately 35 × 45 mm; confirm the required dimensions for the application.</span></div><div className="editor-layout"><div className="panel pad"><div className="panel-head"><h2>Passport Photo Studio</h2><div className="tabs"><button className={mode==='single'?'selected':''} onClick={()=>setMode('single')}>Single</button><button className={mode==='multiple'?'selected':''} onClick={()=>setMode('multiple')}>Multiple</button></div></div><FileDrop accept="image/*" multiple={mode==='multiple'} onFiles={setFiles}/><div className="form-grid"><label>Name (optional)<input value={name} onChange={e=>setName(e.target.value)} placeholder="Name"/></label><label>Date (optional)<input value={date} onChange={e=>setDate(e.target.value)} placeholder="DD-MM-YYYY"/></label><label>Number of photos<input type="number" min="1" max="30" value={count} onChange={e=>setCount(Math.max(1,Math.min(30,+e.target.value||1)))}/></label><label>Page size<select value={size} onChange={e=>setSize(e.target.value)}><option value="4x6">4×6 inch (8 photos)</option><option value="A4">A4 (30 photos)</option></select></label><label>Change background<select value={changeBg?'yes':'no'} onChange={e=>setChangeBg(e.target.value==='yes')}><option value="no">No</option><option value="yes">Yes</option></select></label><label>Expand image<select value={expand?'yes':'no'} onChange={e=>setExpand(e.target.value==='yes')}><option value="no">No</option><option value="yes">Yes</option></select></label><label>Background color<input type="color" value={bg} onChange={e=>setBg(e.target.value)}/></label></div><button className="primary" disabled={!files.length||busy} onClick={make}><Download size={16}/>{busy?'Creating…':'Create & Download Photo Sheet'}</button></div><div className="panel pad"><h2>Photo preview</h2><div className="photo-preview">{urls.length?urls.map(u=><img src={u} key={u} alt="Uploaded passport photo"/>):<div className="preview-empty"><Camera size={44}/><span>Upload a photo to preview</span></div>}</div><p className="muted tiny">Background replacement and intelligent subject expansion are not included in this starter build; the color is applied to the photo sheet background.</p></div></div></>}
function Converter({addHistory}){const [files,setFiles]=useState([]);const [busy,setBusy]=useState(false);const [result,setResult]=useState('');const convert=async()=>{if(!files.length)return alert('Select one or more files.');setBusy(true);try{const f=files[0];if(f.type==='application/pdf'){const doc=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const vp=p.getViewport({scale:2});const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;await p.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;const a=document.createElement('a');a.href=c.toDataURL('image/jpeg',.92);a.download=`${f.name.replace(/\.pdf$/i,'')}-page-${i}.jpg`;a.click();}}else{const pdf=new jsPDF();for(let i=0;i<files.length;i++){if(i)pdf.addPage();const data=await readData(files[i]);const p=pdf.getImageProperties(data);const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight();const ratio=Math.min((pw-20)/p.width,(ph-20)/p.height);const w=p.width*ratio,h=p.height*ratio;pdf.addImage(data,p.fileType||'JPEG',(pw-w)/2,(ph-h)/2,w,h); }pdf.save('mahadev-images-to-pdf.pdf');}setResult(f.type==='application/pdf'?'PDF pages downloaded as JPG images.':'Images combined into a PDF.');await addHistory('Document',`${files.length} file(s) converted`);}catch(e){alert('Conversion failed: '+e.message)}finally{setBusy(false)}};return <><PageTitle icon={<FileText/>} title="Document Converter" subtitle="Convert image files to PDF or PDF pages to JPG."/><div className="converter-wrap panel pad"><h2>Upload documents</h2><p className="muted">Supported in this starter: JPG, PNG and PDF. Image files can be combined into one PDF; PDF pages can be exported as JPG.</p><FileDrop accept="image/*,application/pdf" multiple onFiles={setFiles}/>{files.map((f,i)=><div className="file-row" key={i}><FileText/><div><b>{f.name}</b><small>{(f.size/1024).toFixed(0)} KB</small></div><button className="icon-btn" onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))}><X size={16}/></button></div>)}<button className="primary" disabled={!files.length||busy} onClick={convert}><ArrowLeftRight size={16}/>{busy?'Converting…':'Convert & Download'}</button>{result&&<div className="success">{result}</div>}</div></>}
function FileDrop({accept,multiple,onFiles}){const [drag,setDrag]=useState(false);return <label className={`dropzone ${drag?'drag':''}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);onFiles(Array.from(e.dataTransfer.files))}}><UploadCloud size={30}/><b>Choose files or drag them here</b><span>Accepted: {accept.includes('pdf')?'JPG, PNG, PDF':'JPG, PNG'}</span><input type="file" accept={accept} multiple={multiple} onChange={e=>onFiles(Array.from(e.target.files||[]))}/></label>}
function HistoryPage({history}){return <><PageTitle icon={<History/>} title="Work History" subtitle="Your recent card and document activity."/><div className="panel history-panel"><HistoryTable history={history}/></div></>}
function HistoryTable({history}){return history.length?<div className="table-wrap"><table><thead><tr><th>Type</th><th>Description</th><th>Date</th></tr></thead><tbody>{history.map((h,i)=><tr key={h.id||i}><td><span className="type-pill">{h.type}</span></td><td>{h.label}</td><td>{h.created_at?new Date(h.created_at).toLocaleString(): 'Just now'}</td></tr>)}</tbody></table></div>:<div className="empty">No work history yet. Start by creating a card or converting a document.</div>}
function WalletPage({wallet}){return <><PageTitle icon={<Wallet/>} title="Wallet" subtitle="Your portal wallet balance."/><div className="wallet-card"><span>Available balance</span><strong>₹{wallet}</strong><p>Wallet top-up and online payment gateway can be connected after payment provider credentials are configured.</p></div></>}
function readData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}

createRoot(document.getElementById('root')).render(<App/>);

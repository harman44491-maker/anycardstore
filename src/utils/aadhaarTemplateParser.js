import * as pdfjsLib from 'pdfjs-dist';

export const AADHAAR_PVC_SPEC = {
  widthMm: 85.6,
  heightMm: 54.0,
  dpi: 600,
  pxWidth: Math.round((85.6 * 600) / 25.4), // ~2020px
  pxHeight: Math.round((54.0 * 600) / 25.4), // ~1276px
  renderScale: 600 / 72,
};

function cleanLine(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

function groupItemsIntoLines(items, yTolerance = 4) {
  const valid = (items || [])
    .map((it) => {
      const str = cleanLine(it.str);
      if (!str) return null;
      const [, , , , x, y] = it.transform || [1, 0, 0, 1, 0, 0];
      return { str, x, y, width: it.width || 0, height: it.height || 10 };
    })
    .filter(Boolean);

  // Sort top-to-bottom (higher y in PDF coords = higher on page), then left-to-right
  valid.sort((a, b) => {
    if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y;
    return a.x - b.x;
  });

  const lines = [];
  for (const item of valid) {
    const existing = lines.find((ln) => Math.abs(ln.y - item.y) <= yTolerance);
    if (existing) {
      existing.items.push(item);
    } else {
      lines.push({ y: item.y, x: item.x, items: [item] });
    }
  }

  return lines.map((ln) => {
    ln.items.sort((a, b) => a.x - b.x);
    const text = cleanLine(ln.items.map((i) => i.str).join(' '));
    const minX = Math.min(...ln.items.map((i) => i.x));
    const maxX = Math.max(...ln.items.map((i) => i.x + i.width));
    return { text, y: ln.y, x: minX, maxX, items: ln.items };
  });
}

function isNoiseLine(text) {
  const lower = text.toLowerCase();
  if (!text) return true;
  if (lower.includes('unique identification authority') || lower.includes('government of india')) return true;
  if (lower.includes('enrolment no') || lower.includes('download date') || lower.includes('generated on')) return true;
  if (lower.includes('proof of identity') || lower.includes('offline xml') || lower.includes('qr code')) return true;
  if (lower.includes('mera aadhaar') || lower.includes('1947') || lower.includes('help@uidai')) return true;
  if (text.includes('आधार पहचान का प्रमाण') || text.includes('मेरा आधार')) return true;
  return false;
}

export function parseAadhaarLines(lines) {
  const filtered = lines.filter((l) => !isNoiseLine(l.text));

  let dobOrYob = '';
  let gender = '';
  let idNumber = '';
  let vidNumber = '';
  let name = '';
  const addressLines = [];

  const dobRegex = /(DOB\s*:?\s*\d{2}[/-]\d{2}[/-]\d{4}|Year of Birth\s*:?\s*\d{4}|जन्म\s*तिथि\s*\/?\s*DOB\s*:?\s*\d{2}[/-]\d{2}[/-]\d{4}|\d{2}\/\d{2}\/\d{4})/i;
  const genderRegex = /\b(MALE|FEMALE|TRANSGENDER)\b/i;
  const idRegex = /\b\d{4}\s?\d{4}\s?\d{4}\b/;
  const vidRegex = /VID\s*:?\s*(\d{4}\s?\d{4}\s?\d{4}\s?\d{4})/i;

  let addressStarted = false;

  for (let i = 0; i < filtered.length; i++) {
    const t = filtered[i].text;

    const vidMatch = t.match(vidRegex);
    if (vidMatch && !vidNumber) {
      vidNumber = cleanLine(vidMatch[1]);
      continue;
    }

    const idMatch = t.match(idRegex);
    if (idMatch && !t.toLowerCase().includes('vid') && !idNumber) {
      idNumber = cleanLine(idMatch[0]);
      continue;
    }

    if (!dobOrYob && dobRegex.test(t)) {
      const m = t.match(dobRegex);
      dobOrYob = m ? cleanLine(m[0]) : t;
      continue;
    }

    if (!gender && genderRegex.test(t)) {
      const gMatch = t.match(genderRegex);
      gender = gMatch ? gMatch[1].toUpperCase() : '';
      // If DOB/Gender is on same line, check if DOB is also there
      if (!dobOrYob && dobRegex.test(t)) {
        const dMatch = t.match(dobRegex);
        if (dMatch) dobOrYob = cleanLine(dMatch[0]);
      }
      continue;
    }

    if (/^(Address|पता|पता:|Address:)$/i.test(t) || /^Address\b/i.test(t)) {
      addressStarted = true;
      const afterLabel = cleanLine(t.replace(/^(Address|पता)\s*:?\s*/i, ''));
      if (afterLabel && !/^[A-Za-z\s]+:$/.test(afterLabel)) {
        addressLines.push(afterLabel);
      }
      continue;
    }

    if (addressStarted) {
      // Stop address if we hit ID/VID/footer lines
      if (idRegex.test(t) || /vid\s*:?/i.test(t) || /uidai\.gov\.in/i.test(t)) {
        addressStarted = false;
        continue;
      }
      addressLines.push(t);
    }
  }

  // Name usually appears just above DOB/Gender line on the front card
  const dobIdx = filtered.findIndex((l) => dobRegex.test(l.text) || genderRegex.test(l.text));
  if (dobIdx > 0) {
    for (let j = dobIdx - 1; j >= Math.max(0, dobIdx - 3); j--) {
      const candidate = filtered[j].text;
      if (
        candidate &&
        !/\d{4}/.test(candidate) &&
        !/to$/i.test(candidate) &&
        !candidate.toLowerCase().includes('aadhaar') &&
        !candidate.toLowerCase().includes('enrolled')
      ) {
        name = candidate;
        break;
      }
    }
  }

  return {
    name: name || 'Aadhaar Holder',
    dobOrYob: dobOrYob || '',
    gender: gender || '',
    idNumber: idNumber || '',
    vidNumber: vidNumber || '',
    addressLines,
  };
}

function wrapTextLines(ctx, paragraphs, maxWidth, fontSize, fontWeight = '600', fontFamily = 'Arial, sans-serif') {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const wrapped = [];

  for (const para of paragraphs) {
    const words = cleanLine(para).split(' ').filter(Boolean);
    if (!words.length) continue;

    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = `${current} ${words[i]}`;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        wrapped.push(current);
        current = words[i];
      }
    }
    wrapped.push(current);
  }

  return wrapped;
}

// Automatically shrinks font size if text overflows box height so nothing gets clipped
function drawAutoFitTextBlock(ctx, paragraphs, box, options = {}) {
  const {
    maxFontSize = 36,
    minFontSize = 18,
    fontWeight = '600',
    lineHeightRatio = 1.28,
    color = '#111827',
    fontFamily = '"Noto Sans Devanagari", "Noto Sans Gurmukhi", Arial, sans-serif',
  } = options;

  let chosenSize = minFontSize;
  let chosenLines = [];

  for (let size = maxFontSize; size >= minFontSize; size -= 2) {
    const lines = wrapTextLines(ctx, paragraphs, box.w, size, fontWeight, fontFamily);
    const totalHeight = lines.length * size * lineHeightRatio;
    if (totalHeight <= box.h) {
      chosenSize = size;
      chosenLines = lines;
      break;
    }
    chosenLines = lines;
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${chosenSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  const step = chosenSize * lineHeightRatio;
  chosenLines.forEach((line, idx) => {
    const yPos = box.y + idx * step;
    if (yPos + chosenSize <= box.y + box.h + 4) {
      ctx.fillText(line, box.x, yPos);
    }
  });
  ctx.restore();
}

function drawCardFrame(ctx, w, h, headerTitle, subtitle) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Top tricolor accent bar
  const barH = Math.round(h * 0.022);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, w * 0.34, barH);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(w * 0.34, 0, w * 0.32, barH);
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(w * 0.66, 0, w * 0.34, barH);

  // Header band
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, barH, w, Math.round(h * 0.13));

  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${Math.round(h * 0.044)}px Arial, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(headerTitle, Math.round(w * 0.05), barH + Math.round(h * 0.045));

  ctx.fillStyle = '#475569';
  ctx.font = `600 ${Math.round(h * 0.03)}px Arial, sans-serif`;
  ctx.fillText(subtitle, Math.round(w * 0.05), barH + Math.round(h * 0.095));

  // Divider line
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(Math.round(w * 0.04), Math.round(h * 0.165));
  ctx.lineTo(w - Math.round(w * 0.04), Math.round(h * 0.165));
  ctx.stroke();

  // Outer card border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}

function cropRegionFromCanvas(srcCanvas, rectRatio, outW, outH, filterStr = 'none') {
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.filter = filterStr;
  ctx.drawImage(
    srcCanvas,
    srcCanvas.width * rectRatio.x,
    srcCanvas.height * rectRatio.y,
    srcCanvas.width * rectRatio.w,
    srcCanvas.height * rectRatio.h,
    0,
    0,
    outW,
    outH
  );
  return canvas;
}

export async function buildParsedAadhaarCards(pdfFile, password = '', options = {}) {
  const {
    photoBrightness = 120,
    photoContrast = 105,
    boldWeight = '700',
  } = options;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, password });
  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  // Extract text items + positions
  const textContent = await page.getTextContent();
  const lines = groupItemsIntoLines(textContent.items);
  const parsed = parseAadhaarLines(lines);

  // Render high-DPI page for photo & QR extraction
  const viewport = page.getViewport({ scale: AADHAAR_PVC_SPEC.renderScale });
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = Math.round(viewport.width);
  pageCanvas.height = Math.round(viewport.height);
  const pageCtx = pageCanvas.getContext('2d');
  await page.render({ canvasContext: pageCtx, viewport }).promise;

  const { pxWidth: w, pxHeight: h } = AADHAAR_PVC_SPEC;

  // Locate front card region (lower half of standard e-Aadhaar PDF)
  const frontCardRegion = { x: 0.06, y: 0.71, w: 0.43, h: 0.22 };
  const backCardRegion = { x: 0.49, y: 0.71, w: 0.43, h: 0.22 };

  const frontRaw = cropRegionFromCanvas(pageCanvas, frontCardRegion, 900, 560);
  const backRaw = cropRegionFromCanvas(pageCanvas, backCardRegion, 900, 560);

  // Photo & QR regions inside cropped halves
  const photoCrop = cropRegionFromCanvas(
    frontRaw,
    { x: 0.06, y: 0.22, w: 0.22, h: 0.45 },
    Math.round(w * 0.22),
    Math.round(h * 0.44),
    `brightness(${photoBrightness}%) contrast(${photoContrast}%)`
  );

  const qrCrop = cropRegionFromCanvas(
    backRaw,
    { x: 0.64, y: 0.18, w: 0.32, h: 0.56 },
    Math.round(w * 0.27),
    Math.round(h * 0.44),
    'contrast(115%)'
  );

  // --- FRONT CARD TEMPLATE ---
  const frontCanvas = document.createElement('canvas');
  frontCanvas.width = w;
  frontCanvas.height = h;
  const fCtx = frontCanvas.getContext('2d');
  drawCardFrame(fCtx, w, h, 'Government of India', 'Unique Identification Authority of India');

  const photoX = Math.round(w * 0.055);
  const photoY = Math.round(h * 0.22);
  const photoW = Math.round(w * 0.22);
  const photoH = Math.round(h * 0.44);

  fCtx.drawImage(photoCrop, photoX, photoY, photoW, photoH);
  fCtx.strokeStyle = '#334155';
  fCtx.lineWidth = 2;
  fCtx.strokeRect(photoX, photoY, photoW, photoH);

  const frontDetails = [
    parsed.name,
    parsed.dobOrYob,
    parsed.gender,
  ].filter(Boolean);

  drawAutoFitTextBlock(
    fCtx,
    frontDetails,
    {
      x: Math.round(w * 0.31),
      y: Math.round(h * 0.23),
      w: Math.round(w * 0.64),
      h: Math.round(h * 0.44),
    },
    {
      maxFontSize: 44,
      minFontSize: 22,
      fontWeight: boldWeight,
      lineHeightRatio: 1.35,
      color: '#0f172a',
    }
  );

  // Bottom Aadhaar Number bar on Front
  fCtx.strokeStyle = '#dc2626';
  fCtx.lineWidth = 3;
  fCtx.beginPath();
  fCtx.moveTo(Math.round(w * 0.05), Math.round(h * 0.85));
  fCtx.lineTo(w - Math.round(w * 0.05), Math.round(h * 0.85));
  fCtx.stroke();

  fCtx.fillStyle = '#000000';
  fCtx.font = `700 ${Math.round(h * 0.068)}px Arial, sans-serif`;
  fCtx.textAlign = 'center';
  fCtx.textBaseline = 'middle';
  fCtx.fillText(parsed.idNumber || 'XXXX XXXX XXXX', w / 2, Math.round(h * 0.77));

  fCtx.fillStyle = '#b91c1c';
  fCtx.font = `700 ${Math.round(h * 0.04)}px Arial, sans-serif`;
  fCtx.fillText('मेरा आधार, मेरी पहचान', w / 2, Math.round(h * 0.915));
  fCtx.textAlign = 'left';

  // --- BACK CARD TEMPLATE ---
  const backCanvas = document.createElement('canvas');
  backCanvas.width = w;
  backCanvas.height = h;
  const bCtx = backCanvas.getContext('2d');
  drawCardFrame(bCtx, w, h, 'Address / पता', 'Resident Identity Details');

  const addrParagraphs = parsed.addressLines.length
    ? parsed.addressLines
    : ['Address details not detected in text layer — check preview'];

  drawAutoFitTextBlock(
    bCtx,
    addrParagraphs,
    {
      x: Math.round(w * 0.055),
      y: Math.round(h * 0.21),
      w: Math.round(w * 0.59),
      h: Math.round(h * 0.49),
    },
    {
      maxFontSize: 34,
      minFontSize: 18,
      fontWeight: boldWeight,
      lineHeightRatio: 1.28,
      color: '#0f172a',
    }
  );

  const qrX = Math.round(w * 0.675);
  const qrY = Math.round(h * 0.22);
  const qrW = Math.round(w * 0.27);
  const qrH = Math.round(h * 0.44);
  bCtx.drawImage(qrCrop, qrX, qrY, qrW, qrH);

  // Bottom ID & VID on Back
  bCtx.strokeStyle = '#cbd5e1';
  bCtx.lineWidth = 2;
  bCtx.beginPath();
  bCtx.moveTo(Math.round(w * 0.05), Math.round(h * 0.855));
  bCtx.lineTo(w - Math.round(w * 0.05), Math.round(h * 0.855));
  bCtx.stroke();

  bCtx.fillStyle = '#000000';
  bCtx.font = `700 ${Math.round(h * 0.058)}px Arial, sans-serif`;
  bCtx.textAlign = 'center';
  bCtx.textBaseline = 'middle';
  bCtx.fillText(parsed.idNumber || 'XXXX XXXX XXXX', w / 2, Math.round(h * 0.755));

  if (parsed.vidNumber) {
    bCtx.fillStyle = '#1e293b';
    bCtx.font = `700 ${Math.round(h * 0.036)}px Arial, sans-serif`;
    bCtx.fillText(`VID : ${parsed.vidNumber}`, w / 2, Math.round(h * 0.82));
  }

  bCtx.fillStyle = '#334155';
  bCtx.font = `600 ${Math.round(h * 0.032)}px Arial, sans-serif`;
  bCtx.fillText('1947  |  help@uidai.gov.in  |  www.uidai.gov.in', w / 2, Math.round(h * 0.91));
  bCtx.textAlign = 'left';

  return {
    parsed,
    frontUrl: frontCanvas.toDataURL('image/png'),
    backUrl: backCanvas.toDataURL('image/png'),
    dpi: AADHAAR_PVC_SPEC.dpi,
    widthMm: 90,
    heightMm: 60,
  };
}

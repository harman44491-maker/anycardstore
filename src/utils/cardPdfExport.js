import { PDFDocument } from 'pdf-lib';

export async function createTwoPageCardPdf(frontPngBytes, backPngBytes, cardSpec) {
  const pdf = await PDFDocument.create();
  const pageSize = [
    (cardSpec.widthMm * 72) / 25.4,
    (cardSpec.heightMm * 72) / 25.4,
  ];

  for (const pngBytes of [frontPngBytes, backPngBytes]) {
    const image = await pdf.embedPng(pngBytes);
    const page = pdf.addPage(pageSize);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageSize[0],
      height: pageSize[1],
    });
  }

  return pdf.save();
}

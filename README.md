# Mahadev Net Cafe — Print & Card Studio

100% browser-based (300 DPI) multi-tool suite for **Mahadev Net Cafe** (Patiala, Punjab):
- **Ayushman / Mukhya Mantri Sehat Card Maker** (Up to 5 PDFs batch split + A4 print sheet)
- **PVC ID Card Maker** (e-Aadhaar password unlock, Voter ID, PAN, e-Shram + A4 / PVC Tray layout)
- **Passport Photo Sheet Maker** (3.5 cm × 4.5 cm @ 300 DPI on 4×6 / A4 sheets)
- **Card PDF Crop & Print** (independent front/back page selection and CR80-proportioned crops; card-size PNGs and a two-page PDF)
- **Auto-Saved Yellow Crop Calibration Bar** (Saved in browser `localStorage`)

The generic Card PDF Crop & Print tool works only with pages from a user-selected PDF. It supports manually adjustable crop regions capped at 88×58 mm, full-page output without cropping, separate side PNGs, vertical or side-by-side front/back print/download images, and a two-page card-size PDF. Cropping and PDF export happen locally in the browser; protected PDFs prompt for their password, which is held only in memory for the current tool session and is never persisted.

The Passport Photo Sheet Maker supports A4, 4×6-inch, Letter, Legal, and custom paper dimensions, with preset or custom photo-copy counts split across sheets as needed.

## Setup & Run
```bash
npm install
npm run dev
```

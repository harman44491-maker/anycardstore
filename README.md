# MAHADEV NET CAFE – Digital Portal

A responsive React + Vite starter for a card-printing and document-processing portal.

## Included
- Supabase email/password authentication (requires your own Supabase project)
- Dashboard with wallet/card/activity summary
- Punjab card template gallery with search
- Card studio: upload images/PDFs, select A4/Letter/Legal, portrait/landscape, margins and fit-to-page, export print-ready PDF
- Passport photo sheet: single/multiple upload, 4x6 or A4 layout, count, sheet background colour and PDF export
- Document conversion: image(s) to PDF and PDF pages to JPG
- User work history stored in Supabase
- Responsive layout and light/dark theme

## Important limitations in this starter
- The listed card names are starter catalogue entries, not official/verified card templates. Upload the legitimate source artwork/forms you are authorized to print. No government affiliation is implied.
- This starter's card editor lays out uploaded source images/PDFs for printing; it does not fetch or generate official identity-card data.
- Passport photo background colour currently applies to the sheet canvas; automatic background removal/replacement and face-aware crop are not included yet.
- Word-to-PDF, PDF-to-Word, payment gateway, wallet top-ups, admin management screens, storage buckets and card-specific form fields require additional implementation/configuration. Wallet and payment counts are placeholders until connected to a payment provider.
- The browser-only conversion runs on the user's device. Large PDFs/images may use significant memory.

## 1. Create Supabase project
1. Create a project at https://supabase.com.
2. Open Project Settings > API and copy Project URL and anon/public key.
3. Copy `.env.example` to `.env` and fill in:
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```
4. In Supabase SQL Editor, run the contents of `supabase/schema.sql`.
5. In Authentication > URL Configuration, add your local and deployed site URLs to Site URL / Redirect URLs.
6. Register your account from the app. To mark it as admin, run the commented SQL at the bottom of `supabase/schema.sql` with your registered email. (Admin UI is not yet implemented in this starter.)

## 2. Run on Windows
Install Node.js LTS from https://nodejs.org.

Extract the ZIP, open Command Prompt/Terminal in this folder and run:
```bash
npm install
npm run dev
```
Open the local URL printed by Vite (usually http://localhost:5173).

To test the production build:
```bash
npm run build
```

## 3. Push to GitHub
1. Create a new empty GitHub repository.
2. Open terminal in this project folder and run:
```bash
git init
git add .
git commit -m "Initial Mahadev Net Cafe portal"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```
Do not commit your `.env` file. It is ignored by the included `.gitignore`.

## 4. Deploy on Render
1. Sign in at https://render.com and choose **New > Static Site**.
2. Connect your GitHub repository.
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Render settings.
6. Deploy. Add the Render URL to Supabase Authentication's allowed redirect URLs.

## Project structure
- `src/main.jsx` – app pages and client-side workflows
- `src/style.css` – responsive styling
- `src/supabase.js` – Supabase client
- `supabase/schema.sql` – database tables, trigger and RLS policies
- `.env.example` – required environment variable names

## Security
Never put a Supabase `service_role` key in frontend code or in Vite environment variables. Only use the anon/public key in this browser app and rely on Row Level Security. Do not store sensitive identity documents permanently without a clear retention policy and user consent.

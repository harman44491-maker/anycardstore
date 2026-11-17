====================================================
CardPro Hub v3.0 - Production Ready Setup Guide
(MongoDB Persistent DB + Razorpay Payment Gateway)
====================================================

1. INSTALL NODE.JS:
   Download & install Node.js (LTS) from https://nodejs.org

2. INSTALL DEPENDENCIES:
   Open terminal/cmd inside this folder and run:
   npm install

3. CONFIGURE MONGODB & RAZORPAY (Optional for local demo):
   - Rename '.env.example' to '.env'
   - Add your free MongoDB Atlas URI in MONGODB_URI
   - Add your Razorpay API keys in RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET
   *(Note: If MONGODB_URI is blank, the app runs in Memory Demo Mode automatically)*

4. START SERVER:
   npm start

5. OPEN IN BROWSER:
   Visit: http://localhost:5000

   Demo Retailer Login:
   Email: retailer@cardpro.in | Password: 123

   Super Admin Login:
   Email: admin@cardpro.in | Password: 123

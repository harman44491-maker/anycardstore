require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage() });

// Razorpay Setup
const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_DEMO_MODE';
const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'demo_secret';
const isDemoPayment = RZP_KEY_ID === 'rzp_test_DEMO_MODE' || RZP_KEY_ID === 'rzp_test_YourKeyHere';

let razorpay = null;
if (!isDemoPayment) {
  razorpay = new Razorpay({ key_id: RZP_KEY_ID, key_secret: RZP_KEY_SECRET });
}

// MongoDB Schemas
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'retailer' },
  wallet: { type: Number, default: 0 },
  status: { type: String, default: 'active' }
});

const serviceSchema = new mongoose.Schema({
  serviceId: { type: String, unique: true },
  name: String,
  desc: String,
  price: Number,
  active: { type: Boolean, default: true },
  icon: String
});

const txnSchema = new mongoose.Schema({
  txnId: String,
  userId: String,
  type: String,
  amount: Number,
  desc: String,
  date: { type: String, default: () => new Date().toLocaleString() }
});

const User = mongoose.model('User', userSchema);
const Service = mongoose.model('Service', serviceSchema);
const Transaction = mongoose.model('Transaction', txnSchema);

let useMongo = false;

// Memory Fallback Data
let memDb = {
  users: [
    { userId: 'ADMIN-01', name: 'Super Admin', email: 'admin@cardpro.in', password: '123', role: 'admin', wallet: 0, status: 'active' },
    { userId: 'RT-1001', name: 'Sharma Digital Seva', email: 'retailer@cardpro.in', password: '123', role: 'retailer', wallet: 250, status: 'active' }
  ],
  services: [
    { serviceId: 'srv-1', name: 'Aadhaar PVC Card Layout', desc: 'Auto-crop PDF to CR80 front & back A4 sheet', price: 5, active: true, icon: 'fa-fingerprint' },
    { serviceId: 'srv-2', name: 'e-PAN PVC Card Layout', desc: 'High-DPI CR80 print layout from e-PAN PDF', price: 5, active: true, icon: 'fa-address-card' },
    { serviceId: 'srv-3', name: 'Ayushman / Health Card', desc: 'Instant print formatting for PMJAY & Health IDs', price: 4, active: true, icon: 'fa-heart-pulse' },
    { serviceId: 'srv-4', name: 'e-Shram / UAN Card', desc: 'Format UAN PDF into standard PVC card size', price: 4, active: true, icon: 'fa-helmet-safety' },
    { serviceId: 'srv-5', name: 'Voter ID (EPIC) Layout', desc: 'Digital e-EPIC PDF to sharp PVC print layout', price: 5, active: true, icon: 'fa-check-to-slot' },
    { serviceId: 'srv-6', name: 'Custom School/Office ID', desc: 'Generate custom ID layout from uploaded PDF/Doc', price: 3, active: true, icon: 'fa-id-badge' }
  ],
  transactions: [
    { txnId: 'TXN-901', userId: 'RT-1001', type: 'CREDIT', amount: 250, desc: 'Initial Demo Wallet Credit', date: new Date().toLocaleString() }
  ]
};

async function initDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>')) {
    console.log('Running in Memory Mode (Add MONGODB_URI in .env for persistent cloud DB)');
    return;
  }
  try {
    await mongoose.connect(uri);
    useMongo = true;
    console.log('Connected to MongoDB Persistent Database');

    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.insertMany(memDb.users);
      await Service.insertMany(memDb.services);
      await Transaction.insertMany(memDb.transactions);
      console.log('Seeded default Admin, Retailer & Services into MongoDB');
    }
  } catch (err) {
    console.error('MongoDB Connection Failed, falling back to Memory Mode:', err.message);
  }
}

// 1. Auth Routes
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = useMongo
    ? await User.findOne({ email, password })
    : memDb.users.find(u => u.email === email && u.password === password);

  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account blocked by Admin' });
  res.json({ user });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  const exists = useMongo ? await User.findOne({ email }) : memDb.users.find(u => u.email === email);
  if (exists) return res.status(400).json({ error: 'Email already registered' });

  const newUserObj = {
    userId: 'RT-' + Math.floor(1000 + Math.random() * 9000),
    name, email, password, role: 'retailer', wallet: 50, status: 'active'
  };
  const txnObj = {
    txnId: 'TXN-' + Date.now(), userId: newUserObj.userId, type: 'CREDIT', amount: 50, desc: 'Welcome Joining Bonus', date: new Date().toLocaleString()
  };

  if (useMongo) {
    const saved = await User.create(newUserObj);
    await Transaction.create(txnObj);
    return res.json({ user: saved });
  } else {
    memDb.users.push(newUserObj);
    memDb.transactions.unshift(txnObj);
    return res.json({ user: newUserObj });
  }
});

// 2. Dashboard Data
app.get('/api/data/:userId', async (req, res) => {
  const uid = req.params.userId;
  const user = useMongo ? await User.findOne({ userId: uid }) : memDb.users.find(u => u.userId === uid);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const services = useMongo ? await Service.find() : memDb.services;
  const transactions = useMongo
    ? (user.role === 'admin' ? await Transaction.find().sort({ _id: -1 }).limit(100) : await Transaction.find({ userId: uid }).sort({ _id: -1 }))
    : (user.role === 'admin' ? memDb.transactions : memDb.transactions.filter(t => t.userId === uid));
  const allUsers = user.role === 'admin' ? (useMongo ? await User.find() : memDb.users) : [];

  res.json({ user, services, transactions, allUsers, dbMode: useMongo ? 'MongoDB Persistent' : 'Memory Mode' });
});

// 3. Razorpay Order & Verification
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const amt = parseFloat(amount);
    if (!amt || amt < 10) return res.status(400).json({ error: 'Minimum recharge amount is ₹10' });

    if (isDemoPayment) {
      return res.json({ demo: true, orderId: 'order_demo_' + Date.now(), amount: amt * 100, keyId: RZP_KEY_ID });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amt * 100),
      currency: 'INR',
      receipt: `rcpt_${userId}_${Date.now()}`
    });
    res.json({ demo: false, orderId: order.id, amount: order.amount, keyId: RZP_KEY_ID });
  } catch (err) {
    res.status(500).json({ error: 'Payment order creation failed' });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const { userId, amount, razorpay_order_id, razorpay_payment_id, razorpay_signature, demo } = req.body;
    const amt = parseFloat(amount);

    if (!demo) {
      const sign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSign = crypto.createHmac('sha256', RZP_KEY_SECRET).update(sign).digest('hex');
      if (razorpay_signature !== expectedSign) {
        return res.status(400).json({ error: 'Invalid payment signature!' });
      }
    }

    const txnObj = {
      txnId: razorpay_payment_id || 'PAY-' + Math.floor(100000 + Math.random() * 900000),
      userId, type: 'CREDIT', amount: amt, desc: demo ? 'Wallet Top-up (Demo Mode)' : 'Wallet Top-up via Razorpay',
      date: new Date().toLocaleString()
    };

    if (useMongo) {
      const updatedUser = await User.findOneAndUpdate({ userId }, { $inc: { wallet: amt } }, { new: true });
      await Transaction.create(txnObj);
      return res.json({ success: true, wallet: updatedUser.wallet });
    } else {
      const user = memDb.users.find(u => u.userId === userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      user.wallet += amt;
      memDb.transactions.unshift(txnObj);
      return res.json({ success: true, wallet: user.wallet });
    }
  } catch (err) {
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// 4. Generate Print-Ready PVC PDF
app.post('/api/print/generate', upload.single('pdfFile'), async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const user = await getUserById(userId);
    const service = await getServiceById(serviceId);

    if (!user || !service) return res.status(404).json({ error: 'Invalid user or service' });
    if (user.wallet < service.price) return res.status(400).json({ error: 'Insufficient wallet balance! Please add money.' });
    if (!req.file) return res.status(400).json({ error: 'Please upload a valid PDF file.' });

    // Load PDF safely (handles encrypted/government PDFs)
    const srcPdf = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    const outPdf = await PDFDocument.create();
    const a4Page = outPdf.addPage([595.28, 841.89]);

    const pages = srcPdf.getPages();
    const [embeddedPage] = await outPdf.embedPages([pages]);

    // CR80 Front & Back Layout on A4
    a4Page.drawPage(embeddedPage, { x: 45, y: 630, width: 242.6, height: 153 });
    a4Page.drawPage(embeddedPage, { x: 305, y: 630, width: 242.6, height: 153 });

    // Deduct Balance & Save Transaction
    await updateUserWallet(user.id, -service.price);
    await addTransaction({
      id: 'PRT-' + Math.floor(100000 + Math.random() * 900000),
      userId: user.id,
      type: 'DEBIT',
      amount: service.price,
      desc: `Printed: ${service.name}`,
      date: new Date().toLocaleString()
    });

    const pdfBytes = await outPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${service.id}_CR80_Print.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('PDF Error:', err);
    res.status(500).json({ error: 'PDF error: ' + err.message });
  }
});
    if (useMongo) {
      await User.updateOne({ userId }, { $inc: { wallet: -service.price } });
      await Transaction.create(txnObj);
    } else {
      user.wallet -= service.price;
      memDb.transactions.unshift(txnObj);
    }

    const pdfBytes = await outPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${service.serviceId}_CR80_Print.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    res.status(500).json({ error: 'Failed to process PDF. Ensure file is valid.' });
  }
});

// 5. Admin Controls
app.post('/api/admin/service', async (req, res) => {
  const { serviceId, price, active } = req.body;
  if (useMongo) {
    const update = {};
    if (price !== undefined) update.price = parseFloat(price);
    if (active !== undefined) update.active = active;
    await Service.updateOne({ serviceId }, { $set: update });
  } else {
    const srv = memDb.services.find(s => s.serviceId === serviceId);
    if (srv) {
      if (price !== undefined) srv.price = parseFloat(price);
      if (active !== undefined) srv.active = active;
    }
  }
  res.json({ success: true });
});

app.post('/api/admin/user-wallet', async (req, res) => {
  const { targetUserId, amount } = req.body;
  const amt = parseFloat(amount);
  if (useMongo) {
    await User.updateOne({ userId: targetUserId }, { $inc: { wallet: amt } });
    await Transaction.create({ txnId: 'ADM-' + Date.now(), userId: targetUserId, type: 'CREDIT', amount: amt, desc: 'Admin Manual Credit' });
  } else {
    const u = memDb.users.find(x => x.userId === targetUserId);
    if (u) {
      u.wallet += amt;
      memDb.transactions.unshift({ txnId: 'ADM-' + Date.now(), userId: targetUserId, type: 'CREDIT', amount: amt, desc: 'Admin Manual Credit', date: new Date().toLocaleString() });
    }
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`CardPro Portal v3.0 Live at http://localhost:${PORT}`));
});

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
let useMongo = false;

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
  date: String
});

const User = mongoose.model('User', userSchema);
const Service = mongoose.model('Service', serviceSchema);
const Transaction = mongoose.model('Transaction', txnSchema);

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

async function initDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('Running in Memory Demo Mode');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    useMongo = true;
    console.log('Connected to MongoDB Atlas');
    const adminExists = await User.findOne({ email: 'admin@cardpro.in' });
    if (!adminExists) {
      await User.insertMany(memDb.users);
      await Service.insertMany(memDb.services);
      await Transaction.insertMany(memDb.transactions);
    }
  } catch (err) {
    console.error('MongoDB Connection Error, falling back to Memory Mode:', err.message);
  }
}
initDatabase();

const razorpay = (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = useMongo
      ? await User.findOne({ email, password }).lean()
      : memDb.users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account blocked by Admin' });
    res.json({ user: { id: user.userId, name: user.name, email: user.email, role: user.role, wallet: user.wallet, status: user.status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = useMongo ? await User.findOne({ email }) : memDb.users.find(u => u.email === email);
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const newUser = {
      userId: 'RT-' + Math.floor(1000 + Math.random() * 9000),
      name,
      email,
      password,
      role: 'retailer',
      wallet: 50,
      status: 'active'
    };
    const welcomeTxn = {
      txnId: 'TXN-' + Date.now(),
      userId: newUser.userId,
      type: 'CREDIT',
      amount: 50,
      desc: 'Welcome Joining Bonus',
      date: new Date().toLocaleString()
    };

    if (useMongo) {
      await User.create(newUser);
      await Transaction.create(welcomeTxn);
    } else {
      memDb.users.push(newUser);
      memDb.transactions.unshift(welcomeTxn);
    }
    res.json({ user: { id: newUser.userId, name: newUser.name, email: newUser.email, role: newUser.role, wallet: newUser.wallet, status: newUser.status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/data/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = useMongo ? await User.findOne({ userId }).lean() : memDb.users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const services = useMongo ? await Service.find().lean() : memDb.services;
    const transactions = useMongo
      ? (user.role === 'admin' ? await Transaction.find().sort({ _id: -1 }).lean() : await Transaction.find({ userId }).sort({ _id: -1 }).lean())
      : (user.role === 'admin' ? memDb.transactions : memDb.transactions.filter(t => t.userId === userId));
    const allUsers = user.role === 'admin'
      ? (useMongo ? await User.find().lean() : memDb.users)
      : [];

    res.json({
      dbMode: useMongo ? 'MongoDB Persistent' : 'Memory Mode',
      user: { id: user.userId, name: user.name, email: user.email, role: user.role, wallet: user.wallet, status: user.status },
      services: services.map(s => ({ id: s.serviceId, name: s.name, desc: s.desc, price: s.price, active: s.active, icon: s.icon })),
      transactions: transactions.map(t => ({ id: t.txnId, userId: t.userId, type: t.type, amount: t.amount, desc: t.desc, date: t.date })),
      allUsers: allUsers.map(u => ({ id: u.userId, name: u.name, email: u.email, role: u.role, wallet: u.wallet, status: u.status }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 10) return res.status(400).json({ error: 'Minimum recharge is Rs 10' });

    if (!razorpay) {
      return res.json({ demoMode: true, amount: amt });
    }
    const order = await razorpay.orders.create({
      amount: Math.round(amt * 100),
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });
    res.json({ demoMode: false, keyId: process.env.RAZORPAY_KEY_ID, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const { userId, amount, demoMode, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const amt = parseFloat(amount);

    if (!demoMode && razorpay) {
      const sign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSign = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(sign).digest('hex');
      if (razorpay_signature !== expectedSign) {
        return res.status(400).json({ error: 'Payment signature verification failed' });
      }
    }

    const txn = {
      txnId: razorpay_payment_id || ('TXN-' + Math.floor(100000 + Math.random() * 900000)),
      userId,
      type: 'CREDIT',
      amount: amt,
      desc: demoMode ? 'Demo Wallet Top-up' : 'Razorpay UPI/Gateway Top-up',
      date: new Date().toLocaleString()
    };

    if (useMongo) {
      await User.updateOne({ userId }, { $inc: { wallet: amt } });
      await Transaction.create(txn);
    } else {
      const u = memDb.users.find(x => x.userId === userId);
      if (u) u.wallet += amt;
      memDb.transactions.unshift(txn);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/print/generate', upload.single('pdfFile'), async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const user = useMongo ? await User.findOne({ userId }).lean() : memDb.users.find(u => u.userId === userId);
    const service = useMongo ? await Service.findOne({ serviceId }).lean() : memDb.services.find(s => s.serviceId === serviceId);

    if (!user || !service) return res.status(404).json({ error: 'Invalid user or service' });
    if (user.wallet < service.price) return res.status(400).json({ error: 'Insufficient wallet balance! Please add money.' });
    if (!req.file) return res.status(400).json({ error: 'Please upload a valid PDF file.' });

    const srcPdf = await PDFDocument.load(req.file.buffer, { ignoreEncryption: true });
    const outPdf = await PDFDocument.create();
    const a4Page = outPdf.addPage([595.28, 841.89]);

    const pages = srcPdf.getPages();
    if (!pages || pages.length === 0) {
      return res.status(400).json({ error: 'Uploaded PDF has no readable pages.' });
    }
    const [embeddedPage] = await outPdf.embedPages([pages]);

    a4Page.drawPage(embeddedPage, { x: 45, y: 630, width: 242.6, height: 153 });
Use code with caution.
a4Page.drawPage(embeddedPage, { x: 305, y: 630, width: 242.6, height: 153 });
const txn = {
txnId: 'PRT-' + Math.floor(100000 + Math.random() * 900000),
userId: user.userId,
type: 'DEBIT',
amount: service.price,
desc: 'Printed: ' + service.name,
date: new Date().toLocaleString()
};
if (useMongo) {
await User.updateOne({ userId }, { $inc: { wallet: -service.price } });
await Transaction.create(txn);
} else {
const memUser = memDb.users.find(u => u.userId === userId);
if (memUser) memUser.wallet -= service.price;
memDb.transactions.unshift(txn);
}
const pdfBytes = await outPdf.save();
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', 'attachment; filename="' + service.serviceId + '_CR80_Print.pdf"');
res.send(Buffer.from(pdfBytes));
} catch (err) {
console.error('PDF Error:', err);
res.status(500).json({ error: 'Failed to process PDF: ' + err.message });
}
});
app.post('/api/admin/service', async (req, res) => {
try {
const { serviceId, price } = req.body;
const p = parseFloat(price);
if (useMongo) {
await Service.updateOne({ serviceId }, { $set: { price: p } });
} else {
const s = memDb.services.find(x => x.serviceId === serviceId);
if (s) s.price = p;
}
res.json({ success: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});
app.post('/api/admin/user-wallet', async (req, res) => {
try {
const { targetUserId, amount } = req.body;
const amt = parseFloat(amount);
if (useMongo) {
await User.updateOne({ userId: targetUserId }, { $inc: { wallet: amt } });
} else {
const u = memDb.users.find(x => x.userId === targetUserId);
if (u) u.wallet += amt;
}
res.json({ success: true });
} catch (err) {
res.status(500).json({ error: err.message });
}
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
console.log('CardPro Portal Live on port ' + PORT);
});

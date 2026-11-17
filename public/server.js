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
let UserModel, ServiceModel, TxnModel;

const userSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: 'retailer' },
  wallet: { type: Number, default: 50 },
  status: { type: String, default: 'active' }
});

const serviceSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  desc: String,
  price: Number,
  active: { type: Boolean, default: true },
  icon: String
});

const txnSchema = new mongoose.Schema({
  id: String,
  userId: String,
  type: String,
  amount: Number,
  desc: String,
  date: String
});

let memDb = {
  users: [
    { id: 'ADMIN-01', name: 'Super Admin', email: 'admin@cardpro.in', password: '123', role: 'admin', wallet: 0, status: 'active' },
    { id: 'RT-1001', name: 'Sharma Digital Seva', email: 'retailer@cardpro.in', password: '123', role: 'retailer', wallet: 250, status: 'active' }
  ],
  services: [
    { id: 'srv-1', name: 'Aadhaar PVC Card Layout', desc: 'Auto-crop PDF to CR80 front & back A4 sheet', price: 5, active: true, icon: 'fa-fingerprint' },
    { id: 'srv-2', name: 'e-PAN PVC Card Layout', desc: 'High-DPI CR80 print layout from e-PAN PDF', price: 5, active: true, icon: 'fa-address-card' },
    { id: 'srv-3', name: 'Ayushman / Health Card', desc: 'Instant print formatting for PMJAY & Health IDs', price: 4, active: true, icon: 'fa-heart-pulse' },
    { id: 'srv-4', name: 'e-Shram / UAN Card', desc: 'Format UAN PDF into standard PVC card size', price: 4, active: true, icon: 'fa-helmet-safety' },
    { id: 'srv-5', name: 'Voter ID (EPIC) Layout', desc: 'Digital e-EPIC PDF to sharp PVC print layout', price: 5, active: true, icon: 'fa-check-to-slot' },
    { id: 'srv-6', name: 'Custom School/Office ID', desc: 'Generate custom ID layout from uploaded PDF/Doc', price: 3, active: true, icon: 'fa-id-badge' }
  ],
  transactions: [
    { id: 'TXN-901', userId: 'RT-1001', type: 'CREDIT', amount: 250, desc: 'Initial Demo Wallet Credit', date: new Date().toLocaleString() }
  ]
};

async function initDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('Running in Memory Mode (Add MONGODB_URI in env for persistent cloud DB)');
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    UserModel = mongoose.model('User', userSchema);
    ServiceModel = mongoose.model('Service', serviceSchema);
    TxnModel = mongoose.model('Transaction', txnSchema);
    useMongo = true;
    console.log('Connected to MongoDB Atlas Persistent Database');

    if ((await UserModel.countDocuments()) === 0) await UserModel.insertMany(memDb.users);
    if ((await ServiceModel.countDocuments()) === 0) await ServiceModel.insertMany(memDb.services);
    if ((await TxnModel.countDocuments()) === 0) await TxnModel.insertMany(memDb.transactions);
  } catch (err) {
    console.error('MongoDB Connection Failed, falling back to Memory Mode:', err.message);
  }
}

async function getUserByEmail(email) {
  return useMongo ? await UserModel.findOne({ email }).lean() : memDb.users.find(u => u.email === email);
}
async function getUserById(id) {
  return useMongo ? await UserModel.findOne({ id }).lean() : memDb.users.find(u => u.id === id);
}
async function createUser(u) {
  if (useMongo) { await UserModel.create(u); return u; }
  memDb.users.push(u); return u;
}
async function updateUserWallet(id, delta, status) {
  if (useMongo) {
    const update = {};
    if (delta) update.$inc = { wallet: delta };
    if (status) update.$set = { status };
    const doc = await UserModel.findOneAndUpdate({ id }, update, { new: true }).lean();
    return doc;
  }
  const u = memDb.users.find(x => x.id === id);
  if (u) {
    if (delta) u.wallet += delta;
    if (status) u.status = status;
  }
  return u;
}
async function getAllUsers() {
  return useMongo ? await UserModel.find().lean() : memDb.users;
}
async function getAllServices() {
  return useMongo ? await ServiceModel.find().lean() : memDb.services;
}
async function getServiceById(id) {
  return useMongo ? await ServiceModel.findOne({ id }).lean() : memDb.services.find(s => s.id === id);
}
async function updateService(id, price, active) {
  if (useMongo) {
    const set = {};
    if (price !== undefined) set.price = parseFloat(price);
    if (active !== undefined) set.active = active;
    await ServiceModel.updateOne({ id }, { $set: set });
    return await getAllServices();
  }
  const s = memDb.services.find(x => x.id === id);
  if (s) {
    if (price !== undefined) s.price = parseFloat(price);
    if (active !== undefined) s.active = active;
  }
  return memDb.services;
}
async function addTransaction(txn) {
  if (useMongo) { await TxnModel.create(txn); return; }
  memDb.transactions.unshift(txn);
}
async function getTransactions(user) {
  if (useMongo) {
    const query = user.role === 'admin' ? {} : { userId: user.id };
    return await TxnModel.find(query).sort({ _id: -1 }).limit(100).lean();
  }
  return user.role === 'admin' ? memDb.transactions : memDb.transactions.filter(t => t.userId === user.id);
}

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET })
  : null;

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid email or password' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Account blocked by Admin' });
  res.json({ user });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  const cleanEmail = email.trim().toLowerCase();
  if (await getUserByEmail(cleanEmail)) return res.status(400).json({ error: 'This email is already registered. Please Login instead.' });
  const newUser = {
    id: 'RT-' + Math.floor(1000 + Math.random() * 9000),
    name: name.trim(),
    email: cleanEmail,
    password,
    role: 'retailer',
    wallet: 50,
    status: 'active'
  };
  await createUser(newUser);
  await addTransaction({ id: 'TXN-' + Date.now(), userId: newUser.id, type: 'CREDIT', amount: 50, desc: 'Welcome Joining Bonus', date: new Date().toLocaleString() });
  res.json({ user: newUser });
});

app.get('/api/data/:userId', async (req, res) => {
  const user = await getUserById(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    user,
    services: await getAllServices(),
    transactions: await getTransactions(user),
    allUsers: user.role === 'admin' ? await getAllUsers() : [],
    dbMode: useMongo ? 'MongoDB Persistent' : 'Memory Mode'
  });
});

app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const amt = parseFloat(amount);
    const user = await getUserById(userId);
    if (!user || isNaN(amt) || amt < 10) return res.status(400).json({ error: 'Minimum recharge is ₹10' });

    if (!razorpay) {
      return res.json({ demoMode: true, amount: amt, user });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(amt * 100),
      currency: 'INR',
      receipt: 'rcpt_' + Date.now()
    });
    res.json({ demoMode: false, orderId: order.id, amount: order.amount, keyId: RAZORPAY_KEY_ID, user });
  } catch (err) {
    res.status(500).json({ error: 'Order creation failed: ' + err.message });
  }
});

app.post('/api/payment/verify', async (req, res) => {
  try {
    const { userId, amount, demoMode, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!demoMode) {
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body).digest('hex');
      if (expectedSignature !== razorpay_signature) return res.status(400).json({ error: 'Invalid payment signature!' });
    }

    const amt = parseFloat(amount);
    const updatedUser = await updateUserWallet(user.id, amt);
    await addTransaction({
      id: razorpay_payment_id || ('TXN-' + Math.floor(100000 + Math.random() * 900000)),
      userId: user.id,
      type: 'CREDIT',
      amount: amt,
      desc: demoMode ? 'Wallet Top-up (Demo Mode)' : 'Wallet Top-up via Razorpay',
      date: new Date().toLocaleString()
    });
    res.json({ success: true, wallet: updatedUser.wallet });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed: ' + err.message });
  }
});

app.post('/api/print/generate', upload.single('pdfFile'), async (req, res) => {
  try {
    const { userId, serviceId } = req.body;
    const user = await getUserById(userId);
    const service = await getServiceById(serviceId);

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

    const [embeddedPage] = await outPdf.embedPages([pages[0]]);

    // Place CR80 Front & Back Card (85.6mm x 54mm = 242.6pt x 153pt) on A4 top
    a4Page.drawPage(embeddedPage, { x: 45, y: 630, width: 242.6, height: 153 });
    a4Page.drawPage(embeddedPage, { x: 305, y: 630, width: 242.6, height: 153 });

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
    console.error('PDF Processing Error:', err);
    res.status(500).json({ error: 'PDF could not be processed: ' + err.message });
  }
});

app.post('/api/admin/service', async (req, res) => {
  const { serviceId, price, active } = req.body;
  const services = await updateService(serviceId, price, active);
  res.json({ success: true, services });
});

app.post('/api/admin/user-wallet', async (req, res) => {
  const { targetUserId, amount, status } = req.body;
  await updateUserWallet(targetUserId, amount ? parseFloat(amount) : 0, status);
  if (amount) {
    await addTransaction({
      id: 'ADM-' + Math.floor(100000 + Math.random() * 900000),
      userId: targetUserId,
      type: 'CREDIT',
      amount: parseFloat(amount),
      desc: 'Added by Super Admin',
      date: new Date().toLocaleString()
    });
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 5000;
initDatabase().then(() => {
  app.listen(PORT, () => console.log(`CardPro Portal v4.0 Live at http://localhost:${PORT}`));
});

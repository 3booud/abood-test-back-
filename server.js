// Drop4Life Central Blood Bank — Express server
const express = require('express');
const cors = require('cors');
const path = require('path');
const { run, get, all, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Helper: convert thrown errors to 500s
const wrap = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
};

async function logActivity(type, title, detail, icon) {
  await run('INSERT INTO activity (type, title, detail, icon) VALUES (?, ?, ?, ?)', [type, title, detail, icon]);
}

// ============================================
// STATS
// ============================================
app.get('/api/stats', wrap(async (req, res) => {
  const totalUnits    = (await get("SELECT COUNT(*) as n FROM inventory WHERE status != 'used'")).n;
  const activeDonors  = (await get("SELECT COUNT(*) as n FROM donors WHERE status = 'eligible'")).n;
  const pendingReqs   = (await get("SELECT COUNT(*) as n FROM requests WHERE status IN ('new','processing')")).n;
  const distributions = (await get("SELECT COUNT(*) as n FROM requests WHERE status = 'completed'")).n;
  res.json({ totalUnits, activeDonors, pendingRequests: pendingReqs, distributions });
}));

// ============================================
// DONORS
// ============================================
app.get('/api/donors', wrap(async (req, res) => {
  const rows = await all('SELECT * FROM donors ORDER BY id DESC');
  res.json(rows.map(r => ({
    id: r.code, name: r.name, bloodType: r.bloodType || '—',
    age: r.age || '—', phone: r.phone || '—', lastDonation: r.lastDonation || '—',
    donationsCount: r.donationsCount || 0, status: r.status,
  })));
}));

app.post('/api/donors', wrap(async (req, res) => {
  const { name, phone, bloodType, age, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const code = 'D-' + String(Date.now()).slice(-5);
  await run(
    'INSERT INTO donors (code, name, bloodType, age, phone, email, status, lastDonation, donationsCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [code, name, bloodType || null, age || null, phone || null, email || null, 'pending', new Date().toISOString().slice(0, 10), 0]
  );
  await logActivity('donor', 'New Donor Registered', name, 'user-plus');
  res.json({ ok: true, code });
}));

app.delete('/api/donors/:code', wrap(async (req, res) => {
  await run('DELETE FROM donors WHERE code = ?', [req.params.code]);
  res.json({ ok: true });
}));

// ============================================
// INVENTORY
// ============================================
app.get('/api/inventory', wrap(async (req, res) => {
  const rows = await all('SELECT * FROM inventory ORDER BY id DESC');
  res.json(rows.map(r => ({
    id: r.code, bloodType: r.bloodType, type: r.type,
    donationDate: r.donationDate, expiryDate: r.expiryDate,
    donor: r.donor, storage: r.storage, status: r.status,
  })));
}));

app.post('/api/inventory', wrap(async (req, res) => {
  const { bloodType, type, donationDate, expiryDate, donor, storage } = req.body || {};
  if (!bloodType) return res.status(400).json({ error: 'bloodType required' });
  const code = 'U-' + String(Date.now()).slice(-5);
  await run(
    'INSERT INTO inventory (code, bloodType, type, donationDate, expiryDate, donor, storage, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [code, bloodType, type || 'whole', donationDate || null, expiryDate || null, donor || null, storage || 'Fridge A1', 'valid']
  );
  await logActivity('inventory', 'Stock Added', `${bloodType} added to inventory`, 'vial');
  res.json({ ok: true, code });
}));

// ============================================
// REQUESTS
// ============================================
app.get('/api/requests', wrap(async (req, res) => {
  const rows = await all('SELECT * FROM requests ORDER BY id DESC');
  res.json(rows.map(r => ({
    id: r.code, hospital: r.hospital, doctor: r.doctor || '',
    bloodType: r.bloodType, quantity: r.quantity, priority: r.priority,
    status: r.status, date: (r.date || '').slice(0, 10), notes: r.notes || ''
  })));
}));

app.post('/api/requests', wrap(async (req, res) => {
  const { hospital, doctor, bloodType, quantity, priority, notes } = req.body || {};
  if (!hospital || !bloodType) return res.status(400).json({ error: 'hospital and bloodType required' });
  const code = 'REQ-' + String(Date.now()).slice(-5);
  await run(
    'INSERT INTO requests (code, hospital, doctor, bloodType, quantity, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [code, hospital, doctor || '', bloodType, parseInt(quantity) || 1, priority || 'normal', 'new', notes || '']
  );
  await logActivity('request', 'New Blood Request', `${hospital} · ${bloodType} × ${quantity}`, 'hospital');
  res.json({ ok: true, code });
}));

app.put('/api/requests/:code/approve', wrap(async (req, res) => {
  const r = await run('UPDATE requests SET status = ? WHERE code = ?', ['processing', req.params.code]);
  if (r.changes === 0) return res.status(404).json({ error: 'not found' });
  await logActivity('request', 'Request Approved', `${req.params.code} approved`, 'check');
  res.json({ ok: true });
}));

app.put('/api/requests/:code/reject', wrap(async (req, res) => {
  await run('UPDATE requests SET status = ? WHERE code = ?', ['rejected', req.params.code]);
  await logActivity('request', 'Request Rejected', req.params.code, 'times');
  res.json({ ok: true });
}));

app.put('/api/requests/:code/ship', wrap(async (req, res) => {
  await run('UPDATE requests SET status = ? WHERE code = ?', ['completed', req.params.code]);
  await logActivity('delivery', 'Shipment Dispatched', req.params.code, 'truck');
  res.json({ ok: true });
}));

// ============================================
// ACTIVITY
// ============================================
app.get('/api/activity', wrap(async (req, res) => {
  const rows = await all('SELECT * FROM activity ORDER BY id DESC LIMIT 50');
  res.json(rows);
}));

// ============================================
// AI INSIGHTS
// ============================================
app.get('/api/insights', wrap(async (req, res) => {
  const lowStock = await all(`
    SELECT bloodType, COUNT(*) as units
    FROM inventory WHERE status='valid'
    GROUP BY bloodType HAVING units < 5
  `);
  const expiringSoon = (await get(`
    SELECT COUNT(*) as n FROM inventory
    WHERE status='valid' AND expiryDate IS NOT NULL
      AND date(expiryDate) <= date('now', '+7 days')
  `)).n;
  const urgentReqs = (await get("SELECT COUNT(*) as n FROM requests WHERE priority IN ('urgent','critical') AND status='new'")).n;
  const eligibleDonors = (await get("SELECT COUNT(*) as n FROM donors WHERE status='eligible'")).n;

  const insights = [];
  lowStock.forEach(t => insights.push({
    level: 'critical', icon: 'exclamation-triangle',
    title: `Critical: ${t.bloodType}`,
    detail: `Only ${t.units} units left — launch a donation drive.`
  }));
  if (expiringSoon > 0) insights.push({
    level: 'warning', icon: 'clock', title: 'Expiring soon',
    detail: `${expiringSoon} units will expire within 7 days — prioritize them.`
  });
  if (urgentReqs > 0) insights.push({
    level: 'info', icon: 'hospital', title: 'Pending urgent requests',
    detail: `${urgentReqs} urgent hospital requests awaiting approval.`
  });
  insights.push({
    level: 'success', icon: 'users', title: 'Donor pool',
    detail: `${eligibleDonors} eligible donors ready to be contacted.`
  });
  res.json({ insights, lowStock, expiringSoon, urgentReqs, eligibleDonors });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Boot
(async () => {
  try {
    await init();
    app.listen(PORT, () => {
      console.log(`Drop4Life backend running on http://localhost:${PORT}`);
      console.log(`Open the app at: http://localhost:${PORT}/index.html`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
})();

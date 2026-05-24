// Drop4Life Database Layer
// Uses sqlite3 (prebuilt binaries on Windows — no compilation needed)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'drop4life.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}

async function init() {
  await run(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      bloodType TEXT,
      age INTEGER,
      phone TEXT,
      email TEXT,
      address TEXT,
      lastDonation TEXT,
      donationsCount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      bloodType TEXT NOT NULL,
      type TEXT DEFAULT 'whole',
      donationDate TEXT,
      expiryDate TEXT,
      donor TEXT,
      storage TEXT,
      status TEXT DEFAULT 'valid'
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      hospital TEXT NOT NULL,
      doctor TEXT,
      bloodType TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'new',
      date TEXT DEFAULT (datetime('now')),
      notes TEXT
    )
  `);
  await run(`
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      title TEXT,
      detail TEXT,
      icon TEXT DEFAULT 'info',
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);

  const row = await get('SELECT COUNT(*) as n FROM donors');
  if (row.n === 0) await seed();
}

async function seed() {
  const donors = [
    ['D-00124', 'Ahmed Mahmoud Ali',    'O+',  34, '0501234567', '2026-05-22', 12, 'eligible'],
    ['D-00089', 'Sara Fahmy Hassan',    'A-',  28, '0559876543', '2026-04-10', 7,  'eligible'],
    ['D-00245', 'Mohamed Abdelrahman',  'AB+', 42, '0533445566', '2026-03-15', 4,  'waiting'],
    ['D-00312', 'Nour Aldin Hamza',     'B-',  31, '0577889900', '2026-01-22', 2,  'suspended'],
    ['D-00401', 'Reem Tarek Yousef',    'O-',  25, '0511223344', '2026-05-10', 9,  'eligible'],
    ['D-00422', 'Khaled Sami Ibrahim',  'A+',  37, '0509988776', '2026-04-30', 6,  'eligible'],
    ['D-00455', 'Layla Saad Omar',      'B+',  29, '0566554433', '2026-05-18', 11, 'eligible'],
    ['D-00488', 'Yassin Rami Adel',     'O+',  26, '0512345678', '2026-05-20', 3,  'eligible'],
  ];
  const inv = [
    ['U-8841', 'O+',  'whole',     '2026-05-23', '2026-07-04', 'Ahmed Mahmoud',  'Fridge A1', 'valid'],
    ['U-8840', 'A+',  'plasma',    '2026-05-22', '2027-05-22', 'Sara Fahmy',     'Fridge A2', 'valid'],
    ['U-8839', 'B+',  'whole',     '2026-05-22', '2026-07-03', 'Mohamed A.',     'Fridge B1', 'valid'],
    ['U-8838', 'O-',  'whole',     '2026-05-21', '2026-07-02', 'Reem Tarek',     'Fridge B2', 'valid'],
    ['U-8837', 'AB+', 'platelets', '2026-05-21', '2026-05-26', 'Khaled S.',      'Fridge C1', 'expiring'],
    ['U-8836', 'A-',  'whole',     '2026-05-20', '2026-07-01', 'Layla Saad',     'Fridge A1', 'valid'],
    ['U-8835', 'O+',  'red',       '2026-05-19', '2026-06-30', 'Yassin R.',      'Fridge A2', 'valid'],
  ];
  const reqs = [
    ['REQ-2851', 'El-Sharq Hospital',  'Dr. Mohamed Farouk', 'AB-', 4,  'critical', 'new',        'Critical surgery'],
    ['REQ-2850', 'Heart Center',       'Dr. Layla Saad',     'O-',  8,  'urgent',   'new',        'Heart transplant'],
    ['REQ-2849', 'Children Hospital',  'Dr. Osama Hassan',   'A-',  2,  'urgent',   'processing', 'Pediatric case'],
    ['REQ-2848', 'Specialty Hospital', 'Dr. Nagwa Ali',      'B+',  10, 'normal',   'completed',  'Scheduled surgery'],
    ['REQ-2847', 'Cairo International','Dr. Rami Khaled',    'A+',  5,  'normal',   'completed',  'Routine reserve'],
  ];
  const acts = [
    ['donation',  'New Donation',      'Ahmed Mahmoud · O+ · Whole unit · Main Center', 'tint'],
    ['delivery',  'Hospital Delivery', '10 units A+ to Specialty Hospital · #REQ-2847', 'hospital'],
    ['alert',     'Expiry Warning',    '14 units B+ will expire within 3 days',         'exclamation'],
    ['screening', 'Screening Results', '8 samples processed · 7 valid, 1 rejected',     'flask'],
    ['request',   'Request Completed', 'AB+ × 5 units delivered to Cairo Int.',         'check'],
  ];

  for (const d of donors) {
    await run(
      'INSERT INTO donors (code, name, bloodType, age, phone, lastDonation, donationsCount, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      d
    );
  }
  for (const i of inv) {
    await run(
      'INSERT INTO inventory (code, bloodType, type, donationDate, expiryDate, donor, storage, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      i
    );
  }
  for (const r of reqs) {
    await run(
      'INSERT INTO requests (code, hospital, doctor, bloodType, quantity, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      r
    );
  }
  for (const a of acts) {
    await run('INSERT INTO activity (type, title, detail, icon) VALUES (?, ?, ?, ?)', a);
  }
  console.log('Seeded:', donors.length, 'donors,', inv.length, 'inventory,', reqs.length, 'requests');
}

module.exports = { db, run, get, all, init };

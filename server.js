const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'tsuri-press-2026', resave: false, saveUninitialized: false }));

const uploadsDir = process.env.NODE_ENV === 'production' ? path.join(__dirname, 'data', 'uploads') : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use('/uploads', express.static('uploads'));
app.use(express.static('.'));

let db;
const dataDir = process.env.NODE_ENV === 'production' ? path.join(__dirname, 'data') : __dirname;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const DB_PATH = path.join(dataDir, 'data.db');

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    const ghDb = await loadDBFromGitHub(SQL);
    if (ghDb) {
      db = ghDb;
    } else {
      db = new SQL.Database();
    }
  }

  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'bass',
    thumbnail TEXT DEFAULT '',
    excerpt TEXT DEFAULT '',
    body TEXT DEFAULT '',
    author TEXT DEFAULT 'TSURI PRESS編集部',
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);

  const existing = db.exec("SELECT COUNT(*) FROM users");
  if (existing[0].values[0][0] === 0) {
    db.run("INSERT INTO users (username, password) VALUES ('admin', 'admin')");
  }
  saveDB();
}

function saveDB(syncToGitHub = false) {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  if (syncToGitHub && GITHUB_TOKEN) saveDBToGitHub(data);
}

async function saveDBToGitHub(data) {
  try {
    const ghPath = 'data/data.db';
    let sha = '';
    const existing = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ghPath}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'tsuri-press-cms' }
    });
    if (existing.ok) { const j = await existing.json(); sha = j.sha || ''; }
    await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ghPath}`, {
      method: 'PUT',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'tsuri-press-cms' },
      body: JSON.stringify({ message: 'CMS: auto-save DB', content: Buffer.from(data).toString('base64'), sha })
    });
  } catch (e) { console.error('DB GitHub save failed:', e.message); }
}

async function loadDBFromGitHub(SQL) {
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/data/data.db`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3.raw', 'User-Agent': 'tsuri-press-cms' }
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    console.log('Loaded DB from GitHub (' + buf.length + ' bytes)');
    return new SQL.Database(buf);
  } catch (e) { console.error('DB GitHub load failed:', e.message); return null; }
}

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/admin/login');
}

// Auth
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'admin/login.html')));

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const result = db.exec("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
  if (result.length && result[0].values.length) {
    req.session.user = username;
    res.redirect('/admin');
  } else {
    res.redirect('/admin/login?error=1');
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// Admin pages
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));
app.get('/admin/new', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin/edit.html')));
app.get('/admin/edit/:id', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'admin/edit.html')));

// API: List articles
app.get('/api/articles', (req, res) => {
  const rows = db.exec("SELECT id, title, slug, category, thumbnail, excerpt, author, status, created_at, updated_at FROM articles ORDER BY created_at DESC");
  if (!rows.length) return res.json([]);
  const cols = rows[0].columns;
  res.json(rows[0].values.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]]))));
});

// API: Get article
app.get('/api/articles/:id', (req, res) => {
  const rows = db.exec("SELECT * FROM articles WHERE id = ?", [req.params.id]);
  if (!rows.length || !rows[0].values.length) return res.status(404).json({ error: 'not found' });
  const cols = rows[0].columns;
  res.json(Object.fromEntries(cols.map((c, i) => [c, rows[0].values[0][i]])));
});

// API: Create article
app.post('/api/articles', requireAuth, (req, res) => {
  const { title, slug, category, thumbnail, excerpt, body, author, status } = req.body;
  const s = slug || title.replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9　-鿿-]/g, '');
  try {
    db.run("INSERT INTO articles (title, slug, category, thumbnail, excerpt, body, author, status) VALUES (?,?,?,?,?,?,?,?)",
      [title, s, category || 'bass', thumbnail || '', excerpt || '', body || '', author || 'TSURI PRESS編集部', status || 'draft']);
    saveDB(true);
    const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    res.json({ id, slug: s });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// API: Update article
app.put('/api/articles/:id', requireAuth, (req, res) => {
  const { title, slug, category, thumbnail, excerpt, body, author, status } = req.body;
  db.run("UPDATE articles SET title=?, slug=?, category=?, thumbnail=?, excerpt=?, body=?, author=?, status=?, updated_at=datetime('now','localtime') WHERE id=?",
    [title, slug, category, thumbnail, excerpt, body, author, status, req.params.id]);
  saveDB(true);
  res.json({ ok: true });
});

// API: Delete article
app.delete('/api/articles/:id', requireAuth, (req, res) => {
  db.run("DELETE FROM articles WHERE id = ?", [req.params.id]);
  saveDB(true);
  res.json({ ok: true });
});

// API: Upload image → GitHub repo
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = process.env.GITHUB_REPO || 'tratssai71-create/fishing-portal';

app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const filePath = req.file.path;
  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString('base64');
  const ghPath = 'uploads/' + req.file.filename;

  if (GITHUB_TOKEN) {
    try {
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${ghPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'tsuri-press-cms'
        },
        body: JSON.stringify({
          message: 'CMS: upload ' + req.file.filename,
          content: base64
        })
      });
      const data = await response.json();
      if (data.content && data.content.download_url) {
        fs.unlinkSync(filePath);
        res.json({ url: data.content.download_url });
        return;
      }
    } catch (e) {
      console.error('GitHub upload failed:', e.message);
    }
  }
  res.json({ url: '/uploads/' + req.file.filename });
});

// Public article page
app.get('/article/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'article-template.html'));
});

app.get('/api/article-by-slug/:slug', (req, res) => {
  const rows = db.exec("SELECT * FROM articles WHERE slug = ? AND status = 'published'", [req.params.slug]);
  if (!rows.length || !rows[0].values.length) return res.status(404).json({ error: 'not found' });
  const cols = rows[0].columns;
  res.json(Object.fromEntries(cols.map((c, i) => [c, rows[0].values[0][i]])));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`TSURI PRESS CMS running at http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
    console.log(`Login: admin / admin`);
  });
});

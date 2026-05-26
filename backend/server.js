require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const path = require('path');
const { Pool } = require('pg');
const dns = require('dns').promises;
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// -------------------- POSTGRESQL CONNECTION (IPv4 + SSL FIX) --------------------
let pool;

async function initDatabaseConnection() {
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL environment variable is missing');
        process.exit(1);
    }

    // Remove any existing query parameters (to avoid sslmode conflict)
    dbUrl = dbUrl.split('?')[0];

    // Resolve hostname to IPv4
    try {
        const urlObj = new URL(dbUrl);
        const originalHost = urlObj.hostname;
        console.log(`🔍 Resolving ${originalHost} to IPv4...`);
        const addresses = await dns.lookup(originalHost, { family: 4 });
        const ipv4 = addresses.address;
        console.log(`✅ Resolved ${originalHost} -> ${ipv4}`);
        dbUrl = dbUrl.replace(originalHost, ipv4);
    } catch (err) {
        console.error('⚠️ IPv4 resolution failed, using original hostname:', err.message);
    }

    // 🔥 FIX: Force SSL with certificate validation disabled
    pool = new Pool({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    // Test connection
    try {
        const client = await pool.connect();
        client.release();
        console.log('✅ PostgreSQL connection successful');
    } catch (err) {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1);
    }
}

// Helper query function (waits for pool to be ready)
async function query(text, params) {
    while (!pool) await new Promise(resolve => setTimeout(resolve, 100));
    return pool.query(text, params);
}

// -------------------- CREATE TABLES (if missing) --------------------
async function initDatabase() {
    while (!pool) await new Promise(resolve => setTimeout(resolve, 100));
    const client = await pool.connect();
    try {
        await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            access_code TEXT,
            fingerprint TEXT,
            approved BOOLEAN DEFAULT TRUE,
            banned BOOLEAN DEFAULT FALSE,
            role TEXT DEFAULT 'user',
            tools JSONB DEFAULT '[]',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS access_codes (
            code TEXT PRIMARY KEY,
            is_active BOOLEAN DEFAULT TRUE,
            used_by UUID REFERENCES users(id),
            used_at TIMESTAMPTZ,
            requested_by TEXT
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS tools (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            price_usd NUMERIC,
            category TEXT,
            download_url TEXT,
            payment_link TEXT,
            image_urls JSONB DEFAULT '[]',
            video_url TEXT,
            discount_percent INT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id),
            tool_id UUID REFERENCES tools(id),
            amount_usd NUMERIC,
            amount_btc TEXT,
            screenshot_base64 TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS visitors (
            id SERIAL PRIMARY KEY,
            ip TEXT,
            location TEXT,
            vpn BOOLEAN,
            page TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS websites (
            id UUID PRIMARY KEY,
            domain TEXT NOT NULL,
            title TEXT,
            price NUMERIC,
            category TEXT,
            image TEXT,
            details TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS esim (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            duration TEXT,
            price NUMERIC,
            data TEXT,
            voice TEXT,
            carrier TEXT,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS logistics (
            id UUID PRIMARY KEY,
            sender TEXT,
            receiver TEXT,
            address TEXT,
            package TEXT,
            weight NUMERIC,
            price NUMERIC,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS virtualnums (
            id UUID PRIMARY KEY,
            number TEXT NOT NULL,
            country TEXT,
            service TEXT,
            price NUMERIC,
            partner TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS webrequests (
            id UUID PRIMARY KEY,
            client TEXT,
            email TEXT,
            type TEXT,
            requirements TEXT,
            budget NUMERIC,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS credforms (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            fields TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS cloudreqs (
            id UUID PRIMARY KEY,
            customer TEXT,
            email TEXT,
            service_type TEXT,
            domain TEXT,
            details TEXT,
            sent_to_telegram BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        await client.query(`CREATE TABLE IF NOT EXISTS blog (
            id UUID PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT,
            category TEXT DEFAULT 'general',
            author TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        console.log('✅ All database tables ready.');
    } finally {
        client.release();
    }
}

// -------------------- TELEGRAM (optional) --------------------
async function sendTelegram(msg) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (!botToken || !chatId) return;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, { chat_id: chatId, text: msg });
    } catch (e) {}
}

// -------------------- MIDDLEWARE --------------------
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        const user = result.rows[0];
        if (!user || user.banned) return res.status(403).json({ error: 'Account banned' });
        req.user = user;
        next();
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

const adminAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        const user = result.rows[0];
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        req.user = user;
        next();
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// -------------------- PUBLIC ROUTES --------------------
app.get('/api/tools', async (req, res) => {
    const result = await query('SELECT * FROM tools ORDER BY created_at DESC');
    res.json(result.rows);
});

app.get('/api/esim', auth, async (req, res) => {
    const result = await query('SELECT * FROM esim ORDER BY created_at DESC');
    res.json(result.rows);
});
app.get('/api/virtualnums', auth, async (req, res) => {
    const result = await query('SELECT * FROM virtualnums ORDER BY created_at DESC');
    res.json(result.rows);
});
app.get('/api/logistics', auth, async (req, res) => {
    const result = await query('SELECT * FROM logistics ORDER BY created_at DESC');
    res.json(result.rows);
});
app.get('/api/blog', auth, async (req, res) => {
    const result = await query('SELECT * FROM blog ORDER BY created_at DESC');
    res.json(result.rows);
});

// -------------------- AUTH --------------------
app.post('/api/signup', async (req, res) => {
    const { username, email, password, fingerprint } = req.body;
    if (!username || !email || !password || !fingerprint)
        return res.status(400).json({ error: 'All fields required' });
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await query(`INSERT INTO users (id, username, email, password, access_code, fingerprint, role, tools)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, username, email, hashed, 'FREE-ENTRY', fingerprint, 'user', '[]']);
    const token = jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username, email } });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username: user.username, email: user.email, approved: user.approved, accessCode: user.access_code, role: user.role } });
});

app.get('/api/verify', auth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email, approved: req.user.approved, accessCode: req.user.access_code, role: req.user.role } });
});

app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message, type } = req.body;
    if (!email || !message) return res.status(400).json({ error: 'Email and message required' });
    const telegramMsg = `📩 NEW CONTACT\nFrom: ${name || 'Unknown'} (${email})\nSubject: ${subject || 'N/A'}\nType: ${type || 'General'}\nMessage: ${message}`;
    await sendTelegram(telegramMsg);
    res.json({ success: true, message: 'Your message has been sent to the GHOST SHELL command.' });
});

// -------------------- PAYMENTS --------------------
app.post('/api/payment', auth, async (req, res) => {
    const { toolId, amountUSD, amountBTC, screenshotBase64 } = req.body;
    const id = uuidv4();
    await query(`INSERT INTO payments (id, user_id, tool_id, amount_usd, amount_btc, screenshot_base64, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id, req.user.id, toolId, amountUSD, amountBTC, screenshotBase64, 'pending']);
    res.json({ success: true });
});

app.get('/api/my-tools', auth, async (req, res) => {
    const userTools = req.user.tools || [];
    const purchases = [];
    for (const pt of userTools) {
        const toolRes = await query('SELECT * FROM tools WHERE id = $1', [pt.toolId]);
        purchases.push({ ...pt, toolId: toolRes.rows[0] || null });
    }
    res.json(purchases);
});

// ==================== ADMIN CRUD ====================
function createAdminCrud(tableName) {
    app.get(`/api/admin/${tableName}`, adminAuth, async (req, res) => {
        const result = await query(`SELECT * FROM ${tableName} ORDER BY created_at DESC`);
        res.json(result.rows);
    });
    app.post(`/api/admin/${tableName}`, adminAuth, async (req, res) => {
        const columns = Object.keys(req.body);
        const values = Object.values(req.body);
        const placeholders = values.map((_, i) => `$${i + 2}`).join(',');
        const id = uuidv4();
        const insert = `INSERT INTO ${tableName} (id, ${columns.join(',')}) VALUES ($1, ${placeholders}) RETURNING *`;
        const result = await query(insert, [id, ...values]);
        res.json(result.rows[0]);
    });
    app.put(`/api/admin/${tableName}/:id`, adminAuth, async (req, res) => {
        const id = req.params.id;
        const updates = Object.keys(req.body);
        const setClause = updates.map((col, i) => `${col} = $${i + 2}`).join(',');
        const values = Object.values(req.body);
        const update = `UPDATE ${tableName} SET ${setClause} WHERE id = $1 RETURNING *`;
        const result = await query(update, [id, ...values]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    });
    app.delete(`/api/admin/${tableName}/:id`, adminAuth, async (req, res) => {
        await query(`DELETE FROM ${tableName} WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    });
}

createAdminCrud('websites');
createAdminCrud('esim');
createAdminCrud('logistics');
createAdminCrud('virtualnums');
createAdminCrud('webrequests');
createAdminCrud('credforms');
createAdminCrud('cloudreqs');

// Blog special
app.get('/api/blog/:id', auth, async (req, res) => {
    const result = await query('SELECT * FROM blog WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
});
app.post('/api/admin/blog', adminAuth, async (req, res) => {
    const { title, content, category, author } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const id = uuidv4();
    await query(`INSERT INTO blog (id, title, content, category, author) VALUES ($1, $2, $3, $4, $5)`,
        [id, title, content, category || 'general', author || 'Admin']);
    res.json({ id, title, content, category, author });
});
app.put('/api/admin/blog/:id', adminAuth, async (req, res) => {
    const { title, content, category, author } = req.body;
    await query(`UPDATE blog SET title = $1, content = $2, category = $3, author = $4 WHERE id = $5`,
        [title, content, category, author, req.params.id]);
    res.json({ success: true });
});
app.delete('/api/admin/blog/:id', adminAuth, async (req, res) => {
    await query('DELETE FROM blog WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

// Admin users, codes, payments, tools (keep minimal but working)
app.get('/api/admin/users', adminAuth, async (req, res) => {
    const result = await query('SELECT id, username, email, access_code, approved, banned, role, created_at FROM users');
    res.json(result.rows);
});
app.post('/api/admin/add-admin', adminAuth, async (req, res) => {
    const { email, password, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    const existing = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
        await query('UPDATE users SET role = $1 WHERE email = $2', [role || 'admin', email]);
        res.json({ message: 'User promoted to admin' });
    } else {
        if (!password) return res.status(400).json({ error: 'Password required' });
        const hashed = await bcrypt.hash(password, 10);
        const id = uuidv4();
        await query(`INSERT INTO users (id, username, email, password, access_code, role)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, email.split('@')[0], email, hashed, 'ADMIN-' + Math.random().toString(36).substring(2,10).toUpperCase(), 'admin']);
        res.json({ message: 'New admin created' });
    }
});
app.post('/api/admin/ban/:id', adminAuth, async (req, res) => {
    await query('UPDATE users SET banned = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});
app.post('/api/admin/unban/:id', adminAuth, async (req, res) => {
    await query('UPDATE users SET banned = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});
app.delete('/api/admin/delete/:id', adminAuth, async (req, res) => {
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});
app.post('/api/admin/generate-codes', adminAuth, async (req, res) => {
    const count = req.body.count || 50;
    for (let i = 0; i < count; i++) {
        const code = 'GHOST-' + Math.random().toString(36).substring(2,10).toUpperCase();
        await query('INSERT INTO access_codes (code) VALUES ($1)', [code]);
    }
    res.json({ success: true });
});
app.get('/api/admin/codes', adminAuth, async (req, res) => {
    const result = await query(`SELECT c.code, c.is_active, c.used_at, u.email as used_by_email
        FROM access_codes c LEFT JOIN users u ON c.used_by = u.id`);
    res.json(result.rows);
});
app.post('/api/admin/revoke-code', adminAuth, async (req, res) => {
    await query('DELETE FROM access_codes WHERE code = $1', [req.body.codeId]);
    res.json({ success: true });
});
app.post('/api/admin/tool', adminAuth, async (req, res) => {
    const { name, description, priceUSD, category, downloadUrl, paymentLink, imageUrls, videoUrl } = req.body;
    const id = uuidv4();
    await query(`INSERT INTO tools (id, name, description, price_usd, category, download_url, payment_link, image_urls, video_url, discount_percent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, name, description, priceUSD, category, downloadUrl, paymentLink, JSON.stringify(imageUrls || []), videoUrl, req.body.discountPercent || 0]);
    res.json({ id, name });
});
app.put('/api/admin/tool/:id', adminAuth, async (req, res) => {
    const { name, description, priceUSD, category, downloadUrl, paymentLink, imageUrls, videoUrl, discountPercent } = req.body;
    await query(`UPDATE tools SET name=$1, description=$2, price_usd=$3, category=$4, download_url=$5, payment_link=$6, image_urls=$7, video_url=$8, discount_percent=$9 WHERE id=$10`,
        [name, description, priceUSD, category, downloadUrl, paymentLink, JSON.stringify(imageUrls || []), videoUrl, discountPercent || 0, req.params.id]);
    res.json({ success: true });
});
app.delete('/api/admin/tool/:id', adminAuth, async (req, res) => {
    await query('DELETE FROM tools WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});
app.get('/api/admin/payments', adminAuth, async (req, res) => {
    const result = await query(`SELECT p.*, u.email as user_email, t.name as tool_name
        FROM payments p LEFT JOIN users u ON p.user_id = u.id LEFT JOIN tools t ON p.tool_id = t.id WHERE p.status='pending'`);
    res.json(result.rows);
});
app.post('/api/admin/confirm-payment', adminAuth, async (req, res) => {
    const paymentId = req.body.paymentId;
    const payment = (await query('SELECT user_id, tool_id FROM payments WHERE id = $1', [paymentId])).rows[0];
    if (!payment) return res.status(404).json({ error: 'Not found' });
    await query('UPDATE payments SET status = $1 WHERE id = $2', ['confirmed', paymentId]);
    if (payment.tool_id) {
        const user = (await query('SELECT tools FROM users WHERE id = $1', [payment.user_id])).rows[0];
        let tools = user.tools || [];
        tools.push({ toolId: payment.tool_id, purchasedAt: new Date().toISOString() });
        await query('UPDATE users SET tools = $1 WHERE id = $2', [JSON.stringify(tools), payment.user_id]);
    }
    res.json({ success: true });
});
app.get('/api/admin/visitors', adminAuth, async (req, res) => {
    const result = await query('SELECT * FROM visitors ORDER BY timestamp DESC LIMIT 100');
    res.json(result.rows);
});

// -------------------- AI CHAT --------------------
app.post('/api/ai/chat', auth, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const reply = getLocalAIResponse(message);
    res.json({ reply });
});
function getLocalAIResponse(q) {
    const lq = q.toLowerCase();
    if (lq.includes('phish')) return 'Phishing detection: check for mismatched URLs, urgent language...';
    if (lq.includes('encrypt')) return 'AES‑256 is the gold standard for symmetric encryption...';
    if (lq.includes('hack')) return 'Ethical hacking (white‑hat) is done with permission to improve security.';
    if (lq.includes('password')) return 'Use a password manager and enable multi‑factor authentication (MFA).';
    if (lq.includes('malware')) return 'Malware includes viruses, worms, ransomware, and trojans.';
    if (lq.includes('network')) return 'Network security involves firewalls, IDS/IPS, and zero‑trust principles.';
    if (lq.includes('exploit')) return 'An exploit takes advantage of a vulnerability. Keep systems updated.';
    if (lq.includes('web') || lq.includes('xss') || lq.includes('sql')) return 'Web security: prevent SQL injection with prepared statements, XSS with output encoding.';
    return 'I am GHOST AI, your cybersecurity advisor. Ask me about phishing, encryption, network security, password policies, malware, exploits, web security, VPNs, DDoS, firewalls, and more.';
}

// -------------------- SOCKET.IO CHAT --------------------
io.on('connection', (socket) => {
    socket.on('chat message', (msg) => io.emit('chat message', { from: 'Anonymous', text: msg }));
});

// -------------------- SEED DEFAULT DATA --------------------
async function seedDatabase() {
    const toolsCount = await query('SELECT COUNT(*) FROM tools');
    if (parseInt(toolsCount.rows[0].count) === 0) {
        await query(`INSERT INTO tools (id, name, description, price_usd, category, download_url, discount_percent) VALUES
            ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
            [uuidv4(), 'NMAP Ghost Edition', 'Advanced stealth scanner', 49, 'Network', '#', 0,
             uuidv4(), 'Metasploit Pro Unlocked', 'Full exploit framework', 199, 'Exploit', '#', 0]);
        console.log('📦 Default tools seeded');
    }
    const esimCount = await query('SELECT COUNT(*) FROM esim');
    if (parseInt(esimCount.rows[0].count) === 0) {
        await query(`INSERT INTO esim (id, name, duration, price, data, voice, carrier) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [uuidv4(), '5GB 30 Days', '1 month', 19.99, '5GB', '100 mins', 'Global']);
        console.log('📱 Default eSIM plan seeded');
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
        const existing = await query('SELECT id FROM users WHERE email = $1 AND role = $2', [adminEmail, 'admin']);
        if (existing.rows.length === 0) {
            const hashed = await bcrypt.hash(adminPassword, 10);
            await query(`INSERT INTO users (id, username, email, password, access_code, role) VALUES ($1,$2,$3,$4,$5,$6)`,
                [uuidv4(), adminEmail.split('@')[0], adminEmail, hashed, 'ADMIN-MASTER', 'admin']);
            console.log('🔑 Master admin created from .env');
        }
    }
}

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 5000;

(async () => {
    await initDatabaseConnection();
    await initDatabase();
    await seedDatabase();
    http.listen(PORT, '0.0.0.0', () => console.log(`🚀 GHOST SHELL running on port ${PORT}`));
})().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});

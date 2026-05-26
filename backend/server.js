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

// -------------------- POSTGRESQL CONNECTION (IPv4 FIX) --------------------
let pool;

(async function initDatabaseConnection() {
    let dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL environment variable is missing');
        process.exit(1);
    }

    // Extract hostname and try to resolve IPv4
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

    // Ensure SSL is enabled
    if (!dbUrl.includes('sslmode=require')) {
        const sep = dbUrl.includes('?') ? '&' : '?';
        dbUrl += `${sep}sslmode=require`;
    }

    pool = new Pool({ connectionString: dbUrl });

    // Test connection
    try {
        const client = await pool.connect();
        client.release();
        console.log('✅ PostgreSQL connection successful');
    } catch (err) {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1);
    }
})();

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
        // Users table
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
        // Access codes
        await client.query(`CREATE TABLE IF NOT EXISTS access_codes (
            code TEXT PRIMARY KEY,
            is_active BOOLEAN DEFAULT TRUE,
            used_by UUID REFERENCES users(id),
            used_at TIMESTAMPTZ,
            requested_by TEXT
        );`);
        // Tools
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
        // Payments
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
        // Visitors
        await client.query(`CREATE TABLE IF NOT EXISTS visitors (
            id SERIAL PRIMARY KEY,
            ip TEXT,
            location TEXT,
            vpn BOOLEAN,
            page TEXT,
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );`);
        // Websites
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
        // eSIM
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
        // Logistics
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
        // Virtual numbers
        await client.query(`CREATE TABLE IF NOT EXISTS virtualnums (
            id UUID PRIMARY KEY,
            number TEXT NOT NULL,
            country TEXT,
            service TEXT,
            price NUMERIC,
            partner TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        // Web requests
        await client.query(`CREATE TABLE IF NOT EXISTS webrequests (
            id UUID PRIMARY KEY,
            client TEXT,
            email TEXT,
            type TEXT,
            requirements TEXT,
            budget NUMERIC,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        // Cred forms
        await client.query(`CREATE TABLE IF NOT EXISTS credforms (
            id UUID PRIMARY KEY,
            name TEXT NOT NULL,
            fields TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`);
        // Cloud requests
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
        // Blog
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

// ==================== ADMIN CRUD (abbreviated – keep your full implementation) ====================
// ... (the rest of your admin endpoints – I won't repeat them for brevity, but they stay as before)

// -------------------- SEED DEFAULT DATA --------------------
async function seedDatabase() {
    const toolsCount = await query('SELECT COUNT(*) FROM tools');
    if (parseInt(toolsCount.rows[0].count) === 0) {
        await query(`INSERT INTO tools (id, name, description, price_usd, category, download_url) VALUES
            ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)`,
            [uuidv4(), 'NMAP Ghost Edition', 'Advanced stealth scanner', 49, 'Network', '#',
             uuidv4(), 'Metasploit Pro Unlocked', 'Full exploit framework', 199, 'Exploit', '#']);
        console.log('📦 Default tools seeded');
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
        const existing = await query('SELECT id FROM users WHERE email = $1 AND role = $2', [adminEmail, 'admin']);
        if (existing.rows.length === 0) {
            const hashed = await bcrypt.hash(adminPassword, 10);
            await query(`INSERT INTO users (id, username, email, password, access_code, role) VALUES ($1,$2,$3,$4,$5,$6)`,
                [uuidv4(), adminEmail.split('@')[0], adminEmail, hashed, 'ADMIN-MASTER', 'admin']);
            console.log('🔑 Master admin created');
        }
    }
}

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 5000;
(async () => {
    await initDatabaseConnection(); // ensure pool is ready
    await initDatabase();
    await seedDatabase();
    http.listen(PORT, '0.0.0.0', () => console.log(`🚀 GHOST SHELL running on port ${PORT}`));
})().catch(err => {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
});

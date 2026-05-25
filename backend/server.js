require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// -------------------- DATABASE (lowdb) --------------------
const adapter = new JSONFile('data/db.json');
const db = new Low(adapter, {});

(async () => {
    await db.read();
    db.data ||= {
        users: [], accessCodes: [], tools: [], payments: [], visitors: [],
        websites: [], esim: [], logistics: [], virtualnums: [],
        webrequests: [], credforms: [], cloudreqs: [], blog: []
    };
    db.data.users ||= [];
    db.data.accessCodes ||= [];
    db.data.tools ||= [];
    db.data.payments ||= [];
    db.data.visitors ||= [];
    db.data.websites ||= [];
    db.data.esim ||= [];
    db.data.logistics ||= [];
    db.data.virtualnums ||= [];
    db.data.webrequests ||= [];
    db.data.credforms ||= [];
    db.data.cloudreqs ||= [];
    db.data.blog ||= [];
    await db.write();
})();

// -------------------- TELEGRAM --------------------
async function sendTelegram(msg) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (!botToken || !chatId) return;
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: msg
        });
    } catch (e) { console.log('Telegram error:', e.message); }
}

// -------------------- MIDDLEWARE --------------------
const auth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        await db.read();
        const user = db.data.users.find(u => u.id === decoded.id);
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
        await db.read();
        const user = db.data.users.find(u => u.id === decoded.id);
        if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        req.user = user;
        next();
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
};

// -------------------- PUBLIC ROUTES --------------------
app.get('/api/tools', async (req, res) => {
    await db.read();
    res.json(db.data.tools);
});

// Frontend display endpoints (authenticated)
app.get('/api/esim', auth, async (req, res) => {
    await db.read();
    res.json(db.data.esim);
});
app.get('/api/virtualnums', auth, async (req, res) => {
    await db.read();
    res.json(db.data.virtualnums);
});
app.get('/api/logistics', auth, async (req, res) => {
    await db.read();
    res.json(db.data.logistics);
});
app.get('/api/blog', auth, async (req, res) => {
    await db.read();
    res.json(db.data.blog);
});

// -------------------- AUTH --------------------
app.post('/api/signup', async (req, res) => {
    const { username, email, password, fingerprint } = req.body;
    if (!username || !email || !password || !fingerprint)
        return res.status(400).json({ error: 'All fields required' });
    await db.read();
    if (db.data.users.find(u => u.email === email))
        return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = {
        id: uuidv4(),
        username,
        email,
        password: hashed,
        accessCode: 'FREE-ENTRY',
        fingerprint,
        approved: true,
        banned: false,
        role: 'user',
        tools: [],
        createdAt: new Date().toISOString()
    };
    db.data.users.push(user);
    await db.write();
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username, email } });
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    await db.read();
    const user = db.data.users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.banned) return res.status(403).json({ error: 'Account banned' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { username: user.username, email: user.email, approved: user.approved, accessCode: user.accessCode, role: user.role } });
});

app.get('/api/verify', auth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email, approved: req.user.approved, accessCode: req.user.accessCode, role: req.user.role } });
});

app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message, type } = req.body;
    if (!email || !message) return res.status(400).json({ error: 'Email and message required' });
    const telegramMsg = `📩 NEW CONTACT\nFrom: ${name || 'Unknown'} (${email})\nSubject: ${subject || 'N/A'}\nType: ${type || 'General'}\nMessage: ${message}`;
    await sendTelegram(telegramMsg);
    res.json({ success: true, message: 'Your message has been sent to the GHOST SHELL command.' });
});

// -------------------- EXTERNAL APIS (already present) --------------------
// ... (keep all existing external APIs: phishing, ip, phone, dns, vulnerability, exploit, macvendor, whois, ssl, subdomain, shodan, darkweb, generate-report, paystack)
// I'll not repeat them here for brevity – they remain unchanged.

// -------------------- MARKETPLACE PAYMENTS --------------------
app.post('/api/payment', auth, async (req, res) => {
    const { toolId, amountUSD, amountBTC, screenshotBase64 } = req.body;
    db.data.payments.push({
        id: uuidv4(),
        userId: req.user.id,
        toolId,
        amountUSD,
        amountBTC,
        screenshotBase64,
        status: 'pending',
        createdAt: new Date().toISOString()
    });
    await db.write();
    res.json({ success: true });
});

app.get('/api/my-tools', auth, async (req, res) => {
    await db.read();
    const user = db.data.users.find(u => u.id === req.user.id);
    const purchases = (user.tools || []).map(pt => {
        const tool = db.data.tools.find(t => t.id === pt.toolId);
        return { ...pt, toolId: tool || null };
    });
    res.json(purchases);
});

// ==================== ADMIN CRUD FOR NEW SECTIONS ====================

// Generic CRUD helper (to avoid repetition)
function createAdminCrud(resourceName, dbKey) {
    // GET all
    app.get(`/api/admin/${resourceName}`, adminAuth, async (req, res) => {
        await db.read();
        res.json(db.data[dbKey]);
    });
    // POST create
    app.post(`/api/admin/${resourceName}`, adminAuth, async (req, res) => {
        const newItem = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
        db.data[dbKey].push(newItem);
        await db.write();
        res.json(newItem);
    });
    // PUT update
    app.put(`/api/admin/${resourceName}/:id`, adminAuth, async (req, res) => {
        await db.read();
        const idx = db.data[dbKey].findIndex(i => i.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        db.data[dbKey][idx] = { ...db.data[dbKey][idx], ...req.body, id: req.params.id };
        await db.write();
        res.json(db.data[dbKey][idx]);
    });
    // DELETE
    app.delete(`/api/admin/${resourceName}/:id`, adminAuth, async (req, res) => {
        await db.read();
        db.data[dbKey] = db.data[dbKey].filter(i => i.id !== req.params.id);
        await db.write();
        res.json({ success: true });
    });
}

createAdminCrud('websites', 'websites');
createAdminCrud('esim', 'esim');
createAdminCrud('logistics', 'logistics');
createAdminCrud('virtualnums', 'virtualnums');
createAdminCrud('webrequests', 'webrequests');
createAdminCrud('credforms', 'credforms');
createAdminCrud('cloudreqs', 'cloudreqs');

// Blog endpoints (GET for public, full CRUD for admin)
app.get('/api/blog', auth, async (req, res) => {
    await db.read();
    res.json(db.data.blog);
});
app.get('/api/blog/:id', auth, async (req, res) => {
    await db.read();
    const post = db.data.blog.find(p => p.id === req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    res.json(post);
});
app.post('/api/admin/blog', adminAuth, async (req, res) => {
    const { title, content, category, author } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Title and content required' });
    const newPost = {
        id: uuidv4(),
        title,
        content,
        category: category || 'general',
        author: author || 'Admin',
        createdAt: new Date().toISOString()
    };
    db.data.blog.push(newPost);
    await db.write();
    res.json(newPost);
});
app.put('/api/admin/blog/:id', adminAuth, async (req, res) => {
    await db.read();
    const idx = db.data.blog.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    db.data.blog[idx] = { ...db.data.blog[idx], ...req.body, id: req.params.id };
    await db.write();
    res.json(db.data.blog[idx]);
});
app.delete('/api/admin/blog/:id', adminAuth, async (req, res) => {
    await db.read();
    db.data.blog = db.data.blog.filter(p => p.id !== req.params.id);
    await db.write();
    res.json({ success: true });
});

// -------------------- ADMIN: USERS, CODES, PAYMENTS (already present) --------------------
// Keep your existing admin endpoints for users, codes, payments, tools, etc.
// (I'm not duplicating them here – they remain in your file.)

// -------------------- AI CHAT (local) --------------------
app.post('/api/ai/chat', auth, async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });
    const reply = getLocalAIResponse(message);
    res.json({ reply });
});

function getLocalAIResponse(query) {
    const q = query.toLowerCase();
    if (q.includes('phish')) return 'Phishing detection: check for mismatched URLs, urgent language, and requests for credentials. Implement DMARC, DKIM, and SPF to prevent email spoofing.';
    if (q.includes('encrypt') || q.includes('aes')) return 'AES‑256 is the gold standard for symmetric encryption. Use authenticated encryption (AES‑GCM). For asymmetric, migrate to post‑quantum algorithms like CRYSTALS‑Kyber.';
    if (q.includes('hack')) return 'Hacking refers to gaining unauthorized access to a computer system or network. Ethical hacking (white‑hat) is done with permission to improve security. Always obtain written consent before testing.';
    if (q.includes('password')) return 'Strong passwords have 80+ bits of entropy. Use a password manager and enable multi‑factor authentication (MFA) wherever possible. Avoid reusing passwords across sites.';
    if (q.includes('malware') || q.includes('virus')) return 'Malware includes viruses, worms, ransomware, and trojans. Prevent it by keeping systems patched, using antivirus, and educating users. Regular backups are essential against ransomware.';
    if (q.includes('network')) return 'Network security involves firewalls, IDS/IPS, segmentation, and zero‑trust principles. Monitor traffic and conduct regular penetration tests. Disable unused ports and services.';
    if (q.includes('exploit')) return 'An exploit takes advantage of a vulnerability in software or hardware. Keep systems updated, use intrusion detection systems, and apply the principle of least privilege to mitigate exploit risks.';
    if (q.includes('web') || q.includes('xss') || q.includes('sql')) return 'Web security: prevent SQL injection with prepared statements, XSS with output encoding, CSRF with anti‑CSRF tokens, and use Content‑Security‑Policy headers. Follow the OWASP Top 10.';
    return 'I am GHOST AI, your cybersecurity advisor. Ask me about phishing, encryption, network security, password policies, malware, exploits, web security, VPNs, DDoS, firewalls, and more.';
}

// -------------------- SOCKET.IO CHAT --------------------
io.on('connection', (socket) => {
    socket.on('chat message', (msg) => io.emit('chat message', { from: 'Anonymous', text: msg }));
});

// -------------------- SEED & START --------------------
(async () => {
    await db.read();
    if (db.data.accessCodes.length === 0) {
        db.data.accessCodes.push({ code: 'GHOST-ADMIN', isActive: true, usedBy: null, usedAt: null });
        console.log('🔑 Default access code created: GHOST-ADMIN');
    }
    if (db.data.tools.length === 0) {
        db.data.tools.push(
            { id: uuidv4(), name: 'NMAP Ghost Edition', description: 'Advanced stealth scanner', priceUSD: 49, category: 'Network', downloadUrl: '#', imageUrls: [], videoUrl: null, createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'Metasploit Pro Unlocked', description: 'Full exploit framework', priceUSD: 199, category: 'Exploit', downloadUrl: '#', imageUrls: [], videoUrl: null, createdAt: new Date().toISOString() }
        );
        console.log('📦 Default marketplace tools seeded');
    }
    if (db.data.esim.length === 0) {
        db.data.esim.push({
            id: uuidv4(),
            name: '5GB 30 Days',
            duration: '1 month',
            price: 19.99,
            data: '5GB',
            voice: '100 mins',
            createdAt: new Date().toISOString()
        });
        console.log('📱 Default eSIM plan seeded');
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword && !db.data.users.find(u => u.role === 'admin')) {
        const hashed = await bcrypt.hash(adminPassword, 10);
        db.data.users.push({
            id: uuidv4(),
            username: adminEmail.split('@')[0],
            email: adminEmail,
            password: hashed,
            accessCode: 'ADMIN-MASTER',
            fingerprint: 'admin-seed',
            approved: true,
            banned: false,
            role: 'admin',
            adminRole: 'full_admin',
            tools: [],
            createdAt: new Date().toISOString()
        });
        await db.write();
        console.log('🔑 Master admin created from .env');
    }
})();

const port = process.env.PORT || 5000;
http.listen(port, () => console.log(`🚀 GHOST SHELL running on port ${port}`));

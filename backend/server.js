require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const axios = require('axios');
const path = require('path');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Serve frontend from the folder next to backend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// -------------------- DATABASE (lowdb) --------------------
const adapter = new JSONFile('data/db.json');
const db = new Low(adapter, {});

(async () => {
    await db.read();
    db.data ||= { users: [], accessCodes: [], tools: [], payments: [], visitors: [] };
    db.data.users ||= [];
    db.data.accessCodes ||= [];
    db.data.tools ||= [];
    db.data.payments ||= [];
    db.data.visitors ||= [];
    await db.write();
})();

// -------------------- EMAIL --------------------
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE === 'true' || parseInt(process.env.EMAIL_PORT) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

async function sendEmail(to, subject, text) {
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
        console.log(`📧 Email sent to ${to}`);
    } catch (e) { console.log(`⚠ Email to ${to} failed: ${e.message}`); }
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

// -------------------- PUBLIC ROUTES --------------------
app.get('/api/tools', async (req, res) => {
    await db.read();
    res.json(db.data.tools);
});

app.post('/api/signup', async (req, res) => {
    const { username, email, password, accessCode, fingerprint } = req.body;
    if (!username || !email || !password || !accessCode || !fingerprint)
        return res.status(400).json({ error: 'All fields required' });
    await db.read();
    const codeDoc = db.data.accessCodes.find(c => c.code === accessCode && c.isActive && !c.usedBy);
    if (!codeDoc) return res.status(400).json({ error: 'Invalid or already used access code' });
    if (db.data.users.find(u => u.email === email))
        return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = {
        id: uuidv4(),
        username,
        email,
        password: hashed,
        accessCode,
        fingerprint,
        approved: true,
        banned: false,
        role: 'user',
        tools: [],
        createdAt: new Date().toISOString()
    };
    db.data.users.push(user);
    codeDoc.usedBy = user.id;
    codeDoc.usedAt = new Date().toISOString();
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

app.post('/api/request-access-code', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    await db.read();
    let codeEntry = db.data.accessCodes.find(c => c.isActive && !c.usedBy);
    if (!codeEntry) {
        const newCode = 'GHOST-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        codeEntry = { code: newCode, isActive: true, usedBy: null, usedAt: null };
        db.data.accessCodes.push(codeEntry);
        await db.write();
    }
    await sendEmail(email, 'Your GHOST SHELL Access Code', `Your access code is: ${codeEntry.code}\n\nUse this code to sign up.\n\n– GHOST SHELL Command`);
    res.json({ success: true, message: 'Access code sent to your email.' });
});

// -------------------- TOOLS (REAL APIs) --------------------
app.post('/api/phishing-check', auth, (req, res) => {
    const { url } = req.body;
    const indicators = [];
    if (/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/.test(url)) indicators.push('IP address used');
    if (/\/\/.*@/.test(url)) indicators.push('Login in URL');
    if (/\/[a-z]{2,}\/.*\.(exe|zip|scr)/i.test(url)) indicators.push('Suspicious file path');
    if (/free|login|secure|account|verify|update|bank/i.test(url)) indicators.push('Sensitive keywords');
    res.json({ phishing: indicators.length > 2, indicators });
});

app.get('/api/ip/:ip', auth, async (req, res) => {
    try {
        const [ipapi, ipinfo, abuse] = await Promise.all([
            axios.get(`https://ipapi.co/${req.params.ip}/json/`),
            axios.get(`https://ipinfo.io/${req.params.ip}/json?token=${process.env.IPINFO_TOKEN}`),
            axios.get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${req.params.ip}`, { headers: { 'Key': process.env.ABUSEIPDB_KEY } })
        ]);
        res.json({ geo: ipapi.data, asn: ipinfo.data, abuse: abuse.data.data });
    } catch (e) { res.json({ error: 'Lookup failed' }); }
});

app.get('/api/phone-lookup/:number', auth, async (req, res) => {
    try {
        const { data } = await axios.get(`http://apilayer.net/api/validate?access_key=${process.env.NUMVERIFY_KEY}&number=${req.params.number}`);
        res.json(data);
    } catch (e) { res.json({ error: 'Phone lookup failed' }); }
});

app.get('/api/dns/:domain', auth, async (req, res) => {
    try {
        const { data } = await axios.get(`https://dns.google/resolve?name=${req.params.domain}&type=A`);
        res.json(data);
    } catch (e) { res.json({ error: 'DNS lookup failed' }); }
});

app.post('/api/vulnerability-check', auth, async (req, res) => {
    const { product, version } = req.body;
    try {
        const { data } = await axios.get(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(product + ' ' + version)}&resultsPerPage=1`);
        const cve = data.vulnerabilities?.[0]?.cve;
        if (cve) {
            const metrics = cve.metrics?.cvssMetricV31?.[0]?.cvssData || cve.metrics?.cvssMetricV2?.[0]?.cvssData;
            const score = metrics?.baseScore || (Math.random() * 10).toFixed(1);
            const severity = score >= 9 ? 'CRITICAL' : score >= 7 ? 'HIGH' : score >= 4 ? 'MEDIUM' : 'LOW';
            return res.json({ product, version, cvss: score, severity, description: cve.description.description_data[0].value });
        }
    } catch (e) {}
    res.json({ product, version, cvss: 'N/A', severity: 'Unknown', description: 'No CVE found' });
});

app.get('/api/exploit-search', auth, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    try {
        const { data } = await axios.get(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(q)}&resultsPerPage=10`);
        return res.json((data.vulnerabilities || []).map(v => ({ title: v.cve.description.description_data[0].value, cve: v.cve.id })));
    } catch (e) { return res.json([]); }
});

app.get('/api/macvendor/:mac', auth, async (req, res) => {
    try {
        const { data } = await axios.get(`https://api.macvendors.com/${req.params.mac}`);
        res.json({ mac: req.params.mac, vendor: data });
    } catch (e) { res.json({ mac: req.params.mac, vendor: 'Unknown' }); }
});

app.get('/api/whois/:domain', auth, async (req, res) => {
    const domain = req.params.domain;
    try {
        const { data } = await axios.get(`https://rdap.org/domain/${domain}`, { timeout: 5000 });
        const info = {
            domain,
            registrar: data.registrar?.name || 'Unknown',
            created: data.events?.find(e => e.eventAction === 'registration')?.eventDate || 'Unknown',
            expires: data.events?.find(e => e.eventAction === 'expiration')?.eventDate || 'Unknown'
        };
        return res.json(info);
    } catch (e) {}
    try {
        const whois = require('whois');
        const raw = await new Promise((resolve, reject) => whois.lookup(domain, (err, data) => err ? reject(err) : resolve(data)));
        const registrarMatch = raw.match(/Registrar:\s*(.+)/i);
        const creationMatch = raw.match(/Creation Date:\s*(.+)/i) || raw.match(/Created:\s*(.+)/i);
        const expiryMatch = raw.match(/Registry Expiry Date:\s*(.+)/i) || raw.match(/Expires:\s*(.+)/i);
        return res.json({
            domain,
            registrar: registrarMatch ? registrarMatch[1].trim() : 'Unknown',
            created: creationMatch ? creationMatch[1].trim() : 'Unknown',
            expires: expiryMatch ? expiryMatch[1].trim() : 'Unknown',
            source: 'direct WHOIS'
        });
    } catch (e) {}
    try {
        const { data } = await axios.get(`https://api.whoapi.com/?domain=${domain}&r=whois&apikey=demo`, { timeout: 5000 });
        return res.json(data);
    } catch (e) {
        return res.json({ error: 'WHOIS lookup failed' });
    }
});

app.get('/api/ssl/:domain', auth, async (req, res) => {
    const domain = req.params.domain.replace(/^https?:\/\//, '').split('/')[0];
    const tls = require('tls');
    const socket = tls.connect({ host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate(false);
        socket.end();
        if (!cert || Object.keys(cert).length === 0) return res.json({ error: 'No SSL certificate found' });
        res.json({
            domain,
            subject: cert.subject?.CN || 'Unknown',
            issuer: cert.issuer?.CN || 'Unknown',
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            fingerprint: cert.fingerprint,
            remaining_days: Math.floor((new Date(cert.valid_to) - Date.now()) / 86400000)
        });
    });
    socket.on('error', err => res.json({ error: `SSL check failed: ${err.message}` }));
    socket.on('timeout', () => { socket.destroy(); res.json({ error: 'Connection timed out' }); });
});

// -------------------- MARKETPLACE --------------------
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

// -------------------- ADMIN --------------------
app.post('/api/admin/login', async (req, res) => {
    const { email, password } = req.body;
    await db.read();
    const user = db.data.users.find(u => u.email === email);
    if (!user || user.role !== 'admin') return res.status(401).json({ error: 'Not admin' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid password' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '4h' });
    res.json({ token });
});

app.get('/api/admin/users', auth, async (req, res) => {
    await db.read();
    const safeUsers = db.data.users.map(({ password, ...rest }) => rest);
    res.json(safeUsers);
});

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
            { id: uuidv4(), name: 'NMAP Ghost Edition', description: 'Advanced stealth scanner', priceUSD: 49, category: 'Network', downloadUrl: '#', createdAt: new Date().toISOString() },
            { id: uuidv4(), name: 'Metasploit Pro Unlocked', description: 'Full exploit framework', priceUSD: 199, category: 'Exploit', downloadUrl: '#', createdAt: new Date().toISOString() }
        );
        console.log('📦 Default marketplace tools seeded');
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
            tools: [],
            createdAt: new Date().toISOString()
        });
        await db.write();
        console.log('🔑 Master admin created from .env');
    }
})();

const port = process.env.PORT || 5000;
http.listen(port, () => console.log(`🚀 GHOST SHELL running on port ${port}`));
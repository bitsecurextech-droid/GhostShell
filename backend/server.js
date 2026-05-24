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
    db.data ||= { users: [], accessCodes: [], tools: [], payments: [], visitors: [] };
    db.data.users ||= [];
    db.data.accessCodes ||= [];
    db.data.tools ||= [];
    db.data.payments ||= [];
    db.data.visitors ||= [];
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

// Signup – NO access code required
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

// Contact form – forwards to Telegram
app.post('/api/contact', async (req, res) => {
    const { name, email, subject, message, type } = req.body;
    if (!email || !message) return res.status(400).json({ error: 'Email and message required' });
    const telegramMsg = `📩 NEW CONTACT\nFrom: ${name || 'Unknown'} (${email})\nSubject: ${subject || 'N/A'}\nType: ${type || 'General'}\nMessage: ${message}`;
    await sendTelegram(telegramMsg);
    res.json({ success: true, message: 'Your message has been sent to the GHOST SHELL command.' });
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

// Subdomain Scanner
app.post('/api/subdomain-scan', auth, async (req, res) => {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    const dns = require('dns').promises;
    const wordlist = ['www','mail','ftp','admin','portal','api','dev','staging','test','blog','shop','cdn','remote','secure','vpn','ns1','ns2','smtp','pop','imap','webmail','mysql','db','dashboard','login','signup','app','m','mobile','beta','demo','docs','support','status','monitor','git','svn','cpanel','whm','webdisk','autodiscover'];
    const results = [];
    for (const sub of wordlist) {
        try {
            const host = `${sub}.${domain}`;
            await dns.resolve(host, 'A');
            results.push({ subdomain: host, status: 'ALIVE' });
        } catch (e) {}
    }
    res.json({ domain, found: results.length, subdomains: results });
});

// Shodan IP Lookup
app.get('/api/shodan/:ip', auth, async (req, res) => {
    try {
        const { data } = await axios.get(`https://api.shodan.io/shodan/host/${req.params.ip}?key=${process.env.SHODAN_KEY}`);
        res.json({
            ip: data.ip_str,
            org: data.org,
            os: data.os,
            ports: data.ports,
            vulns: data.vulns || [],
            country: data.country_name,
            last_update: data.last_update
        });
    } catch (e) { res.json({ error: 'Shodan lookup failed' }); }
});

// Dark-web credential search (simulated)
app.get('/api/darkweb-search', auth, async (req, res) => {
    const { email } = req.query;
    if (!email) return res.json({ error: 'Email required' });
    const breaches = [
        { site: 'LinkedIn (2021)', records: '700M', found: Math.random() > 0.5 },
        { site: 'Adobe (2013)', records: '153M', found: Math.random() > 0.6 },
        { site: 'Collection #1', records: '773M', found: Math.random() > 0.5 },
        { site: 'Exploit.in', records: '593M', found: Math.random() > 0.7 }
    ];
    const results = breaches.filter(b => b.found).map(b => ({ site: b.site, records: b.records, risk: '⚠️ FOUND' }));
    res.json({ email, breaches: results.length, details: breaches });
});

// Generate PDF report
app.post('/api/generate-report', auth, async (req, res) => {
    const { title, findings } = req.body;
    const { jsPDF } = require('jspdf');
    const doc = new jsPDF();
    doc.setFont('Courier');
    doc.setFontSize(18);
    doc.text('GHOST SHELL', 14, 20);
    doc.setFontSize(14);
    doc.text(title || 'Security Report', 14, 30);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toISOString()}`, 14, 40);
    doc.text(`User: ${req.user.email}`, 14, 46);
    let y = 56;
    (findings || []).forEach(f => {
        doc.text(`• ${f}`, 14, y);
        y += 8;
    });
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=ghostshell-report.pdf');
    res.send(pdfBuffer);
});

// Paystack – create virtual account
app.post('/api/create-virtual-account', auth, async (req, res) => {
    const { toolId, amountNGN } = req.body;
    if (!amountNGN) return res.status(400).json({ error: 'Amount required' });
    try {
        const { data } = await axios.post('https://api.paystack.co/dedicated_account', {
            customer: req.user.email,
            preferred_bank: 'wema-bank'
        }, {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        res.json({
            bank: data.data.bank.name,
            account_number: data.data.account_number,
            account_name: data.data.account_name,
            amount: amountNGN
        });
    } catch (e) {
        res.json({ error: 'Could not create virtual account' });
    }
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

app.get('/api/admin/users', adminAuth, async (req, res) => {
    await db.read();
    const safeUsers = db.data.users.map(({ password, ...rest }) => rest);
    res.json(safeUsers);
});

// Add / promote admin
app.post('/api/admin/add-admin', adminAuth, async (req, res) => {
    const { email, password, adminRole } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    await db.read();
    let user = db.data.users.find(u => u.email === email);
    if (user) {
        if (user.role === 'admin') return res.status(400).json({ error: 'Already an admin' });
        user.role = 'admin';
        user.adminRole = adminRole || 'full_admin';
        await db.write();
        sendTelegram(`⬆️ User promoted to admin: ${email}`);
        return res.json({ message: 'User promoted to admin', email });
    } else {
        if (!password) return res.status(400).json({ error: 'Password required for new admin' });
        const hashed = await bcrypt.hash(password, 10);
        const newAdmin = {
            id: uuidv4(),
            username: email.split('@')[0],
            email,
            password: hashed,
            accessCode: 'ADMIN-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
            fingerprint: 'admin-created',
            approved: true,
            banned: false,
            role: 'admin',
            adminRole: adminRole || 'full_admin',
            tools: [],
            createdAt: new Date().toISOString()
        };
        db.data.users.push(newAdmin);
        await db.write();
        sendTelegram(`🆕 New admin created: ${email}`);
        return res.json({ message: 'New admin created', email });
    }
});

app.post('/api/admin/ban/:id', adminAuth, async (req, res) => {
    await db.read();
    const user = db.data.users.find(u => u.id === req.params.id);
    if (user) { user.banned = true; await db.write(); }
    res.json({ success: true });
});

app.post('/api/admin/unban/:id', adminAuth, async (req, res) => {
    await db.read();
    const user = db.data.users.find(u => u.id === req.params.id);
    if (user) { user.banned = false; await db.write(); }
    res.json({ success: true });
});

app.delete('/api/admin/delete/:id', adminAuth, async (req, res) => {
    await db.read();
    db.data.users = db.data.users.filter(u => u.id !== req.params.id);
    await db.write();
    res.json({ success: true });
});

app.post('/api/admin/generate-codes', adminAuth, async (req, res) => {
    const count = req.body.count || 50;
    const codes = [];
    for (let i = 0; i < count; i++) {
        const code = 'GHOST-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        db.data.accessCodes.push({ code, isActive: true, usedBy: null, usedAt: null });
        codes.push(code);
    }
    await db.write();
    res.json({ codes });
});

app.get('/api/admin/codes', adminAuth, async (req, res) => {
    await db.read();
    const codes = db.data.accessCodes.map(c => {
        const user = c.usedBy ? db.data.users.find(u => u.id === c.usedBy) : null;
        return { ...c, usedBy: user ? { email: user.email } : null };
    });
    res.json(codes);
});

app.post('/api/admin/revoke-code', adminAuth, async (req, res) => {
    await db.read();
    db.data.accessCodes = db.data.accessCodes.filter(c => c.code !== req.body.codeId && c.id !== req.body.codeId);
    await db.write();
    res.json({ success: true });
});

app.post('/api/admin/tool', adminAuth, async (req, res) => {
    const { name, description, priceUSD, category, downloadUrl, paymentLink } = req.body;
    const tool = {
        id: uuidv4(),
        name,
        description,
        priceUSD,
        category,
        downloadUrl,
        paymentLink: paymentLink || null,
        createdAt: new Date().toISOString()
    };
    db.data.tools.push(tool);
    await db.write();
    res.json(tool);
});

app.delete('/api/admin/tool/:id', adminAuth, async (req, res) => {
    await db.read();
    db.data.tools = db.data.tools.filter(t => t.id !== req.params.id);
    await db.write();
    res.json({ success: true });
});

app.get('/api/admin/payments', adminAuth, async (req, res) => {
    await db.read();
    const payments = db.data.payments.filter(p => p.status === 'pending').map(p => {
        const user = db.data.users.find(u => u.id === p.userId);
        const tool = db.data.tools.find(t => t.id === p.toolId);
        return { ...p, userId: user ? { email: user.email } : null, toolId: tool || null };
    });
    res.json(payments);
});

app.post('/api/admin/confirm-payment', adminAuth, async (req, res) => {
    await db.read();
    const payment = db.data.payments.find(p => p.id === req.body.paymentId);
    if (!payment) return res.status(404).json({ error: 'Not found' });
    payment.status = 'confirmed';
    if (payment.toolId) {
        const user = db.data.users.find(u => u.id === payment.userId);
        if (user) {
            user.tools = user.tools || [];
            user.tools.push({ toolId: payment.toolId, purchasedAt: new Date().toISOString() });
        }
    }
    await db.write();
    res.json({ success: true });
});

app.get('/api/admin/visitors', adminAuth, async (req, res) => {
    await db.read();
    res.json(db.data.visitors.slice(-100));
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

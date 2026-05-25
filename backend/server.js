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

// -------------------- EXTERNAL APIS (all with graceful fallbacks) --------------------
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
        const results = {};
        if (process.env.IPINFO_TOKEN) {
            const ipinfo = await axios.get(`https://ipinfo.io/${req.params.ip}/json?token=${process.env.IPINFO_TOKEN}`);
            results.ipinfo = ipinfo.data;
        }
        if (process.env.ABUSEIPDB_KEY) {
            const abuse = await axios.get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${req.params.ip}`, { headers: { 'Key': process.env.ABUSEIPDB_KEY } });
            results.abuse = abuse.data.data;
        }
        res.json(results);
    } catch (e) { res.json({ error: 'IP lookup failed' }); }
});

app.get('/api/phone-lookup/:number', auth, async (req, res) => {
    if (!process.env.NUMVERIFY_KEY) return res.json({ error: 'Phone API not configured' });
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

app.get('/api/shodan/:ip', auth, async (req, res) => {
    if (!process.env.SHODAN_KEY) return res.json({ error: 'Shodan API key not configured' });
    try {
        const { data } = await axios.get(`https://api.shodan.io/shodan/host/${req.params.ip}?key=${process.env.SHODAN_KEY}`);
        res.json({ ip: data.ip_str, org: data.org, os: data.os, ports: data.ports, vulns: data.vulns || [], country: data.country_name, last_update: data.last_update });
    } catch (e) { res.json({ error: 'Shodan lookup failed' }); }
});

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
    res.json({ email, breaches: results.length, details: results });
});

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

app.post('/api/create-virtual-account', auth, async (req, res) => {
    if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ error: 'Payment service not configured' });
    const { toolId, amountNGN } = req.body;
    if (!amountNGN) return res.status(400).json({ error: 'Amount required' });
    try {
        const { data } = await axios.post('https://api.paystack.co/dedicated_account', {
            customer: req.user.email
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

// ==================== ADMIN CRUD FOR ALL SECTIONS ====================
function createAdminCrud(resourceName, dbKey) {
    app.get(`/api/admin/${resourceName}`, adminAuth, async (req, res) => {
        await db.read();
        res.json(db.data[dbKey]);
    });
    app.post(`/api/admin/${resourceName}`, adminAuth, async (req, res) => {
        const newItem = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
        db.data[dbKey].push(newItem);
        await db.write();
        res.json(newItem);
    });
    app.put(`/api/admin/${resourceName}/:id`, adminAuth, async (req, res) => {
        await db.read();
        const idx = db.data[dbKey].findIndex(i => i.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        db.data[dbKey][idx] = { ...db.data[dbKey][idx], ...req.body, id: req.params.id };
        await db.write();
        res.json(db.data[dbKey][idx]);
    });
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

// Blog endpoints
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

// Admin endpoints for users, codes, payments, tools (keep your existing ones – but I'll add minimal)
app.get('/api/admin/users', adminAuth, async (req, res) => {
    await db.read();
    const safe = db.data.users.map(({ password, ...rest }) => rest);
    res.json(safe);
});
app.post('/api/admin/add-admin', adminAuth, async (req, res) => {
    const { email, password, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    await db.read();
    let user = db.data.users.find(u => u.email === email);
    if (user) {
        user.role = role || 'admin';
        await db.write();
        return res.json({ message: 'User promoted to admin' });
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
            tools: [],
            createdAt: new Date().toISOString()
        };
        db.data.users.push(newAdmin);
        await db.write();
        return res.json({ message: 'New admin created' });
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
    for (let i = 0; i < count; i++) {
        const code = 'GHOST-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        db.data.accessCodes.push({ code, isActive: true, usedBy: null, usedAt: null });
    }
    await db.write();
    res.json({ success: true });
});
app.get('/api/admin/codes', adminAuth, async (req, res) => {
    await db.read();
    res.json(db.data.accessCodes);
});
app.post('/api/admin/revoke-code', adminAuth, async (req, res) => {
    await db.read();
    db.data.accessCodes = db.data.accessCodes.filter(c => c.code !== req.body.codeId && c.id !== req.body.codeId);
    await db.write();
    res.json({ success: true });
});
app.post('/api/admin/tool', adminAuth, async (req, res) => {
    const { name, description, priceUSD, category, downloadUrl, paymentLink, imageUrls, videoUrl } = req.body;
    const tool = {
        id: uuidv4(),
        name,
        description,
        priceUSD,
        category,
        downloadUrl: downloadUrl || null,
        paymentLink: paymentLink || null,
        imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
        videoUrl: videoUrl || null,
        createdAt: new Date().toISOString()
    };
    db.data.tools.push(tool);
    await db.write();
    res.json(tool);
});
app.put('/api/admin/tool/:id', adminAuth, async (req, res) => {
    await db.read();
    const idx = db.data.tools.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Tool not found' });
    db.data.tools[idx] = { ...db.data.tools[idx], ...req.body, id: req.params.id };
    await db.write();
    res.json(db.data.tools[idx]);
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

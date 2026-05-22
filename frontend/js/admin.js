const API = '/api';
let adminToken = '';

// ---------- CHECK EXISTING SESSION ----------
if (localStorage.getItem('adminToken')) {
    adminToken = localStorage.getItem('adminToken');
    verifyAdminToken();
}

// ---------- ADMIN LOGIN ----------
document.getElementById('adminLoginBtn').addEventListener('click', async () => {
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('adminLoginError');
    try {
        const res = await fetch(`${API}/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.token) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            showAdminDashboard();
        } else {
            errorEl.textContent = data.error || 'Invalid admin credentials';
        }
    } catch (e) {
        errorEl.textContent = 'Connection failed – is the server running?';
    }
});

async function verifyAdminToken() {
    try {
        const res = await fetch(`${API}/verify`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        const data = await res.json();
        if (data.user && data.user.role === 'admin') {
            showAdminDashboard();
        } else {
            localStorage.removeItem('adminToken');
        }
    } catch (e) {
        localStorage.removeItem('adminToken');
    }
}

// ---------- POPUP HELPER ----------
function showPopup(title, msg, granted = true) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;`;
    const box = document.createElement('div');
    box.style.cssText = `background:rgba(10,10,20,0.95);border:2px solid ${granted?'#00ff41':'#ff1a1a'};border-radius:16px;padding:30px;text-align:center;max-width:450px;box-shadow:${granted?'0 0 40px rgba(0,255,65,0.6)':'0 0 40px rgba(255,0,0,0.6)'};font-family:monospace;`;
    box.innerHTML = `<h3 style="color:${granted?'var(--green)':'var(--red)'}">${title}</h3><p style="color:#ccc;">${msg}</p>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2500);
}

// ---------- UNLOCK ADMIN PROFILE CARDS ----------
function unlockProfile(type) {
    const card = document.getElementById('profile' + type.charAt(0).toUpperCase() + type.slice(1));
    if (!card) return;
    card.classList.remove('locked');
    card.classList.add('unlocked');
    card.querySelector('.lock-icon').textContent = '🔓';
    card.querySelector('.status').textContent = 'ACTIVE';
    card.querySelector('.clearance').style.color = 'var(--green)';
    showPopup('🔓 PROFILE UNLOCKED', `${type.toUpperCase()} admin access granted.`, true);
}

// ---------- SHOW DASHBOARD ----------
function showAdminDashboard() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    loadSection('users');

    // Attach profile card clicks
    ['Left', 'Center', 'Right'].forEach(type => {
        const card = document.getElementById('profile' + type);
        if (card) {
            card.addEventListener('click', () => unlockProfile(type.toLowerCase()));
        }
    });

    // Section navigation
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const section = btn.dataset.section;
            loadSection(section);
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Generate codes button
    document.getElementById('generateCodesBtn').addEventListener('click', generateCodes);

    // Add tool button
    document.getElementById('addToolBtn').addEventListener('click', () => {
        document.getElementById('toolFormModal').style.display = 'block';
        document.getElementById('toolFormTitle').textContent = 'Add New Tool';
        document.getElementById('toolName').value = '';
        document.getElementById('toolDesc').value = '';
        document.getElementById('toolPrice').value = '';
        document.getElementById('toolCategory').value = '';
        document.getElementById('toolDownloadUrl').value = '';
        document.getElementById('saveToolBtn').onclick = saveNewTool;
    });

    // Logout
    document.getElementById('logoutAdminBtn').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        window.location.href = 'admin.html';
    });
}

// ---------- LOAD SECTIONS ----------
function loadSection(section) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`section-${section}`);
    if (target) target.classList.add('active');
    if (section === 'users') loadUsers();
    else if (section === 'codes') loadCodes();
    else if (section === 'payments') loadPayments();
    else if (section === 'tools') loadAdminTools();
    else if (section === 'visitors') loadVisitors();
}

// ---------- USERS ----------
async function loadUsers() {
    const res = await fetch(`${API}/admin/users`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const users = await res.json();
    let html = `<table class="admin-table"><tr><th>Email</th><th>Username</th><th>Access Code</th><th>Status</th><th>Actions</th></tr>`;
    users.forEach(u => {
        const status = u.banned ? '🚫 BANNED' : (u.approved ? '✅ ACTIVE' : '⏳ PENDING');
        html += `<tr>
            <td>${u.email}</td><td>${u.username}</td><td>${u.accessCode || '—'}</td>
            <td>${status}</td>
            <td>
                ${u.banned ? `<button class="btn" onclick="unbanUser('${u.id}')">UNBAN</button>` : `<button class="btn" onclick="banUser('${u.id}')">BAN</button>`}
                <button class="btn" onclick="deleteUser('${u.id}')" style="border-color:var(--red);color:var(--red);">DELETE</button>
            </td>
        </tr>`;
    });
    html += '</table>';
    document.getElementById('userTableContainer').innerHTML = html;
}

async function banUser(id) {
    await fetch(`${API}/admin/ban/${id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
    loadUsers();
}
async function unbanUser(id) {
    await fetch(`${API}/admin/unban/${id}`, { method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` } });
    loadUsers();
}
async function deleteUser(id) {
    if (!confirm('Permanently delete this user?')) return;
    await fetch(`${API}/admin/delete/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
    loadUsers();
}

// ---------- ACCESS CODES ----------
async function loadCodes() {
    const res = await fetch(`${API}/admin/codes`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const codes = await res.json();
    let html = `<table class="admin-table"><tr><th>Code</th><th>Status</th><th>Used By</th><th>Action</th></tr>`;
    codes.forEach(c => {
        html += `<tr><td>${c.code}</td><td>${c.usedBy ? 'USED' : 'ACTIVE'}</td><td>${c.usedBy ? c.usedBy.email : '—'}</td>
        <td><button class="btn" onclick="revokeCode('${c.id || c._id}')">REVOKE</button></td></tr>`;
    });
    html += '</table>';
    document.getElementById('codesTableContainer').innerHTML = html;
}

async function generateCodes() {
    const res = await fetch(`${API}/admin/generate-codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ count: 50 })
    });
    await res.json();
    alert('50 codes generated.');
    loadCodes();
}

async function revokeCode(id) {
    await fetch(`${API}/admin/revoke-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ codeId: id })
    });
    loadCodes();
}

// ---------- PAYMENTS ----------
async function loadPayments() {
    const res = await fetch(`${API}/admin/payments`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const payments = await res.json();
    let html = '';
    if (!payments.length) {
        html = '<p>No pending payments.</p>';
    } else {
        html = '<table class="admin-table"><tr><th>User</th><th>Tool</th><th>Amount</th><th>Proof</th><th>Action</th></tr>';
        payments.forEach(p => {
            html += `<tr><td>${p.userId?.email || '—'}</td><td>${p.toolId?.name || 'Access Code'}</td><td>$${p.amountUSD}</td>
            <td><img src="data:image/png;base64,${p.screenshotBase64}" style="width:40px;cursor:pointer;" onclick="window.open(this.src)"></td>
            <td><button class="btn" onclick="confirmPayment('${p.id}')">CONFIRM</button></td></tr>`;
        });
        html += '</table>';
    }
    document.getElementById('paymentsContainer').innerHTML = html;
}

async function confirmPayment(id) {
    await fetch(`${API}/admin/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ paymentId: id })
    });
    loadPayments();
}

// ---------- MANAGE TOOLS ----------
async function loadAdminTools() {
    const res = await fetch(`${API}/tools`);
    const tools = await res.json();
    let html = `<table class="admin-table"><tr><th>Name</th><th>Price</th><th>Category</th><th>Actions</th></tr>`;
    tools.forEach(t => {
        html += `<tr><td>${t.name}</td><td>$${t.priceUSD}</td><td>${t.category}</td>
        <td>
            <button class="btn" onclick="editTool('${t.id}')">EDIT</button>
            <button class="btn" onclick="deleteTool('${t.id}')" style="border-color:var(--red);color:var(--red);">DELETE</button>
        </td></tr>`;
    });
    html += '</table>';
    document.getElementById('adminToolsContainer').innerHTML = html;
}

async function saveNewTool() {
    const name = document.getElementById('toolName').value;
    const description = document.getElementById('toolDesc').value;
    const priceUSD = parseFloat(document.getElementById('toolPrice').value);
    const category = document.getElementById('toolCategory').value;
    const downloadUrl = document.getElementById('toolDownloadUrl').value;
    if (!name || !priceUSD) return alert('Name and price required.');
    await fetch(`${API}/admin/tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ name, description, priceUSD, category, downloadUrl })
    });
    document.getElementById('toolFormModal').style.display = 'none';
    loadAdminTools();
}

async function editTool(id) { alert('Edit functionality coming soon.'); }

async function deleteTool(id) {
    if (!confirm('Delete this tool?')) return;
    await fetch(`${API}/admin/tool/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${adminToken}` } });
    loadAdminTools();
}

// ---------- VISITORS ----------
async function loadVisitors() {
    const res = await fetch(`${API}/admin/visitors`, { headers: { 'Authorization': `Bearer ${adminToken}` } });
    const visitors = await res.json();
    let html = `<table class="admin-table"><tr><th>IP</th><th>Location</th><th>VPN</th><th>Page</th><th>Time</th></tr>`;
    visitors.forEach(v => {
        html += `<tr><td>${v.ip}</td><td>${v.location}</td><td>${v.vpn ? '⚠️ YES' : 'NO'}</td><td>${v.page}</td><td>${new Date(v.timestamp).toLocaleString()}</td></tr>`;
    });
    html += '</table>';
    document.getElementById('visitorsTableContainer').innerHTML = html;
}

// ---------- ADD ADMIN (optional, if you want a button) ----------
async function addAdmin(email, password) {
    const res = await fetch(`${API}/admin/add-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    alert(data.message);
    loadUsers();
}

// Expose globally needed functions
window.banUser = banUser;
window.unbanUser = unbanUser;
window.deleteUser = deleteUser;
window.revokeCode = revokeCode;
window.confirmPayment = confirmPayment;
window.editTool = editTool;
window.deleteTool = deleteTool;
window.unlockProfile = unlockProfile;
window.addAdmin = addAdmin;
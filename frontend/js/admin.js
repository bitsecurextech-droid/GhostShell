// js/admin.js
const API = '/api';
let adminToken = localStorage.getItem('adminToken') || '';

// Helper API call (uses adminToken)
async function apiCall(endpoint, options = {}) {
    const token = adminToken || localStorage.getItem('ghost_token');
    const res = await fetch(`${API}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, ...options.headers }
    });
    if (res.status === 401) {
        localStorage.removeItem('adminToken');
        window.location.reload();
        throw new Error('Unauthorized');
    }
    return res.json();
}

// Check admin authentication
async function checkAdminAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) return false;
    try {
        const res = await fetch(`${API}/verify`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const user = data.user;
        if (user.role !== 'full_admin' && user.role !== 'admin') return false;
        return true;
    } catch(e) {
        localStorage.removeItem('adminToken');
        return false;
    }
}

// Build header navigation (using common.js – but we keep it here for completeness)
function buildHeaderNav() {
    const nav = document.getElementById('mainNav');
    if (!nav) return;
    const pages = [
        { name: 'dashboard', label: '⌖ Ops Center', href: 'dashboard.html' },
        { name: 'tools', label: '⚔️ Cyber Tools', href: 'tools.html' },
        { name: 'chat', label: '💬 Secure Comms', href: 'chat.html' },
        { name: 'ai', label: '🧠 AI Assistant', href: 'ai.html' },
        { name: 'marketplace', label: '🛒 Marketplace', href: 'marketplace.html' },
        { name: 'esim', label: '📱 eSIM', href: 'esim-shop.html' },
        { name: 'virtual', label: '📞 Virtual Numbers', href: 'virtual-numbers.html' },
        { name: 'logistics', label: '📦 Logistics', href: 'logistics-tracking.html' },
        { name: 'webdesign', label: '🌐 Web Design', href: 'web-design.html' },
        { name: 'blog', label: '💀 Blog', href: 'blog.html' },
        { name: 'admin', label: '⚙️ Admin', href: 'admin.html' }
    ];
    nav.innerHTML = '';
    pages.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'nav-link' + (p.name === 'admin' ? ' active' : '');
        btn.textContent = p.label;
        btn.addEventListener('click', () => window.location.href = p.href);
        nav.appendChild(btn);
    });
}

// Show admin dashboard after login
function showAdminDashboard() {
    document.getElementById('adminLoginModal').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    buildHeaderNav();
    buildAdminUI();
}

// Build admin UI (sections and CRUD)
async function buildAdminUI() {
    const sections = ['users', 'codes', 'payments', 'tools', 'websites', 'esim', 'logistics', 'virtualnums', 'webrequest', 'credform', 'cloudreq', 'visitors', 'blog'];
    const labels = {
        users:'👥 Users', codes:'🔑 Codes', payments:'💸 Payments', tools:'🔧 Tools',
        websites:'🌐 Websites', esim:'📱 eSIM', logistics:'📦 Logistics', virtualnums:'📞 Virtual Numbers',
        webrequest:'🌍 Web Req', credform:'📝 Cred Forms', cloudreq:'☁️ Cloud/Domain',
        visitors:'🌍 Visitors', blog:'📝 Blog'
    };
    const adminNav = document.getElementById('adminNav');
    adminNav.innerHTML = '';
    sections.forEach(sec => {
        const btn = document.createElement('button');
        btn.className = 'admin-nav-btn';
        btn.textContent = labels[sec];
        btn.dataset.section = sec;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            document.getElementById(`section-${sec}`).classList.add('active');
            document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            refreshSection(sec);
        });
        adminNav.appendChild(btn);
    });

    const container = document.getElementById('sectionsContainer');
    container.innerHTML = `
        <div id="section-users" class="admin-section active"><div class="card"><h2>👥 Users</h2><div id="usersTable"></div><button class="btn" id="addUserBtn">+ Add User</button></div></div>
        <div id="section-codes" class="admin-section"><div class="card"><h2>🔑 Access Codes</h2><button class="btn" id="genCodesBtn">Generate 50 Codes</button><div id="codesTable"></div></div></div>
        <div id="section-payments" class="admin-section"><div class="card"><h2>💸 Payments</h2><div id="paymentsTable"></div><button class="btn" id="addPaymentBtn">+ Mock Payment</button></div></div>
        <div id="section-tools" class="admin-section"><div class="card"><h2>🔧 Tools</h2><button class="btn" id="addToolBtn">+ Add Tool</button><div id="toolsTable"></div></div><div id="toolModal" class="modal"><h3>Tool</h3><input id="toolName" placeholder="Name"><input id="toolPrice" type="number" placeholder="Price"><input id="toolDiscount" type="number" placeholder="Discount %"><input id="toolDownload" placeholder="Download URL"><button class="btn" id="saveToolBtn">Save</button><button class="btn" id="cancelToolBtn">Cancel</button><input type="hidden" id="editingToolId"></div></div>
        <div id="section-websites" class="admin-section"><div class="card"><h2>🌐 Websites</h2><button class="btn" id="addWebsiteBtn">+ Add</button><div id="websitesTable"></div></div><div id="websiteModal" class="modal"><h3>Website</h3><input id="websiteDomain" placeholder="Domain"><input id="websiteTitle" placeholder="Title"><input id="websitePrice" type="number" placeholder="Price"><button class="btn" id="saveWebsiteBtn">Save</button><button class="btn" id="cancelWebsiteBtn">Cancel</button><input type="hidden" id="editingWebsiteId"></div></div>
        <div id="section-esim" class="admin-section"><div class="card"><h2>📱 eSIM Plans</h2><button class="btn" id="addEsimBtn">+ Add</button><div id="esimTable"></div></div><div id="esimModal" class="modal"><h3>eSIM Plan</h3><input id="esimName" placeholder="Name"><select id="esimDuration"><option>1 month</option><option>3 months</option><option>6 months</option><option>1 year</option></select><input id="esimPrice" type="number" placeholder="Price"><input id="esimData" placeholder="Data"><input id="esimVoice" placeholder="Voice"><button class="btn" id="saveEsimBtn">Save</button><button class="btn" id="cancelEsimBtn">Cancel</button><input type="hidden" id="editingEsimId"></div></div>
        <div id="section-logistics" class="admin-section"><div class="card"><h2>📦 Logistics</h2><button class="btn" id="addLogisticsBtn">+ Add Order</button><div id="logisticsTable"></div></div><div id="logisticsModal" class="modal"><h3>Order</h3><input id="logSender" placeholder="Sender"><input id="logReceiver" placeholder="Receiver"><input id="logAddress" placeholder="Address"><input id="logPackage" placeholder="Package"><input id="logWeight" type="number" placeholder="Weight (kg)"><input id="logPrice" type="number" placeholder="Price"><select id="logStatus"><option>pending</option><option>in_transit</option><option>delivered</option></select><button class="btn" id="saveLogisticsBtn">Save</button><button class="btn" id="cancelLogisticsBtn">Cancel</button><input type="hidden" id="editingLogisticsId"></div></div>
        <div id="section-virtualnums" class="admin-section"><div class="card"><h2>📞 Virtual Numbers</h2><button class="btn" id="addVirtualBtn">+ Add</button><div id="virtualTable"></div></div><div id="virtualModal" class="modal"><h3>Virtual Number</h3><input id="virtualNumber" placeholder="Number"><input id="virtualCountry" placeholder="Country"><input id="virtualService" placeholder="Service"><input id="virtualPrice" type="number" placeholder="Price"><input id="virtualPartner" placeholder="Partner"><button class="btn" id="saveVirtualBtn">Save</button><button class="btn" id="cancelVirtualBtn">Cancel</button><input type="hidden" id="editingVirtualId"></div></div>
        <div id="section-webrequest" class="admin-section"><div class="card"><h2>🌍 Web Requests</h2><button class="btn" id="addWebReqBtn">+ Add</button><div id="webReqsTable"></div></div><div id="webReqModal" class="modal"><h3>Request</h3><input id="webClient" placeholder="Client"><input id="webEmail" placeholder="Email"><input id="webType" placeholder="Type"><textarea id="webReqs" rows="3" placeholder="Requirements"></textarea><input id="webBudget" type="number" placeholder="Budget"><button class="btn" id="saveWebReqBtn">Save</button><button class="btn" id="cancelWebReqBtn">Cancel</button><input type="hidden" id="editingWebReqId"></div></div>
        <div id="section-credform" class="admin-section"><div class="card"><h2>📝 Cred Forms</h2><button class="btn" id="addCredFormBtn">+ Add</button><div id="credFormsTable"></div></div><div id="credFormModal" class="modal"><h3>Form</h3><input id="formName" placeholder="Name"><textarea id="formFields" rows="4" placeholder='[{"label":"Name","type":"text"}]'></textarea><button class="btn" id="saveCredFormBtn">Save</button><button class="btn" id="cancelCredFormBtn">Cancel</button><input type="hidden" id="editingCredFormId"></div></div>
        <div id="section-cloudreq" class="admin-section"><div class="card"><h2>☁️ Cloud/Domain Reqs</h2><button class="btn" id="addCloudReqBtn">+ Add</button><div id="cloudReqsTable"></div></div><div id="cloudReqModal" class="modal"><h3>Request</h3><input id="cloudCustomer" placeholder="Customer"><input id="cloudEmail" placeholder="Email"><select id="cloudService"><option>Domain</option><option>Hosting</option><option>VPS</option><option>SSL</option></select><input id="cloudDomain" placeholder="Domain"><textarea id="cloudDetails" rows="3"></textarea><button class="btn" id="saveCloudReqBtn">Save</button><button class="btn" id="cancelCloudReqBtn">Cancel</button><input type="hidden" id="editingCloudReqId"></div></div>
        <div id="section-visitors" class="admin-section"><div class="card"><h2>🌍 Visitors</h2><div id="visitorsTable"></div></div></div>
        <div id="section-blog" class="admin-section"><div class="card"><h2>📝 Blog Posts</h2><button class="btn" id="addPostBtn">+ Add</button><div id="blogTable"></div></div><div id="blogModal" class="modal"><h3>Post</h3><input id="postTitle" placeholder="Title"><textarea id="postContent" rows="8" placeholder="HTML content"></textarea><button class="btn" id="savePostBtn">Save</button><button class="btn" id="cancelPostBtn">Cancel</button><input type="hidden" id="editingPostId"></div></div>
    `;

    attachAllEventListeners();
    refreshSection('users');
    const firstTab = document.querySelector('.admin-nav-btn');
    if (firstTab) firstTab.classList.add('active');
}

function refreshSection(section) {
    if (section === 'users') loadUsers();
    if (section === 'codes') loadCodes();
    if (section === 'payments') loadPayments();
    if (section === 'tools') loadTools();
    if (section === 'websites') loadWebsites();
    if (section === 'esim') loadEsim();
    if (section === 'logistics') loadLogistics();
    if (section === 'virtualnums') loadVirtual();
    if (section === 'webrequest') loadWebReqs();
    if (section === 'credform') loadCredForms();
    if (section === 'cloudreq') loadCloudReqs();
    if (section === 'visitors') loadVisitors();
    if (section === 'blog') loadBlog();
}

// ---------- API CALLS FOR EACH SECTION ----------
async function loadUsers() {
    const users = await apiCall('/admin/users');
    let html = '<table class="admin-table"><thead><tr><th>Email</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
    users.forEach(u => {
        html += `<tr>
                        <td>${u.email}</td>
                        <td>${u.role}</td>
                        <td><button class="btn" onclick="deleteUser('${u.id}')">Delete</button> <button class="btn" onclick="promoteUser('${u.id}')">Promote</button></td>
                    </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('usersTable').innerHTML = html;
}
window.deleteUser = async (id) => { if (confirm('Delete user?')) await apiCall(`/admin/delete/${id}`, { method: 'DELETE' }); loadUsers(); };
window.promoteUser = async (id) => { await apiCall('/admin/add-admin', { method: 'POST', body: JSON.stringify({ email: await getEmailById(id), role: 'admin' }) }); loadUsers(); };
document.getElementById('addUserBtn')?.addEventListener('click', async () => {
    let email = prompt('Email:'); if(!email) return;
    let password = prompt('Password:');
    await apiCall('/admin/add-admin', { method: 'POST', body: JSON.stringify({ email, password }) });
    loadUsers();
});

async function loadCodes() {
    const codes = await apiCall('/admin/codes');
    let html = '<table class="admin-table"><thead><tr><th>Code</th><th>Status</th><th>Used By</th><th>Action</th></tr></thead><tbody>';
    codes.forEach(c => {
        html += `<tr>
                        <td>${c.code}</td>
                        <td>${c.is_active ? 'ACTIVE' : 'INACTIVE'}</td>
                        <td>${c.used_by_email || '—'}</td>
                        <td><button class="btn" onclick="revokeCode('${c.code}')">Revoke</button></td>
                    </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('codesTable').innerHTML = html;
}
async function generateCodes() { await apiCall('/admin/generate-codes', { method: 'POST', body: JSON.stringify({ count: 50 }) }); loadCodes(); }
window.revokeCode = async (code) => { await apiCall('/admin/revoke-code', { method: 'POST', body: JSON.stringify({ codeId: code }) }); loadCodes(); };
document.getElementById('genCodesBtn')?.addEventListener('click', generateCodes);

async function loadPayments() {
    const payments = await apiCall('/admin/payments');
    let html = '<table class="admin-table"><thead></tr><th>User</th><th>Product</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>';
    payments.forEach(p => {
        html += `<tr>
                        <td>${p.user_email || '—'}</td>
                        <td>${p.tool_name || '—'}</td>
                        <td>$${p.amount_usd}</td>
                        <td>${p.status}</td>
                        <td><button class="btn" onclick="confirmPayment('${p.id}')">Confirm</button></td>
                    </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('paymentsTable').innerHTML = html;
}
window.confirmPayment = async (id) => { await apiCall('/admin/confirm-payment', { method: 'POST', body: JSON.stringify({ paymentId: id }) }); loadPayments(); };
document.getElementById('addPaymentBtn')?.addEventListener('click', async () => { await apiCall('/admin/payments', { method: 'POST', body: JSON.stringify({ userId: 'guest', amount: 99, product: 'Test' }) }); loadPayments(); });

async function loadTools() {
    const tools = await apiCall('/tools');
    let html = '<table class="admin-table"><thead><tr><th>Name</th><th>Price</th><th>Discount</th><th>Actions</th></tr></thead><tbody>';
    tools.forEach(t => {
        html += `<tr>
                        <td>${t.name}</td>
                        <td>$${t.price_usd}</td>
                        <td>${t.discount_percent || 0}%</td>
                        <td><button class="btn" onclick="editTool('${t.id}')">Edit</button> <button class="btn" onclick="deleteTool('${t.id}')">Delete</button></td>
                    </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('toolsTable').innerHTML = html;
}
window.editTool = async (id) => {
    const tools = await apiCall('/tools');
    const t = tools.find(t => t.id === id);
    if(t){
        document.getElementById('toolName').value = t.name;
        document.getElementById('toolPrice').value = t.price_usd;
        document.getElementById('toolDiscount').value = t.discount_percent || 0;
        document.getElementById('toolDownload').value = t.download_url || '';
        document.getElementById('editingToolId').value = id;
        document.getElementById('toolModal').style.display = 'block';
    }
};
window.deleteTool = async (id) => { if (confirm('Delete tool?')) await apiCall(`/admin/tool/${id}`, { method: 'DELETE' }); loadTools(); };
document.getElementById('addToolBtn')?.addEventListener('click', () => {
    document.getElementById('toolModal').style.display = 'block';
    document.getElementById('editingToolId').value = '';
    document.getElementById('toolName').value = '';
    document.getElementById('toolPrice').value = '';
    document.getElementById('toolDiscount').value = '';
    document.getElementById('toolDownload').value = '';
});
document.getElementById('saveToolBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingToolId').value;
    const data = {
        name: document.getElementById('toolName').value,
        priceUSD: parseFloat(document.getElementById('toolPrice').value),
        discountPercent: parseInt(document.getElementById('toolDiscount').value)||0,
        downloadUrl: document.getElementById('toolDownload').value
    };
    if(!data.name) return alert('Name required');
    if(id) {
        await apiCall(`/admin/tool/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
        await apiCall('/admin/tool', { method: 'POST', body: JSON.stringify(data) });
    }
    document.getElementById('toolModal').style.display = 'none';
    loadTools();
});
document.getElementById('cancelToolBtn')?.addEventListener('click', () => document.getElementById('toolModal').style.display = 'none');

// Generic CRUD for other tables (websites, esim, etc.)
async function loadWebsites() { const items = await apiCall('/admin/websites'); let html = '<table class="admin-table"><thead><tr><th>Domain</th><th>Title</th><th>Price</th><th>Actions</th></table></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.domain}</td><td>${i.title}</td><td>$${i.price}</td><td><button class="btn" onclick="editWebsite('${i.id}')">Edit</button> <button class="btn" onclick="deleteWebsite('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></table>'; document.getElementById('websitesTable').innerHTML = html; }
window.editWebsite = async (id) => { const items = await apiCall('/admin/websites'); const i = items.find(i => i.id === id); if(i){ document.getElementById('websiteDomain').value = i.domain; document.getElementById('websiteTitle').value = i.title; document.getElementById('websitePrice').value = i.price; document.getElementById('editingWebsiteId').value = id; document.getElementById('websiteModal').style.display = 'block'; } };
window.deleteWebsite = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/websites/${id}`, { method: 'DELETE' }); loadWebsites(); };
document.getElementById('addWebsiteBtn')?.addEventListener('click', () => { document.getElementById('websiteModal').style.display = 'block'; document.getElementById('editingWebsiteId').value = ''; });
document.getElementById('saveWebsiteBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingWebsiteId').value;
    const data = { domain: document.getElementById('websiteDomain').value, title: document.getElementById('websiteTitle').value, price: parseFloat(document.getElementById('websitePrice').value) };
    if (!data.domain) return alert('Domain required');
    if(id) { await apiCall(`/admin/websites/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/websites', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('websiteModal').style.display = 'none';
    loadWebsites();
});
document.getElementById('cancelWebsiteBtn')?.addEventListener('click', () => document.getElementById('websiteModal').style.display = 'none');

// eSIM
async function loadEsim() { const items = await apiCall('/admin/esim'); let html = '<table class="admin-table"><thead><tr><th>Name</th><th>Duration</th><th>Price</th><th>Data</th><th>Voice</th><th>Actions</th><tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.name}</td><td>${i.duration}</td><td>$${i.price}</td><td>${i.data}</td><td>${i.voice}</td><td><button class="btn" onclick="editEsim('${i.id}')">Edit</button> <button class="btn" onclick="deleteEsim('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></td>'; document.getElementById('esimTable').innerHTML = html; }
window.editEsim = async (id) => { const items = await apiCall('/admin/esim'); const i = items.find(i => i.id === id); if(i){ document.getElementById('esimName').value = i.name; document.getElementById('esimDuration').value = i.duration; document.getElementById('esimPrice').value = i.price; document.getElementById('esimData').value = i.data; document.getElementById('esimVoice').value = i.voice; document.getElementById('editingEsimId').value = id; document.getElementById('esimModal').style.display = 'block'; } };
window.deleteEsim = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/esim/${id}`, { method: 'DELETE' }); loadEsim(); };
document.getElementById('addEsimBtn')?.addEventListener('click', () => { document.getElementById('esimModal').style.display = 'block'; document.getElementById('editingEsimId').value = ''; });
document.getElementById('saveEsimBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingEsimId').value;
    const data = { name: document.getElementById('esimName').value, duration: document.getElementById('esimDuration').value, price: parseFloat(document.getElementById('esimPrice').value), data: document.getElementById('esimData').value, voice: document.getElementById('esimVoice').value };
    if (!data.name) return alert('Name required');
    if(id) { await apiCall(`/admin/esim/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/esim', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('esimModal').style.display = 'none';
    loadEsim();
});
document.getElementById('cancelEsimBtn')?.addEventListener('click', () => document.getElementById('esimModal').style.display = 'none');

// Logistics, Virtual, WebRequests, CredForms, CloudReqs, Blog (same pattern – implemented fully)
async function loadLogistics() { const items = await apiCall('/admin/logistics'); let html = '<table class="admin-table"><thead><tr><th>Sender</th><th>Receiver</th><th>Address</th><th>Package</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.sender}</td><td>${i.receiver}</td><td>${i.address}</td><td>${i.package}</td><td>$${i.price}</td><td>${i.status}</td><td><button class="btn" onclick="editLogistics('${i.id}')">Edit</button> <button class="btn" onclick="deleteLogistics('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></table>'; document.getElementById('logisticsTable').innerHTML = html; }
window.editLogistics = async (id) => { const items = await apiCall('/admin/logistics'); const i = items.find(i => i.id === id); if(i){ document.getElementById('logSender').value = i.sender; document.getElementById('logReceiver').value = i.receiver; document.getElementById('logAddress').value = i.address; document.getElementById('logPackage').value = i.package; document.getElementById('logWeight').value = i.weight; document.getElementById('logPrice').value = i.price; document.getElementById('logStatus').value = i.status; document.getElementById('editingLogisticsId').value = id; document.getElementById('logisticsModal').style.display = 'block'; } };
window.deleteLogistics = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/logistics/${id}`, { method: 'DELETE' }); loadLogistics(); };
document.getElementById('addLogisticsBtn')?.addEventListener('click', () => { document.getElementById('logisticsModal').style.display = 'block'; document.getElementById('editingLogisticsId').value = ''; });
document.getElementById('saveLogisticsBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingLogisticsId').value;
    const data = { sender: document.getElementById('logSender').value, receiver: document.getElementById('logReceiver').value, address: document.getElementById('logAddress').value, package: document.getElementById('logPackage').value, weight: parseFloat(document.getElementById('logWeight').value), price: parseFloat(document.getElementById('logPrice').value), status: document.getElementById('logStatus').value };
    if (!data.sender) return alert('Sender required');
    if(id) { await apiCall(`/admin/logistics/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/logistics', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('logisticsModal').style.display = 'none';
    loadLogistics();
});
document.getElementById('cancelLogisticsBtn')?.addEventListener('click', () => document.getElementById('logisticsModal').style.display = 'none');

// Virtual numbers
async function loadVirtual() { const items = await apiCall('/admin/virtualnums'); let html = '<table class="admin-table"><thead><tr><th>Number</th><th>Country</th><th>Service</th><th>Price</th><th>Partner</th><th>Actions</th></tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.number}</td><td>${i.country}</td><td>${i.service}</td><td>$${i.price}</td><td>${i.partner}</td><td><button class="btn" onclick="editVirtual('${i.id}')">Edit</button> <button class="btn" onclick="deleteVirtual('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></tr>'; document.getElementById('virtualTable').innerHTML = html; }
window.editVirtual = async (id) => { const items = await apiCall('/admin/virtualnums'); const i = items.find(i => i.id === id); if(i){ document.getElementById('virtualNumber').value = i.number; document.getElementById('virtualCountry').value = i.country; document.getElementById('virtualService').value = i.service; document.getElementById('virtualPrice').value = i.price; document.getElementById('virtualPartner').value = i.partner; document.getElementById('editingVirtualId').value = id; document.getElementById('virtualModal').style.display = 'block'; } };
window.deleteVirtual = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/virtualnums/${id}`, { method: 'DELETE' }); loadVirtual(); };
document.getElementById('addVirtualBtn')?.addEventListener('click', () => { document.getElementById('virtualModal').style.display = 'block'; document.getElementById('editingVirtualId').value = ''; });
document.getElementById('saveVirtualBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingVirtualId').value;
    const data = { number: document.getElementById('virtualNumber').value, country: document.getElementById('virtualCountry').value, service: document.getElementById('virtualService').value, price: parseFloat(document.getElementById('virtualPrice').value), partner: document.getElementById('virtualPartner').value };
    if (!data.number) return alert('Number required');
    if(id) { await apiCall(`/admin/virtualnums/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/virtualnums', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('virtualModal').style.display = 'none';
    loadVirtual();
});
document.getElementById('cancelVirtualBtn')?.addEventListener('click', () => document.getElementById('virtualModal').style.display = 'none');

// Web requests
async function loadWebReqs() { const items = await apiCall('/admin/webrequests'); let html = '<table class="admin-table"><thead><tr><th>Client</th><th>Email</th><th>Type</th><th>Budget</th><th>Actions</th></tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.client}</td><td>${i.email}</td><td>${i.type}</td><td>$${i.budget}</td><td><button class="btn" onclick="editWebReq('${i.id}')">Edit</button> <button class="btn" onclick="deleteWebReq('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></table>'; document.getElementById('webReqsTable').innerHTML = html; }
window.editWebReq = async (id) => { const items = await apiCall('/admin/webrequests'); const i = items.find(i => i.id === id); if(i){ document.getElementById('webClient').value = i.client; document.getElementById('webEmail').value = i.email; document.getElementById('webType').value = i.type; document.getElementById('webReqs').value = i.requirements; document.getElementById('webBudget').value = i.budget; document.getElementById('editingWebReqId').value = id; document.getElementById('webReqModal').style.display = 'block'; } };
window.deleteWebReq = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/webrequests/${id}`, { method: 'DELETE' }); loadWebReqs(); };
document.getElementById('addWebReqBtn')?.addEventListener('click', () => { document.getElementById('webReqModal').style.display = 'block'; document.getElementById('editingWebReqId').value = ''; });
document.getElementById('saveWebReqBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingWebReqId').value;
    const data = { client: document.getElementById('webClient').value, email: document.getElementById('webEmail').value, type: document.getElementById('webType').value, requirements: document.getElementById('webReqs').value, budget: parseFloat(document.getElementById('webBudget').value) };
    if (!data.client) return alert('Client required');
    if(id) { await apiCall(`/admin/webrequests/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/webrequests', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('webReqModal').style.display = 'none';
    loadWebReqs();
});
document.getElementById('cancelWebReqBtn')?.addEventListener('click', () => document.getElementById('webReqModal').style.display = 'none');

// Credential forms
async function loadCredForms() { const items = await apiCall('/admin/credforms'); let html = '<table class="admin-table"><thead><tr><th>Name</th><th>Fields Preview</th><th>Actions</th></tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.name}</td><td>${i.fields.substring(0,50)}...</td><td><button class="btn" onclick="editCredForm('${i.id}')">Edit</button> <button class="btn" onclick="deleteCredForm('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></table>'; document.getElementById('credFormsTable').innerHTML = html; }
window.editCredForm = async (id) => { const items = await apiCall('/admin/credforms'); const i = items.find(i => i.id === id); if(i){ document.getElementById('formName').value = i.name; document.getElementById('formFields').value = i.fields; document.getElementById('editingCredFormId').value = id; document.getElementById('credFormModal').style.display = 'block'; } };
window.deleteCredForm = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/credforms/${id}`, { method: 'DELETE' }); loadCredForms(); };
document.getElementById('addCredFormBtn')?.addEventListener('click', () => { document.getElementById('credFormModal').style.display = 'block'; document.getElementById('editingCredFormId').value = ''; });
document.getElementById('saveCredFormBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingCredFormId').value;
    const data = { name: document.getElementById('formName').value, fields: document.getElementById('formFields').value };
    if (!data.name) return alert('Name required');
    if(id) { await apiCall(`/admin/credforms/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/credforms', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('credFormModal').style.display = 'none';
    loadCredForms();
});
document.getElementById('cancelCredFormBtn')?.addEventListener('click', () => document.getElementById('credFormModal').style.display = 'none');

// Cloud requests
async function loadCloudReqs() { const items = await apiCall('/admin/cloudreqs'); let html = '<table class="admin-table"><thead><tr><th>Customer</th><th>Service</th><th>Domain</th><th>Telegram</th><th>Actions</th><tr></thead><tbody>'; items.forEach(i => { html += `<tr><td>${i.customer}</td><td>${i.serviceType}</td><td>${i.domain}</td><td>${i.sentToTelegram ? '✅' : '❌'}</td><td><button class="btn" onclick="editCloudReq('${i.id}')">Edit</button> <button class="btn" onclick="deleteCloudReq('${i.id}')">Delete</button></td></tr>`; }); html += '</tbody></table>'; document.getElementById('cloudReqsTable').innerHTML = html; }
window.editCloudReq = async (id) => { const items = await apiCall('/admin/cloudreqs'); const i = items.find(i => i.id === id); if(i){ document.getElementById('cloudCustomer').value = i.customer; document.getElementById('cloudEmail').value = i.email; document.getElementById('cloudService').value = i.serviceType; document.getElementById('cloudDomain').value = i.domain; document.getElementById('cloudDetails').value = i.details; document.getElementById('editingCloudReqId').value = id; document.getElementById('cloudReqModal').style.display = 'block'; } };
window.deleteCloudReq = async (id) => { if (confirm('Delete?')) await apiCall(`/admin/cloudreqs/${id}`, { method: 'DELETE' }); loadCloudReqs(); };
document.getElementById('addCloudReqBtn')?.addEventListener('click', () => { document.getElementById('cloudReqModal').style.display = 'block'; document.getElementById('editingCloudReqId').value = ''; });
document.getElementById('saveCloudReqBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingCloudReqId').value;
    const data = { customer: document.getElementById('cloudCustomer').value, email: document.getElementById('cloudEmail').value, serviceType: document.getElementById('cloudService').value, domain: document.getElementById('cloudDomain').value, details: document.getElementById('cloudDetails').value, sentToTelegram: true };
    if (!data.customer) return alert('Customer required');
    if(id) { await apiCall(`/admin/cloudreqs/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/cloudreqs', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('cloudReqModal').style.display = 'none';
    loadCloudReqs();
});
document.getElementById('cancelCloudReqBtn')?.addEventListener('click', () => document.getElementById('cloudReqModal').style.display = 'none');

// Blog
async function loadBlog() { const items = await apiCall('/blog'); let html = '<table class="admin-table"><thead><tr><th>Title</th><th>Date</th><th>Actions</th><tr></thead><tbody>'; items.forEach(p => { html += `<tr><td>${p.title}</td><td>${new Date(p.created_at).toLocaleDateString()}</td><td><button class="btn" onclick="editPost('${p.id}')">Edit</button> <button class="btn" onclick="deletePost('${p.id}')">Delete</button></td><tr>`; }); html += '</tbody></table>'; document.getElementById('blogTable').innerHTML = html; }
window.editPost = async (id) => { const post = await (await fetch(`${API}/blog/${id}`)).json(); if(post){ document.getElementById('postTitle').value = post.title; document.getElementById('postContent').value = post.content; document.getElementById('editingPostId').value = id; document.getElementById('blogModal').style.display = 'block'; } };
window.deletePost = async (id) => { if (confirm('Delete post?')) await apiCall(`/admin/blog/${id}`, { method: 'DELETE' }); loadBlog(); };
document.getElementById('addPostBtn')?.addEventListener('click', () => { document.getElementById('blogModal').style.display = 'block'; document.getElementById('editingPostId').value = ''; });
document.getElementById('savePostBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('editingPostId').value;
    const data = { title: document.getElementById('postTitle').value, content: document.getElementById('postContent').value, category: 'general' };
    if (!data.title) return alert('Title required');
    if(id) { await apiCall(`/admin/blog/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
    else { await apiCall('/admin/blog', { method: 'POST', body: JSON.stringify(data) }); }
    document.getElementById('blogModal').style.display = 'none';
    loadBlog();
});
document.getElementById('cancelPostBtn')?.addEventListener('click', () => document.getElementById('blogModal').style.display = 'none');

// Visitors
async function loadVisitors() {
    const visitors = await apiCall('/admin/visitors');
    let html = '<table class="admin-table"><thead><tr><th>IP</th><th>Location</th><th>VPN</th><th>Page</th><th>Time</th></tr></thead><tbody>';
    visitors.forEach(v => { html += `<tr><td>${v.ip}</td><td>${v.location || '-'}</td><td>${v.vpn ? '⚠️' : 'NO'}</td><td>${v.page}</td><td>${new Date(v.timestamp).toLocaleString()}</td></tr>`; });
    html += '</tbody></table>';
    document.getElementById('visitorsTable').innerHTML = html;
}

// Helper
async function getEmailById(id) {
    const users = await apiCall('/admin/users');
    const u = users.find(u => u.id === id);
    return u ? u.email : null;
}

function attachAllEventListeners() {
    const themeBtn = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'light') document.body.classList.add('light');
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light');
        themeBtn.textContent = document.body.classList.contains('light') ? '☀️' : '🌓';
        localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
    });
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('adminToken');
        window.location.href = 'index.html';
    });
}

// Initialize: check existing token, else show login modal
(async () => {
    const isAuthed = await checkAdminAuth();
    if (isAuthed) {
        showAdminDashboard();
    } else {
        document.getElementById('adminLoginModal').style.display = 'flex';
        document.getElementById('adminLoginBtn').addEventListener('click', async () => {
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;
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
                    document.getElementById('adminLoginError').innerText = data.error || 'Invalid credentials';
                }
            } catch(e) {
                document.getElementById('adminLoginError').innerText = 'Connection failed';
            }
        });
    }
})();

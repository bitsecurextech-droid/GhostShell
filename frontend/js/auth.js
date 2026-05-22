const API = '/api';
let currentUser = null;

async function initAuth(pageName) {
    const token = localStorage.getItem('ghost_token');
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    try {
        const res = await fetch(`${API}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
            localStorage.removeItem('ghost_token');
            window.location.href = 'index.html';
            return false;
        }
        const data = await res.json();
        currentUser = data.user;
        buildNav(pageName);
        return true;
    } catch (e) {
        window.location.href = 'index.html';
        return false;
    }
}

function buildNav(activePage) {
    const nav = document.getElementById('mainNav');
    if (!nav) return;
    const pages = [
        { name: 'dashboard', label: '⌖ Ops Center', href: 'dashboard.html' },
        { name: 'tools', label: '⚔️ Cyber Tools', href: 'tools.html' },
        { name: 'chat', label: '💬 Secure Comms', href: 'chat.html' },
        { name: 'ai', label: '🧠 AI Assistant', href: 'ai.html' },
        { name: 'marketplace', label: '🛒 Marketplace', href: 'marketplace.html' }
    ];
    if (currentUser && currentUser.role === 'admin') {
        pages.push({ name: 'admin', label: '⚙️ Admin', href: 'admin.html' });
    }
    nav.innerHTML = '';
    pages.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'nav-link' + (p.name === activePage ? ' active' : '');
        btn.textContent = p.label;
        btn.addEventListener('click', () => { window.location.href = p.href; });
        nav.appendChild(btn);
    });
}

function logout() {
    localStorage.removeItem('ghost_token');
    window.location.href = 'index.html';
}

// ── CINEMATIC POPUP SYSTEM ──
function showPopup(title, message, isGranted = false) {
    const existing = document.querySelector('.popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.8); display: flex; align-items: center;
        justify-content: center; z-index: 9999; animation: fadeIn 0.3s ease;
    `;
    const box = document.createElement('div');
    box.style.cssText = `
        background: rgba(10,10,20,0.95); border: 2px solid ${isGranted ? '#00ff41' : '#ff1a1a'};
        border-radius: 16px; padding: 30px; text-align: center; max-width: 450px;
        box-shadow: ${isGranted ? '0 0 40px rgba(0,255,65,0.6)' : '0 0 40px rgba(255,0,0,0.6)'};
        font-family: var(--font-mono); animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    box.innerHTML = `
        <h3 style="color:${isGranted ? 'var(--green)' : 'var(--red)'}; margin-bottom:10px;">${title}</h3>
        <p style="color:#ccc;">${message}</p>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2500);
}
// js/common.js – Unified header for all pages
const API = '/api';
let currentUser = null;

function buildNav() {
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
        { name: 'blog', label: '💀 Blog', href: 'blog.html' }
    ];
    }
    nav.innerHTML = '';
    pages.forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'nav-link' + (window.location.pathname.includes(p.href) ? ' active' : '');
        btn.textContent = p.label;
        btn.addEventListener('click', () => window.location.href = p.href);
        nav.appendChild(btn);
    });
}

// Theme toggle
function initThemeToggle() {
    const themeBtn = document.getElementById('themeToggle');
    if (!themeBtn) return;
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        themeBtn.textContent = '☀️';
    }
    themeBtn.addEventListener('click', () => {
        document.body.classList.toggle('light');
        const isLight = document.body.classList.contains('light');
        themeBtn.textContent = isLight ? '☀️' : '🌓';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
}

// Logout handler
function initLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('ghost_token');
            window.location.href = 'index.html';
        });
    }
}

// Authentication check – redirects to index if not logged in
async function checkAuth() {
    const token = localStorage.getItem('ghost_token');
    if (!token) {
        window.location.href = 'index.html';
        return false;
    }
    try {
        const res = await fetch(`${API}/verify`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        currentUser = data.user;
        return true;
    } catch (e) {
        localStorage.removeItem('ghost_token');
        window.location.href = 'index.html';
        return false;
    }
}

// Initialize common components on every page
async function initCommon() {
    const authenticated = await checkAuth();
    if (!authenticated) return false;
    buildNav();
    initThemeToggle();
    initLogout();
    return true;
}

// API helper (with token)
async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('ghost_token');
    const res = await fetch(`${API}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
    if (res.status === 401) {
        localStorage.removeItem('ghost_token');
        window.location.href = 'index.html';
        throw new Error('Unauthorized');
    }
    return res.json();
}

// Helper to strip HTML for excerpts
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

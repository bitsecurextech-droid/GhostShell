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
        { name: 'blog', label: '💀 Blog', href: 'blog.html' }
    ];
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'full_admin')) {
        pages.push({ name: 'admin', label: '⚙️ Admin', href: 'admin.html' });
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

// The rest of your common.js (initCommon, checkAuth, themeToggle, logout, apiCall) remains unchanged.
// Make sure you keep those functions as they are.

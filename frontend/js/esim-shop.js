// js/esim-shop.js
(async () => {
    const ok = await initCommon();
    if (!ok) return;

    await loadEsimPlans();

    async function loadEsimPlans() {
        const container = document.getElementById('plansContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading">Loading eSIM plans...</div>';
        try {
            const plans = await apiCall('/esim');
            if (!plans.length) {
                container.innerHTML = '<p>No eSIM plans available.</p>';
                return;
            }
            let html = '';
            plans.forEach(p => {
                html += `
                    <div class="plan-card">
                        <h3>${escapeHtml(p.name)}</h3>
                        <p><strong>Duration:</strong> ${escapeHtml(p.duration)}</p>
                        <p><strong>Data:</strong> ${escapeHtml(p.data)}</p>
                        <p><strong>Voice:</strong> ${escapeHtml(p.voice)}</p>
                        <div class="price">$${p.price}</div>
                        <button class="btn" onclick="alert('Contact admin to purchase: ${escapeHtml(p.name)}')">Buy eSIM</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = '<p style="color:red;">Failed to load eSIM plans.</p>';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }
})();

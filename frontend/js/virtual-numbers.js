// js/virtual-numbers.js
(async () => {
    const ok = await initCommon();
    if (!ok) return;

    await loadVirtualNumbers();

    async function loadVirtualNumbers() {
        const container = document.getElementById('numbersContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading">Loading virtual numbers...</div>';
        try {
            const numbers = await apiCall('/virtualnums');
            if (!numbers.length) {
                container.innerHTML = '<p>No virtual numbers available.</p>';
                return;
            }
            let html = '';
            numbers.forEach(n => {
                html += `
                    <div class="number-card">
                        <h3>📱 ${escapeHtml(n.number)}</h3>
                        <p><strong>Country:</strong> ${escapeHtml(n.country)}</p>
                        <p><strong>Service:</strong> ${escapeHtml(n.service)}</p>
                        <p><strong>Partner:</strong> ${escapeHtml(n.partner)}</p>
                        <div class="price">$${n.price}</div>
                        <button class="btn" onclick="alert('Contact admin to purchase: ${escapeHtml(n.number)}')">Buy Now</button>
                    </div>
                `;
            });
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = '<p style="color:red;">Failed to load virtual numbers.</p>';
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

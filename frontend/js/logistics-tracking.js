// js/logistics-tracking.js
(async () => {
    const ok = await initCommon();
    if (!ok) return;

    await loadLogisticsOrders();

    async function loadLogisticsOrders() {
        const container = document.getElementById('ordersContainer');
        if (!container) return;
        container.innerHTML = '<div class="loading">Loading delivery orders...</div>';
        try {
            const orders = await apiCall('/logistics');
            if (!orders.length) {
                container.innerHTML = '<p>No delivery orders found.</p>';
                return;
            }
            let html = `
                <table class="order-table">
                    <thead>
                        <tr><th>Tracking ID</th><th>Sender</th><th>Receiver</th><th>Address</th><th>Package</th><th>Weight</th><th>Fee</th><th>Status</th></tr>
                    </thead>
                    <tbody>
            `;
            orders.forEach(o => {
                let statusClass = '';
                if (o.status === 'pending') statusClass = 'status-pending';
                else if (o.status === 'in_transit') statusClass = 'status-in_transit';
                else if (o.status === 'delivered') statusClass = 'status-delivered';
                html += `
                    <tr>
                        <td>${o.id.slice(-8)}</td>
                        <td>${escapeHtml(o.sender)}</td>
                        <td>${escapeHtml(o.receiver)}</td>
                        <td>${escapeHtml(o.address)}</td>
                        <td>${escapeHtml(o.package)}</td>
                        <td>${o.weight} kg</td>
                        <td>$${o.price}</td>
                        <td class="${statusClass}">${o.status.replace('_', ' ')}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        } catch (error) {
            container.innerHTML = '<p style="color:red;">Failed to load delivery orders.</p>';
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

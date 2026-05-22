'/api';
let currentTool = null;
let btcRate = 62000;

(async () => {
    const loggedIn = await initAuth('marketplace');
    if (!loggedIn) return;

    await fetchBTCPrice();
    loadShopTools();
    loadMyTools();
})();

async function fetchBTCPrice() {
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        const data = await res.json();
        btcRate = data.bitcoin.usd;
    } catch(e) { console.log('BTC price error'); }
}

async function loadShopTools() {
    const container = document.getElementById('shopTools');
    try {
        const res = await fetch(`${API}/tools`);
        const tools = await res.json();
        if (!tools.length) {
            container.innerHTML = '<p>No tools available yet.</p>';
            return;
        }
        container.innerHTML = '';
        tools.forEach(tool => {
            const card = document.createElement('div');
            card.className = 'card shop-card';
            card.innerHTML = `
                <h3>${tool.name}</h3>
                <p style="font-size:0.8rem;color:#888;">${tool.description || ''}</p>
                <div class="price">$${tool.priceUSD}</div>
                <button class="btn" onclick="openBuyModal('${tool._id}', '${tool.name.replace(/'/g, "\\'")}', ${tool.priceUSD})">BUY WITH BTC</button>
            `;
            container.appendChild(card);
        });
    } catch(e) {
        container.innerHTML = '<p style="color:red;">Failed to load tools.</p>';
    }
}

async function loadMyTools() {
    const container = document.getElementById('myTools');
    try {
        const token = localStorage.getItem('ghost_token');
        const res = await fetch(`${API}/my-tools`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tools = await res.json();
        if (!tools.length) {
            container.innerHTML = '<p>No purchases yet.</p>';
            return;
        }
        let html = '<table class="admin-table my-tools-table"><tr><th>Tool</th><th>Purchased</th><th>Download</th></tr>';
        tools.forEach(item => {
            const tool = item.toolId;
            if (!tool) return;
            html += `<tr>
                <td>${tool.name}</td>
                <td>${new Date(item.purchasedAt).toLocaleDateString()}</td>
                <td><a href="${tool.downloadUrl}" class="btn" target="_blank">DOWNLOAD</a></td>
            </tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<p style="color:red;">Failed to load your tools.</p>';
    }
}

function openBuyModal(id, name, priceUSD) {
    currentTool = { id, name, priceUSD };
    const btcAmount = (priceUSD / btcRate).toFixed(6);
    document.getElementById('modalToolName').innerText = name;
    document.getElementById('modalUSD').innerText = priceUSD;
    document.getElementById('modalBTC').innerText = btcAmount;
    document.getElementById('btcModal').style.display = 'flex';
}

function closeBTCModal() {
    document.getElementById('btcModal').style.display = 'none';
    currentTool = null;
    document.getElementById('paymentScreenshot').value = '';
}

document.getElementById('confirmPaymentBtn').addEventListener('click', async () => {
    if (!currentTool) return;
    const fileInput = document.getElementById('paymentScreenshot');
    if (!fileInput.files[0]) { alert('Upload a payment screenshot.'); return; }
    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];
        const token = localStorage.getItem('ghost_token');
        const res = await fetch(`${API}/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                toolId: currentTool.id,
                amountUSD: currentTool.priceUSD,
                amountBTC: (currentTool.priceUSD / btcRate).toFixed(6),
                screenshotBase64: base64
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('Payment proof submitted. Admin will review within 24h.');
            closeBTCModal();
            loadMyTools();
        } else {
            alert('Submission failed.');
        }
    };
    reader.readAsDataURL(fileInput.files[0]);
});
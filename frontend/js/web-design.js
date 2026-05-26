// js/web-design.js
const API = '/api';
let currentUser = null;

async function initPage() {
    const ok = await initCommon();
    if (!ok) return;

    const categories = [
        'Logistics / Courier Website', 'Military / Defense', 'Construction Company',
        'Booking & Entertainment (Celebrities)', 'Flight Booking (Airline)', 'Logistics Company',
        'Online Banking / Fintech', 'Landing Page', 'Credential Harvesting Form (for companies)',
        'E‑commerce Store', 'Educational Platform', 'Portfolio / Agency', 'Blog / News'
    ];
    const extras = [
        'Website Maintenance & Updates', 'Website Redesign', 'Strong SEO / Link Building',
        'Google My Business Optimization', 'Cloud Hosting Setup', 'Domain Registration',
        'Custom Credential Form Builder', 'Website Security Hardening'
    ];
    const catContainer = document.getElementById('websiteCategories');
    if (catContainer) {
        catContainer.innerHTML = categories.map(c => `<div class="service-tag" onclick="document.getElementById('projectDetails').value += 'I need a ${c} website.\\n';">${c}</div>`).join('');
    }
    const extraContainer = document.getElementById('extraServices');
    if (extraContainer) {
        extraContainer.innerHTML = extras.map(e => `<div class="service-tag" onclick="document.getElementById('serviceType').value='${e}'; document.getElementById('projectDetails').value += 'I am interested in: ${e}.\\n';">${e}</div>`).join('');
    }

    const sendBtn = document.getElementById('sendRequestBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            const name = document.getElementById('clientName').value.trim();
            const email = document.getElementById('clientEmail').value.trim();
            const phone = document.getElementById('clientPhone').value.trim();
            const service = document.getElementById('serviceType').value;
            const goal = document.getElementById('websiteGoal').value.trim();
            const details = document.getElementById('projectDetails').value.trim();
            if (!name || !email || !phone || !details) {
                document.getElementById('requestFeedback').innerHTML = '❌ Please fill all required fields.';
                return;
            }
            const message = `New Web Design Request:\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nService type: ${service}\nGoal: ${goal}\nDetails: ${details}`;
            try {
                const res = await fetch(`${API}/contact`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, subject: 'Web Design Request', message, type: 'WebDev' })
                });
                const result = await res.json();
                if (result.success) {
                    const feedback = document.getElementById('requestFeedback');
                    feedback.innerHTML = '✅ Request sent! We will contact you via WhatsApp/Email within 24h.';
                    feedback.style.color = '#00ff41';
                    document.getElementById('clientName').value = '';
                    document.getElementById('clientEmail').value = '';
                    document.getElementById('clientPhone').value = '';
                    document.getElementById('websiteGoal').value = '';
                    document.getElementById('projectDetails').value = '';
                } else {
                    document.getElementById('requestFeedback').innerHTML = '❌ Failed to send request.';
                }
            } catch(e) {
                document.getElementById('requestFeedback').innerHTML = '❌ Connection error.';
            }
        });
    }
}

initPage();

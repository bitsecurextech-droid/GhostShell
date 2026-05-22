const API = 'http://localhost:5000/api';

// ── BOOT SEQUENCE ──
(function bootSequence() {
    const bootScreen = document.getElementById('bootScreen');
    const bootLog = document.getElementById('bootLog');
    const bootBar = document.getElementById('bootBar');
    const bootPercent = document.getElementById('bootPercent');
    const bootWarning = document.getElementById('bootWarning');
    const authContainer = document.getElementById('authContainer');

    const messages = [
        'Initializing Tactical System...',
        'Loading kernel modules... [OK]',
        'Mounting encrypted volumes... [OK]',
        'Connecting to Satellite Grid...',
        'Handshake established — LAT 34.05 LON -118.24',
        'Decrypting Intelligence Files... [25%]',
        'Verifying secure enclave... [OK]',
        'Loading AI inference engine...',
        'Establishing dark net relay... [OK]',
        'System integrity check... [PASSED]',
        'Arming cyber defense matrix...',
        'All systems nominal — Ready for authentication'
    ];

    let step = 0;
    let progress = 0;
    const interval = setInterval(() => {
        if (step < messages.length) {
            bootLog.innerHTML += '> ' + messages[step] + '<br>';
            step++;
            bootLog.scrollTop = bootLog.scrollHeight;
            progress = Math.min(100, Math.floor((step / messages.length) * 100));
            bootBar.style.width = progress + '%';
            bootPercent.textContent = progress + '%';
            if (progress > 60 && progress < 80) {
                bootWarning.style.display = 'block';
            } else {
                bootWarning.style.display = 'none';
            }
        } else {
            clearInterval(interval);
            bootBar.style.width = '100%';
            bootPercent.textContent = '100%';
            setTimeout(() => {
                bootScreen.classList.add('hidden');
                authContainer.style.display = 'flex';
                initAuthPage();
            }, 600);
        }
    }, 300);
})();

// ── AUTH PAGE LOGIC ──
function initAuthPage() {
    detectIP();
    switchMode('login');

    // Toggle forms
    document.getElementById('loginToggleBtn').addEventListener('click', () => switchMode('login'));
    document.getElementById('signupToggleBtn').addEventListener('click', () => switchMode('signup'));
    document.getElementById('requestToggleBtn').addEventListener('click', () => switchMode('request'));

    // Login
    document.getElementById('loginBtn').addEventListener('click', async () => {
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) return updateFeedback('❌ All fields required', true);
        try {
            const res = await fetch(`${API}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('ghost_token', data.token);
                updateFeedback('✅ ACCESS GRANTED. REDIRECTING...');
                playSound('granted');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1200);
            } else {
                updateFeedback('❌ ' + (data.error || 'Invalid credentials'), true);
            }
        } catch (e) { updateFeedback('❌ Connection failed', true); }
    });

    // Signup
    document.getElementById('signupBtn').addEventListener('click', async () => {
        const username = document.getElementById('signupUser').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPass').value;
        const accessCode = document.getElementById('signupCode').value.trim();
        if (!username || !email || !password || !accessCode) return updateFeedback('❌ All fields required', true);
        try {
            updateFeedback('⚡ Generating device fingerprint...');
            const fingerprint = await getFingerprint();
            const res = await fetch(`${API}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password, accessCode, fingerprint })
            });
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('ghost_token', data.token);
                updateFeedback('✅ SIGNUP SUCCESSFUL. REDIRECTING...');
                playSound('granted');
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
            } else {
                updateFeedback('❌ ' + (data.error || 'Signup failed'), true);
            }
        } catch (e) { updateFeedback('❌ Connection failed', true); }
    });

    // Request free access code
    document.getElementById('requestCodeBtn').addEventListener('click', async () => {
        const email = document.getElementById('requestEmail').value.trim();
        if (!email) {
            document.getElementById('requestMsg').textContent = '❌ Email required.';
            return;
        }
        try {
            // We'll reuse the request-access-code endpoint (or create a new one)
            const res = await fetch(`${API}/request-access-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('requestMsg').textContent = '✅ Request received. Check your email within 24h.';
            } else {
                document.getElementById('requestMsg').textContent = '❌ Request failed. Try again.';
            }
        } catch (e) {
            document.getElementById('requestMsg').textContent = '❌ Connection error.';
        }
    });
}

function switchMode(mode) {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('requestForm').classList.add('hidden');
    if (mode === 'login') document.getElementById('loginForm').classList.remove('hidden');
    if (mode === 'signup') document.getElementById('signupForm').classList.remove('hidden');
    if (mode === 'request') document.getElementById('requestForm').classList.remove('hidden');

    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`${mode}ToggleBtn`).classList.add('active');
}

function updateFeedback(msg, isError = false) {
    const fb = document.getElementById('systemFeedback');
    fb.innerHTML = msg;
    fb.className = 'scan-feedback' + (isError ? ' danger-message' : '');
    if (isError) {
        const flash = document.createElement('div');
        flash.className = 'warning-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 350);
    }
}

// ── IP detection ──
async function detectIP() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        document.getElementById('ipTracker').innerHTML = `🌍 IP: ${data.ip} | ${data.city}, ${data.country_name}`;
    } catch(e) {
        document.getElementById('ipTracker').innerHTML = '🌍 Location detection failed.';
    }
}

// ── Audio simulation ──
let audioEnabled = true;
let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioEnabled) return;
    try { initAudio(); } catch(e) { return; }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    if (type === 'denied') { osc.frequency.value = 90; gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.0001, now+1.2); osc.type='square'; osc.start(); osc.stop(now+1.3); }
    else if (type === 'granted') { osc.frequency.value = 640; gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.0001, now+0.6); osc.type='sine'; osc.start(); osc.stop(now+0.7); }
    else if (type === 'glitch') { osc.frequency.value=320; gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.0001, now+0.3); osc.type='sawtooth'; osc.start(); osc.stop(now+0.35); }
}
function toggleAudio() {
    audioEnabled = !audioEnabled;
    document.getElementById('audioControl').innerHTML = audioEnabled ? '🔊 SOUND: ACTIVE' : '🔇 SOUND: MUTED';
}
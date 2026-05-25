(async () => {
    const ok = await initCommon();
    if (!ok) return;

    // ---- YOUR EXISTING CODE GOES BELOW ----
    (async () => {
    const loggedIn = await initAuth('dashboard');
    if (!loggedIn) return;

    // Display user info
    document.getElementById('accessCodeDisplay').textContent = currentUser.accessCode || 'Pending';
    document.getElementById('threatLevelDisplay').textContent = currentUser.approved ? 'DELTA' : 'PENDING';
    const uplinkEl = document.getElementById('uplinkSpeed');
    setInterval(() => {
        uplinkEl.textContent = (2 + Math.random() * 3).toFixed(1) + ' Gbps';
    }, 2000);

    // Quick action buttons
    document.querySelectorAll('.quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = btn.dataset.href;
        });
    });

    // Mini terminal
    const miniTerm = document.getElementById('miniTerminal');
    const fakeLogs = [
        '> Port 443 open (HTTPS)',
        '> SSH fingerprint verified.',
        '> Threat signature updated.',
        '> Satellite link nominal.',
        '> 0x0045a1: buffer overflow blocked.',
        '> AI model retrained (99.7%).'
    ];
    let logIndex = 0;
    setInterval(() => {
        const line = fakeLogs[logIndex % fakeLogs.length];
        miniTerm.innerHTML += `<br>${line}`;
        miniTerm.scrollTop = miniTerm.scrollHeight;
        logIndex++;
        const lines = miniTerm.innerHTML.split('<br>');
        if (lines.length > 8) miniTerm.innerHTML = lines.slice(lines.length - 8).join('<br>');
    }, 3000);

    // ── 3D Globe Animation ──
    const globeCanvas = document.getElementById('globeCanvas');
    if (globeCanvas) {
        const gctx = globeCanvas.getContext('2d');
        const container = document.getElementById('globeContainer');
        let globeRotation = 0;
        const nodes = [];
        for (let i = 0; i < 50; i++) {
            const lat = (Math.random() - 0.5) * Math.PI;
            const lon = Math.random() * Math.PI * 2;
            nodes.push({
                lat, lon,
                size: Math.random() * 2 + 1,
                pulse: Math.random() * Math.PI * 2,
                pulseSpeed: Math.random() * 0.03 + 0.01,
                color: ['#ff1a1a', '#00ff41', '#00b4ff', '#b347ea'][Math.floor(Math.random() * 4)]
            });
        }

        function resizeGlobe() {
            globeCanvas.width = container.clientWidth;
            globeCanvas.height = container.clientHeight;
        }
        resizeGlobe();
        window.addEventListener('resize', resizeGlobe);

        function drawGlobe() {
            const w = globeCanvas.width;
            const h = globeCanvas.height;
            if (!w || !h) return;

            gctx.clearRect(0, 0, w, h);
            const cx = w / 2;
            const cy = h / 2;
            const r = Math.min(w, h) * 0.38;

            const grad = gctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
            grad.addColorStop(0, 'rgba(0,180,255,0.15)');
            grad.addColorStop(0.7, 'rgba(0,40,80,0.5)');
            grad.addColorStop(1, 'rgba(0,10,30,0.9)');
            gctx.beginPath();
            gctx.arc(cx, cy, r, 0, Math.PI * 2);
            gctx.fillStyle = grad;
            gctx.fill();
            gctx.strokeStyle = 'rgba(255,0,0,0.5)';
            gctx.lineWidth = 1.5;
            gctx.stroke();

            gctx.strokeStyle = 'rgba(0,255,65,0.08)';
            gctx.lineWidth = 0.5;
            for (let lat = -60; lat <= 60; lat += 30) {
                const ly = cy + Math.sin(lat * Math.PI / 180) * r;
                const lr = Math.cos(lat * Math.PI / 180) * r;
                gctx.beginPath();
                gctx.ellipse(cx, ly, lr, r * 0.08, 0, 0, Math.PI * 2);
                gctx.stroke();
            }
            for (let lon = 0; lon < 360; lon += 45) {
                const angle = (lon + globeRotation * 40) * Math.PI / 180;
                gctx.beginPath();
                gctx.moveTo(cx, cy - r);
                const ex = cx + Math.sin(angle) * r;
                gctx.quadraticCurveTo(cx + Math.sin(angle) * r * 1.4, cy, ex, cy + r);
                gctx.stroke();
            }

            nodes.forEach(node => {
                const lonRot = node.lon + globeRotation;
                const x3d = Math.cos(node.lat) * Math.sin(lonRot);
                const y3d = Math.sin(node.lat);
                const z3d = Math.cos(node.lat) * Math.cos(lonRot);
                if (z3d > 0) {
                    const sx = cx + x3d * r;
                    const sy = cy - y3d * r;
                    const alpha = z3d;
                    gctx.beginPath();
                    gctx.arc(sx, sy, node.size * alpha, 0, Math.PI * 2);
                    gctx.fillStyle = node.color;
                    gctx.globalAlpha = alpha * 0.9;
                    gctx.fill();
                    gctx.beginPath();
                    gctx.arc(sx, sy, node.size * 2.5 * alpha, 0, Math.PI * 2);
                    gctx.fillStyle = node.color;
                    gctx.globalAlpha = alpha * 0.2;
                    gctx.fill();
                    gctx.globalAlpha = 1;
                }
            });

            gctx.beginPath();
            gctx.ellipse(cx, cy, r * 1.25, r * 0.15, 0.35, 0, Math.PI * 2);
            gctx.strokeStyle = 'rgba(179,71,234,0.3)';
            gctx.lineWidth = 1;
            gctx.setLineDash([6, 15]);
            gctx.stroke();
            gctx.setLineDash([]);

            globeRotation += 0.004;
            requestAnimationFrame(drawGlobe);
        }
        drawGlobe();
    }

    // ── CINEMATIC POPUPS (placed here, outside the globe block) ──
    function triggerRandomPopup() {
        const popups = [
            { title: '🛰 SATELLITE LINK ESTABLISHED', msg: 'SAT-7G uplink confirmed. Streaming threat intel.', granted: true },
            { title: '⚠ FIREWALL BYPASS ATTEMPT', msg: 'Anomalous traffic from 45.33.22.11 blocked.', granted: false },
            { title: '🧠 AI CORE ACTIVE', msg: 'Neural network processing 1.2M packets/sec.', granted: true },
            { title: '🔴 INTRUSION DETECTED', msg: 'SSH brute force on node 12. Auto-ban engaged.', granted: false },
            { title: '📡 SIGNAL INTERCEPT', msg: 'Encrypted transmission captured. Decrypting...', granted: true },
            { title: '💀 GHOST PROTOCOL ACTIVE', msg: 'All systems locked down. Awaiting command.', granted: false }
        ];
        const pop = popups[Math.floor(Math.random() * popups.length)];
        showPopup(pop.title, pop.msg, pop.granted);
    }
    setInterval(triggerRandomPopup, 20000 + Math.random() * 15000);
    setTimeout(triggerRandomPopup, 5000);
})();
    })();

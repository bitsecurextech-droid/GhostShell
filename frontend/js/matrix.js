(function() {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let drops = [];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ｦｧｨｩｪｫｬｭｮｯｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const colSize = 14;
        const cols = Math.floor(canvas.width / colSize);
        drops = [];
        for (let i = 0; i < cols; i++) {
            drops[i] = Math.floor(Math.random() * canvas.height / colSize) * -1;
        }
    }
    resize();
    window.addEventListener('resize', resize);
    function draw() {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0';
        ctx.font = '14px monospace';
        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(char, i * 14, drops[i] * 14);
            if (drops[i] * 14 > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }
    setInterval(draw, 40);
})();
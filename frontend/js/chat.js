(async () => {
    const ok = await initCommon();
    if (!ok) return;

    // ---- YOUR EXISTING CODE GOES BELOW ----
    (async () => {
    const loggedIn = await initAuth('chat');
    if (!loggedIn) return;

    const socket = io();
    const messages = document.getElementById('chatMessages');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendChatBtn');

    function addMessage(from, text, isSelf = false) {
        const div = document.createElement('div');
        div.className = 'msg';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `<span class="sender">${isSelf ? 'YOU' : from}:</span> ${text}<span class="time">${time}</span>`;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    sendBtn.addEventListener('click', () => {
        const msg = input.value.trim();
        if (msg) {
            socket.emit('chat message', msg);
            addMessage('You', msg, true);
            input.value = '';
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendBtn.click();
    });

    socket.on('chat message', (data) => {
        addMessage(data.from, data.text);
    });

    // Simulate a few historical messages
    addMessage('Cipher', 'Perimeter secure. All nodes green.');
    addMessage('ZeroDay', 'New CVE-2024 dropped. Patching now.');
    addMessage('ShadowOp', 'Intel received from darknet relay.');
})();
    })();

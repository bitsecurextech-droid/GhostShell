(async () => {
    const ok = await initCommon();
    if (!ok) return;

    // ---- YOUR EXISTING CODE GOES BELOW ----
    
// js/blog.js
(async () => {
    const ok = await initCommon();
    if (!ok) return;
    await loadPosts();
})();

async function loadPosts() {
    const container = document.getElementById('blogList');
    if (!container) return;
    // Show skeleton loaders
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const skel = document.createElement('div');
        skel.className = 'blog-card skeleton';
        skel.innerHTML = `
            <div class="skel-bar" style="width:70%; height:1.2rem; margin-bottom:10px;"></div>
            <div class="skel-bar" style="width:40%; height:0.7rem; margin-bottom:15px;"></div>
            <div class="skel-bar" style="width:100%; height:0.8rem; margin-bottom:6px;"></div>
            <div class="skel-bar" style="width:90%; height:0.8rem; margin-bottom:6px;"></div>
            <div class="skel-bar" style="width:60%; height:0.8rem;"></div>
        `;
        container.appendChild(skel);
    }

    try {
        const posts = await apiCall('/blog');
        container.innerHTML = '';
        if (!posts.length) {
            container.innerHTML = '<p style="color:#666; grid-column:1/-1; text-align:center;">No posts yet. Shadows are silent.</p>';
            return;
        }
        posts.forEach(post => {
            const card = document.createElement('div');
            card.className = 'blog-card';
            card.onclick = () => showSinglePost(post);
            const excerpt = stripHtml(post.content).substring(0, 180) + '...';
            card.innerHTML = `
                <h3>⚡ ${escapeHtml(post.title)}</h3>
                <div class="blog-meta">
                    <span>👤 ${escapeHtml(post.author || 'Anonymous')}</span>
                    <span>📅 ${new Date(post.createdAt).toLocaleDateString()}</span>
                    <span class="blog-category cat-${post.category || 'general'}">${post.category || 'general'}</span>
                </div>
                <div class="blog-excerpt">${excerpt}</div>
                <span class="read-more">⟫ READ FULL REPORT ⟪</span>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        container.innerHTML = '<p style="color:red; grid-column:1/-1;">Failed to load blog posts.</p>';
    }
}

function showSinglePost(post) {
    document.getElementById('blogList').style.display = 'none';
    const single = document.getElementById('singlePost');
    single.style.display = 'block';
    single.innerHTML = `
        <button class="btn back-btn" onclick="backToList()">← BACK TO BLOG</button>
        <div class="card" style="border-color:var(--red); box-shadow:var(--red-glow);">
            <h2 style="color:var(--red); font-family:var(--font-mono); font-weight:900; font-size:1.5rem; text-transform:uppercase;">⚡ ${escapeHtml(post.title)}</h2>
            <div class="blog-meta" style="font-size:0.8rem; margin-top:10px;">
                <span>👤 ${escapeHtml(post.author || 'Anonymous')}</span>
                <span>📅 ${new Date(post.createdAt).toLocaleString()}</span>
                <span class="blog-category cat-${post.category || 'general'}">${post.category || 'general'}</span>
            </div>
            <div style="margin-top:20px; font-size:1rem; line-height:1.8; color:#ddd; font-weight:500; font-family:'Segoe UI', sans-serif;">${post.content}</div>
        </div>
    `;
    window.scrollTo(0,0);
}

function backToList() {
    document.getElementById('blogList').style.display = 'grid';
    document.getElementById('singlePost').style.display = 'none';
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

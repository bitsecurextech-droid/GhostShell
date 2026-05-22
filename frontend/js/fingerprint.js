function getFingerprint() {
    const data = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform,
        navigator.hardwareConcurrency || 1
    ].join('###');
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return 'fp_' + Math.abs(hash).toString(16);
}
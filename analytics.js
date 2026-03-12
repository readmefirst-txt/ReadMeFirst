/**
 * ANTIGRAVITY ANALYTICS SYSTEM
 * Handles interaction tracking, region detection, and device identification.
 */

(function() {
    const RENDER_SERVER = "https://readmefirst-server.onrender.com";
    // Use current origin if on localhost or Render, otherwise use absolute Render URL
    const socketUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('onrender.com')) 
        ? undefined 
        : RENDER_SERVER;
    
    const socket = typeof io !== 'undefined' ? io(socketUrl) : null;
    window.AntigravityGeo = { region: 'Unknown', onDetected: null };
    let geoData = window.AntigravityGeo;

    // Initialize geo detection
    async function initGeo() {
        try {
            const response = await fetch('https://freeipapi.com/api/json');
            const data = await response.json();
            geoData.region = data.countryName || 'Unknown';
            if (window.AntigravityGeo.onDetected) {
                window.AntigravityGeo.onDetected(geoData.region);
            }
        } catch (e) {
            console.warn('Geo-detection failed:', e);
        }
        sendPageView();
    }

    function getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = "Desktop";
        if (/tablet|ipad|playbook|silk/i.test(ua)) device = "Tablet";
        else if (/Mobile|Android|iP(hone|od)/i.test(ua)) device = "Mobile";

        let browser = "Other";
        if (ua.includes("Firefox")) browser = "Firefox";
        else if (ua.includes("SamsungBrowser")) browser = "Samsung";
        else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
        else if (ua.includes("Edge")) browser = "Edge";
        else if (ua.includes("Chrome")) browser = "Chrome";
        else if (ua.includes("Safari")) browser = "Safari";

        return { device, browser };
    }

    function sendPageView() {
        if (!socket) return;
        const protocol = window.location.pathname.split('/').pop() || 'index.html';
        const { device, browser } = getDeviceInfo();

        socket.emit('interaction_event', {
            type: 'page_view',
            protocol: protocol,
            region: geoData.region,
            device: device,
            browser: browser
        });
    }

    function trackClick(e) {
        if (!socket) return;
        // Search for relevant clickable elements
        const target = e.target.closest('a, button, input[type="button"], input[type="submit"], .tab, .lang-btn, .bot-check-btn, [onclick]');
        if (target) {
            const { device, browser } = getDeviceInfo();
            socket.emit('interaction_event', {
                type: 'click',
                label: target.getAttribute('data-label') || target.innerText.trim().substring(0, 30) || target.value || target.id || 'unlabeled',
                region: geoData.region,
                device: device,
                browser: browser
            });
        }
    }

    // Public API for manual event tracking
    window.AntigravityAnalytics = {
        trackEvent: (type, data = {}) => {
            if (!socket) return;
            const { device, browser } = getDeviceInfo();
            socket.emit('interaction_event', {
                type,
                ...data,
                region: geoData.region,
                device,
                browser
            });
        }
    };

    // Initialize
    if (socket) {
        initGeo();
        document.addEventListener('click', trackClick);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    const statusDiv = document.getElementById('status');
    const tweetCountSpan = document.getElementById('tweetCount');
    const imgCountSpan = document.getElementById('imgCount');
    const statsDiv = document.getElementById('stats');
    const tableBody = document.getElementById('tableBody');
    const tableContainer = document.querySelector('.table-container');
    const tableWrapper = document.querySelector('.table-wrapper');
    const tooltip = document.getElementById('tweetTooltip');
    const searchInput = document.getElementById('searchInput');
    const refreshDetailsBtn = document.getElementById('refreshDetailsBtn');
    const detailStatus = document.getElementById('detailStatus');
    const toastContainer = document.getElementById('toastContainer');

    const isEmbedded = window.parent !== window;

    const scrapeBtn = document.getElementById('scrapeBtn');
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    const stopBtn = document.getElementById('stopBtn');
    const copyBtn = document.getElementById('copyBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const iconMarkup = {
        refresh: '<i class="ri-refresh-line" aria-hidden="true"></i>',
        refreshLoading: '<i class="ri-loader-4-line icon-spin" aria-hidden="true"></i>',
        copy: '<i class="ri-file-copy-line" aria-hidden="true"></i>',
        copySuccess: '<i class="ri-check-line" aria-hidden="true"></i>',
        download: '<i class="ri-download-2-line" aria-hidden="true"></i>',
        videoBadge: '<i class="ri-play-circle-fill" aria-hidden="true"></i>',
        videoPlaceholder: '<i class="ri-movie-2-line" aria-hidden="true"></i>',
        imagePlaceholder: '<i class="ri-image-line" aria-hidden="true"></i>',
        reply: '<i class="ri-chat-1-line" aria-hidden="true"></i>',
        retweet: '<i class="ri-repeat-2-line" aria-hidden="true"></i>',
        like: '<i class="ri-heart-3-line" aria-hidden="true"></i>',
        open: '<i class="ri-external-link-line" aria-hidden="true"></i>'
    };

    if (refreshDetailsBtn) refreshDetailsBtn.innerHTML = iconMarkup.refresh;
    if (copyBtn) copyBtn.innerHTML = iconMarkup.copy;
    if (downloadBtn) downloadBtn.innerHTML = iconMarkup.download;

    const tabs = document.querySelectorAll('.tab');
    const views = document.querySelectorAll('.view');

    const VX_API_BASE_URL = 'https://api.vxtwitter.com/Twitter/status/';
    const VX_FETCH_TIMEOUT = 15000;
    let currentData = [];
    let activeTooltipRow = null;
    let sortState = {
        column: null,
        direction: 'desc' // 'asc' or 'desc'
    };
    let vxSyncInProgress = false;
    let activeRowHovering = false;
    let tooltipHovering = false;
    let tooltipHideTimeout = null;

    // --- Tab Switching Logic ---
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById(`${target}-view`).classList.add('active');

            if (target === 'data') {
                // Apply current sort if active
                let dataToRender = currentData;
                if (sortState.column) {
                    dataToRender = sortData(currentData, sortState.column, sortState.direction);
                    // Restore active state on the sorted column
                    const sortableHeaders = document.querySelectorAll('.sortable');
                    sortableHeaders.forEach(h => h.classList.remove('active'));
                    const activeHeader = document.querySelector(`.sortable[data-sort="${sortState.column}"]`);
                    if (activeHeader) {
                        activeHeader.classList.add('active');
                    }
                }
                renderTable(dataToRender);
            }
        });
    });

    // --- Sorting Helper Function ---
    function sortData(data, column, direction) {
        const sorted = [...data].sort((a, b) => {
            if (column === 'timestamp') {
                // Sort by timestamp
                const aTime = new Date(a.timestamp || 0).getTime();
                const bTime = new Date(b.timestamp || 0).getTime();
                return direction === 'desc' ? bTime - aTime : aTime - bTime;
            } else {
                // Sort by stats
                const aVal = a.stats?.[column] || 0;
                const bVal = b.stats?.[column] || 0;
                return direction === 'desc' ? bVal - aVal : aVal - bVal;
            }
        });
        return sorted;
    }

    // --- Search Logic ---
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            let filtered = currentData.filter(tweet =>
                tweet.text.toLowerCase().includes(query)
            );

            // Apply current sort if active
            if (sortState.column) {
                filtered = sortData(filtered, sortState.column, sortState.direction);
            }

            renderTable(filtered);
        });
    }

    // --- Sorting Logic ---
    const sortableHeaders = document.querySelectorAll('.sortable');
    sortableHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
            const column = header.dataset.sort;

            // Toggle direction if clicking same column, otherwise default to desc
            if (sortState.column === column) {
                sortState.direction = sortState.direction === 'desc' ? 'asc' : 'desc';
            } else {
                sortState.column = column;
                sortState.direction = 'desc';
            }

            // Update active state
            sortableHeaders.forEach(h => h.classList.remove('active'));
            header.classList.add('active');

            // Sort and render
            const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
            let dataToSort = searchQuery
                ? currentData.filter(tweet => tweet.text.toLowerCase().includes(searchQuery))
                : currentData;

            renderTable(sortData(dataToSort, sortState.column, sortState.direction));
        });
    });

    // Load cached data immediately
    chrome.storage.local.get(['cached_tweets'], (result) => {
        if (result.cached_tweets && result.cached_tweets.length > 0) {
            currentData = result.cached_tweets;
            updateUI(currentData);
            setStatus('Loaded cached data.', 'success');
        }
    });

    if (toggleSidebarBtn) {
        // If we are already inside the embedded sidebar, hide the toggle button
        if (window.parent !== window) {
            toggleSidebarBtn.style.display = 'none';
        } else {
            toggleSidebarBtn.addEventListener('click', () => {
                sendMessageToActiveTab({ action: "toggle_sidebar" }, (response) => {
                    if (response && response.success) {
                        toggleSidebarBtn.textContent = response.visible ? 'Hide Sidebar' : 'Show Sidebar (Embedded)';
                    }
                });
            });
        }
    }

    if (tooltip) {
        tooltip.addEventListener('mouseenter', () => {
            tooltipHovering = true;
            if (tooltipHideTimeout) {
                clearTimeout(tooltipHideTimeout);
                tooltipHideTimeout = null;
            }
        });
        tooltip.addEventListener('mouseleave', () => {
            tooltipHovering = false;
            scheduleHideTooltip();
        });
    }

    function setStatus(msg, type = 'normal') {
        statusDiv.textContent = msg;
        statusDiv.className = 'status ' + type;
    }

    function updateDetailStatus(msg, type = 'normal') {
        if (!detailStatus) return;
        detailStatus.textContent = msg || '';
        detailStatus.className = `mini-status${type !== 'normal' ? ` ${type}` : ''}`;
    }

    // Toast notification system
    function showToast(msg, type = 'success', duration = 3000) {
        if (!toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icon = type === 'success' ? '<i class="ri-checkbox-circle-line"></i>' :
                     type === 'error' ? '<i class="ri-close-circle-line"></i>' :
                     '<i class="ri-information-line"></i>';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${msg}</span>
        `;

        toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto remove after duration
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    function escapeHtml(str = '') {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTimestamp(ts) {
        if (!ts) {
            return { display: '—', title: 'Unknown', dateLabel: '—' };
        }
        const date = new Date(ts);
        if (isNaN(date.getTime())) {
            return { display: ts, title: ts, dateLabel: ts };
        }

        const diff = Date.now() - date.getTime();
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        let display;

        if (diff < hour) {
            const mins = Math.max(1, Math.floor(diff / minute));
            display = `${mins}m ago`;
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            display = `${hours}h ago`;
        } else if (diff < 7 * day) {
            const days = Math.floor(diff / day);
            display = `${days}d ago`;
        } else {
            display = date.toISOString().slice(0, 10);
        }

        const dateLabel = date.toISOString().slice(0, 10);

        return { display, title: date.toLocaleString(), dateLabel };
    }

    const compactNumberFormat = new Intl.NumberFormat('en', {
        notation: 'compact',
        maximumFractionDigits: 1
    });

    function formatNumber(value) {
        if (value === null || value === undefined) return '0';
        const num = Number(value);
        if (Number.isNaN(num)) return '0';
        if (Math.abs(num) < 1000) {
            return num.toLocaleString();
        }
        return compactNumberFormat.format(num);
    }

    function textLooksTruncated(text = '') {
        const trimmed = text.trim();
        return trimmed.length === 0 || trimmed.endsWith('…') || trimmed.endsWith('...');
    }

    function shouldSyncTweet(tweet, force = false) {
        if (!tweet || !tweet.id) return false;
        if (force) return true;
        if (!tweet.vxMeta || !tweet.vxMeta.lastFetchedAt) return true;
        return textLooksTruncated(tweet.text || '');
    }

    function parseIsoTimestamp(value) {
        if (!value) return null;
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString();
    }

    function stripUrlForCheck(url = '') {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        if (!trimmed) return '';
        const noHash = trimmed.split('#')[0];
        const noQuery = noHash.split('?')[0];
        return noQuery.toLowerCase();
    }

    function looksLikeImageUrl(url) {
        if (!url) return false;
        const sanitized = stripUrlForCheck(url);
        if (!sanitized) return false;
        if (/\.(jpe?g|png|gif|webp|bmp|avif|jfif)$/.test(sanitized)) return true;
        return /format=(jpe?g|png|gif|webp|bmp|avif|jfif)/i.test(url);
    }

    function looksLikeVideoUrl(url) {
        if (!url) return false;
        const sanitized = stripUrlForCheck(url);
        if (!sanitized) return false;
        return /\.(mp4|mov|webm|m3u8|mkv|m4v)$/.test(sanitized);
    }

    function ensureArray(value) {
        if (!value) return [];
        return Array.isArray(value) ? value : [value];
    }

    function dedupeMediaEntries(entries = []) {
        const seen = new Set();
        return entries.reduce((acc, entry) => {
            if (!entry) return acc;
            const type = entry.type === 'video' ? 'video' : 'image';
            const url = entry.url || null;
            const preview = looksLikeImageUrl(entry.preview) ? entry.preview : (type === 'image' && looksLikeImageUrl(entry.url) ? entry.url : null);
            if (!url && !preview) return acc;
            const key = `${type}|${url || ''}|${preview || ''}`;
            if (seen.has(key)) return acc;
            seen.add(key);
            acc.push({ type, url, preview });
            return acc;
        }, []);
    }

    function normalizeMediaEntries(payload) {
        if (!payload) return [];
        const candidates = [];
        const pushEntry = (entry) => {
            if (!entry) return;
            candidates.push(entry);
        };

        const vxTweet = payload.tweet || payload.data || payload;
        [
            payload.media,
            payload.media_extended,
            vxTweet?.media,
            vxTweet?.photos,
            vxTweet?.extended_entities?.media,
            vxTweet?.entities?.media
        ].forEach(collection => {
            ensureArray(collection).forEach(item => {
                if (!item) return;
                if (typeof item === 'string') {
                    if (looksLikeImageUrl(item)) {
                        pushEntry({ type: 'image', url: item, preview: item });
                    } else if (looksLikeVideoUrl(item)) {
                        pushEntry({ type: 'video', url: item, preview: null });
                    }
                    return;
                }
                const rawType = (item.type || item.media_type || item.content_type || '').toLowerCase();
                let normalizedType = rawType.includes('video') || rawType.includes('anim') ? 'video' : 'image';
                const directUrl = item.direct_url || item.video_url || item.media_url_https || item.media_url || item.url_https || item.url || item.playbackUrl || item.playback_url;
                if (!directUrl && rawType.includes('gif')) {
                    normalizedType = 'video';
                } else if (!rawType && directUrl && looksLikeVideoUrl(directUrl)) {
                    normalizedType = 'video';
                }
                let preview = item.thumbnail_url || item.preview_image_url || item.preview || item.poster || item.image || item.cover || item.poster_image;
                if (!looksLikeImageUrl(preview) && normalizedType === 'image' && looksLikeImageUrl(directUrl)) {
                    preview = directUrl;
                }
                pushEntry({
                    type: normalizedType,
                    url: directUrl || null,
                    preview: preview
                });
            });
        });

        [
            payload.media_urls,
            payload.mediaURLs,
            vxTweet?.media_urls,
            vxTweet?.mediaURLs
        ].forEach(collection => {
            ensureArray(collection).forEach(url => {
                if (typeof url !== 'string') return;
                if (looksLikeImageUrl(url)) {
                    pushEntry({ type: 'image', url, preview: url });
                } else if (looksLikeVideoUrl(url)) {
                    pushEntry({ type: 'video', url, preview: null });
                }
            });
        });

        return dedupeMediaEntries(candidates);
    }

    function getPreviewInfo(tweet) {
        if (!tweet) return { previewUrl: null, isVideo: false };
        if (Array.isArray(tweet.media) && tweet.media.length > 0) {
            const imageEntry = tweet.media.find(entry => entry.type === 'image' && looksLikeImageUrl(entry.preview || entry.url));
            if (imageEntry) {
                return { previewUrl: imageEntry.preview || imageEntry.url, isVideo: false };
            }
            const videoEntryWithPreview = tweet.media.find(entry => entry.type === 'video' && looksLikeImageUrl(entry.preview));
            if (videoEntryWithPreview) {
                return { previewUrl: videoEntryWithPreview.preview, isVideo: true };
            }
            const hasVideo = tweet.media.some(entry => entry.type === 'video');
            if (hasVideo) {
                return { previewUrl: null, isVideo: true };
            }
        }
        const fallbackImage = (tweet.images || []).find(url => looksLikeImageUrl(url));
        if (fallbackImage) {
            return { previewUrl: fallbackImage, isVideo: false };
        }
        return { previewUrl: null, isVideo: false };
    }

    function resolveTweetUrl(tweet) {
        if (!tweet) return null;
        const fallback = tweet.id ? `https://x.com/i/web/status/${tweet.id}` : null;
        const rawUrl = typeof tweet.url === 'string' ? tweet.url.trim() : '';
        if (rawUrl) {
            let normalized = rawUrl;
            if (/^https?:\/\//i.test(normalized)) {
                // Already absolute.
            } else if (normalized.startsWith('//')) {
                normalized = `https:${normalized}`;
            } else if (normalized.startsWith('/')) {
                normalized = `https://x.com${normalized}`;
            } else {
                normalized = `https://x.com/${normalized}`;
            }

            const sanitized = stripUrlForCheck(normalized);
            if (sanitized.includes('/status/')) {
                return normalized;
            }
            if (sanitized.includes('/content/') && fallback) {
                return fallback;
            }
        }
        return fallback;
    }

    function buildActionButtons(tweet) {
        if (!tweet) return '';
        const tweetId = tweet.id;
        const tweetUrl = resolveTweetUrl(tweet);
        const actions = [];

        if (tweetId) {
            actions.push({
                label: 'Reply',
                href: `https://twitter.com/intent/tweet?in_reply_to=${tweetId}`,
                icon: iconMarkup.reply
            });
            actions.push({
                label: 'Retweet',
                href: `https://twitter.com/intent/retweet?tweet_id=${tweetId}`,
                icon: iconMarkup.retweet
            });
            actions.push({
                label: 'Like',
                href: `https://twitter.com/intent/like?tweet_id=${tweetId}`,
                icon: iconMarkup.like
            });
        }

        if (tweetUrl) {
            actions.push({
                label: 'Open',
                href: tweetUrl,
                icon: iconMarkup.open
            });
        }

        if (!actions.length) return '';

        const buttons = actions.map(action => `
            <a class="action-btn" href="${action.href}" target="_blank" rel="noopener noreferrer" title="${action.label}">
                ${action.icon}
                <span>${action.label}</span>
            </a>
        `).join('');

        return `
            <div class="tooltip-actions">
                ${buttons}
            </div>
        `;
    }

    function mergeTweetWithVxData(tweet, payload) {
        if (!payload) return tweet;
        const vxTweet = payload.tweet || payload.data || payload;
        const vxUser = payload.user || vxTweet?.user || vxTweet?.author;
        const normalizedMedia = normalizeMediaEntries(payload);

        const merged = {
            ...tweet
        };

        const fullText = vxTweet?.full_text || vxTweet?.text || payload.full_text || payload.text;
        if (fullText) {
            merged.text = fullText;
        }

        const vxTimestamp = parseIsoTimestamp(vxTweet?.created_at || payload.created_at);
        if (vxTimestamp) {
            merged.timestamp = vxTimestamp;
        }

        const combinedMedia = dedupeMediaEntries([...(tweet.media || []), ...normalizedMedia]);
        if (combinedMedia.length > 0) {
            merged.media = combinedMedia;
        }

        const cleanedExistingImages = (merged.images || []).filter(url => looksLikeImageUrl(url));
        const newImageCandidates = normalizedMedia
            .filter(entry => entry.type === 'image')
            .map(entry => entry.preview || entry.url)
            .filter(url => looksLikeImageUrl(url));

        if (cleanedExistingImages.length !== (merged.images || []).length || newImageCandidates.length > 0) {
            const mergedImages = [...new Set([...cleanedExistingImages, ...newImageCandidates])];
            merged.images = mergedImages;
        }

        merged.vxMeta = {
            lastFetchedAt: new Date().toISOString(),
            source: 'vxtwitter',
            author: vxUser ? {
                id: vxUser.id_str || vxUser.id || null,
                handle: vxUser.screen_name || vxUser.username || vxUser.handle || null,
                name: vxUser.name || vxUser.full_name || null
            } : null
        };

        return merged;
    }

    function setRefreshButtonState(disabled) {
        if (!refreshDetailsBtn) return;
        refreshDetailsBtn.disabled = disabled;
        refreshDetailsBtn.innerHTML = disabled ? iconMarkup.refreshLoading : iconMarkup.refresh;
    }

    async function fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const { timeout = VX_FETCH_TIMEOUT, ...rest } = options;
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            return await fetch(url, { ...rest, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchVxTwitterDetails(tweetId) {
        const response = await fetchWithTimeout(`${VX_API_BASE_URL}${tweetId}`, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`HTTP ${response.status}: ${message || response.statusText}`);
        }

        return response.json();
    }

    function maybeTriggerAutoVxSync() {
        if (vxSyncInProgress) return;
        if (!currentData || currentData.length === 0) return;
        const needsSync = currentData.some(tweet => shouldSyncTweet(tweet));
        if (!needsSync) return;
        refreshDetailsFromVxTwitter(false);
    }

    async function refreshDetailsFromVxTwitter(force = false) {
        if (vxSyncInProgress) return;
        if (!currentData || currentData.length === 0) {
            updateDetailStatus('还没有可补充的缓存数据。');
            return;
        }

        const targets = currentData.filter(tweet => shouldSyncTweet(tweet, force));
        if (targets.length === 0) {
            updateDetailStatus('所有推文的详情已经是最新。', 'success');
            return;
        }

        vxSyncInProgress = true;
        setRefreshButtonState(true);
        updateDetailStatus(`正在通过 VxTwitter 获取 ${targets.length} 条推文详情...`);

        const updates = new Map();
        let successCount = 0;

        for (let i = 0; i < targets.length; i++) {
            const tweet = targets[i];
            try {
                const payload = await fetchVxTwitterDetails(tweet.id);
                const merged = mergeTweetWithVxData(tweet, payload);
                updates.set(tweet.id, merged);
                successCount++;
                updateDetailStatus(`已更新 ${successCount}/${targets.length} 条推文...`);
            } catch (error) {
                console.error(`X Data Scraper: Failed to fetch VxTwitter details for ${tweet.id}`, error);
            }
        }

        if (updates.size > 0) {
            const updatedIds = new Set(updates.keys());
            currentData = currentData.map(tweet => updatedIds.has(tweet.id) ? updates.get(tweet.id) : tweet);
            chrome.storage.local.set({ cached_tweets: currentData }, () => {
                if (chrome.runtime.lastError) {
                    console.error('X Data Scraper: Failed to persist VxTwitter details', chrome.runtime.lastError);
                    updateDetailStatus('写入缓存失败，请稍后重试。', 'error');
                    return;
                }
                updateUI(currentData);
                // Clear status and show toast notification
                updateDetailStatus('');
                const toastType = successCount === targets.length ? 'success' : (successCount > 0 ? 'success' : 'error');
                showToast(`VxTwitter 同步完成，成功 ${successCount}/${targets.length} 条`, toastType, 3000);
            });
        } else {
            updateDetailStatus('VxTwitter 请求未能更新任何推文。', 'error');
        }

        setRefreshButtonState(false);
        vxSyncInProgress = false;
    }

    function updateUI(data) {
        currentData = data;
        let totalImgs = 0;
        data.forEach(t => totalImgs += (t.images ? t.images.length : 0));

        tweetCountSpan.textContent = data.length;
        imgCountSpan.textContent = totalImgs;
        statsDiv.style.display = 'flex';

        // Update table if it's currently showing
        if (document.getElementById('data-view').classList.contains('active')) {
            let dataToRender = data;
            if (sortState.column) {
                dataToRender = sortData(data, sortState.column, sortState.direction);
            }
            renderTable(dataToRender);
        }

        maybeTriggerAutoVxSync();
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        data.forEach(tweet => {
            const tr = document.createElement('tr');
            tr.className = 'tweet-row';
            const tweetUrl = resolveTweetUrl(tweet);
            tr.addEventListener('click', () => {
                // Clicking row opens the original tweet
                if (!tweetUrl) {
                    console.warn('X Data Scraper: Missing tweet URL for row', tweet);
                    return;
                }
                if (isEmbedded) {
                    postToParent('navigate_to_tweet', {
                        url: tweetUrl,
                        tweetId: tweet.id || null
                    });
                    return;
                }
                window.open(tweetUrl, '_blank', 'noopener');
            });

            const stats = tweet.stats || {};
            const safeText = escapeHtml((tweet.text || '').trim() || '(No text)');
            const previewInfo = getPreviewInfo(tweet);
            const previewUrl = previewInfo.previewUrl ? escapeHtml(previewInfo.previewUrl) : null;
            let imgHtml;
            if (previewUrl) {
                const altText = previewInfo.isVideo ? 'Video preview' : 'Tweet image';
                imgHtml = `
                    <div class="thumb-visual${previewInfo.isVideo ? ' is-video' : ''}">
                        <img src="${previewUrl}" alt="${altText}">
                        ${previewInfo.isVideo ? `<span class="video-badge" aria-hidden="true">${iconMarkup.videoBadge}</span>` : ''}
                    </div>
                `;
            } else if (previewInfo.isVideo) {
                imgHtml = `<div class="thumb-placeholder video" aria-label="Video media">${iconMarkup.videoPlaceholder}</div>`;
            } else {
                imgHtml = `<div class="thumb-placeholder" aria-label="No media">${iconMarkup.imagePlaceholder}</div>`;
            }

            const formattedTime = formatTimestamp(tweet.timestamp);
            const timeValue = escapeHtml(formattedTime.display);
            const timeTitle = escapeHtml(formattedTime.title);
            const dateLabel = escapeHtml(formattedTime.dateLabel);

            tr.innerHTML = `
                <td class="thumb-cell">${imgHtml}</td>
                <td class="tweet-cell">
                    <div class="tweet-meta" title="${timeTitle}">
                        <div class="tweet-date">${dateLabel}</div>
                        <div class="tweet-text">${safeText}</div>
                    </div>
                </td>
                <td class="stat-val vwt">${formatNumber(stats.views)}</td>
                <td class="stat-val lkt">${formatNumber(stats.likes)}</td>
                <td class="stat-val rwt">${formatNumber(stats.retweets)}</td>
                <td class="stat-val rpl">${formatNumber(stats.replies)}</td>
            `;
            tr.addEventListener('mouseenter', () => {
                activeRowHovering = true;
                showTooltip(tweet, tr);
            });
            tr.addEventListener('mouseleave', () => handleRowMouseLeave(tr));
            tableBody.appendChild(tr);
        });
    }

    function sendMessageToActiveTab(msg, callback) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) {
                console.error("No active tab found");
                return;
            }

            const tabId = tabs[0].id;
            chrome.tabs.sendMessage(tabId, msg, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("Content script not detected, injecting...");
                    // Script not injected or context invalidated
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Injection failed:", chrome.runtime.lastError.message);
                            setStatus("Failed to inject script. Reload page.", "error");
                        } else {
                            // Try again after a short delay
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, msg, callback);
                            }, 300);
                        }
                    });
                } else if (callback) {
                    callback(response);
                }
            });
        });
    }

    scrapeBtn.addEventListener('click', () => {
        setStatus('Scraping...');
        sendMessageToActiveTab({ action: "scrape" }, (response) => {
            if (response && response.success) {
                updateUI(response.data);
                setStatus('Scrape complete!', 'success');
            } else {
                setStatus('Error scraping view.', 'error');
            }
        });
    });

    autoScrollBtn.addEventListener('click', () => {
        autoScrollBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        setStatus('Auto-scrolling...');

        sendMessageToActiveTab({ action: "start_scroll" }, (response) => {
            if (response && response.success) {
                // Background loop started
            }
        });
    });

    stopBtn.addEventListener('click', () => {
        sendMessageToActiveTab({ action: "stop_scroll" }, (response) => {
            if (response && response.success) {
                updateUI(response.data);
                autoScrollBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
                setStatus('Stopped.', 'success');
            }
        });
    });

    // Handle updates during auto-scroll
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "update_count") {
            tweetCountSpan.textContent = request.count;
            // Optionally update table in real-time if visible, 
            // but might be heavy. Let's just update count for now.
        } else if (request.action === "scroll_finished") {
            updateUI(request.data);
            autoScrollBtn.style.display = 'inline-block';
            stopBtn.style.display = 'none';
            setStatus('Auto-scroll finished.', 'success');
        }
    });

    copyBtn.addEventListener('click', () => {
        const text = JSON.stringify(currentData, null, 2);
        navigator.clipboard.writeText(text).then(() => {
            if (!copyBtn) return;
            copyBtn.innerHTML = iconMarkup.copySuccess;
            setTimeout(() => {
                if (copyBtn) copyBtn.innerHTML = iconMarkup.copy;
            }, 2000);
        }).catch((err) => {
            console.error('X Data Scraper: Failed to copy JSON', err);
        });
    });

    downloadBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `x-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    });

    if (refreshDetailsBtn) {
        refreshDetailsBtn.addEventListener('click', () => {
            refreshDetailsFromVxTwitter(true);
        });
    }

    function postToParent(action, payload = {}) {
        if (!isEmbedded || !window.parent) return;
        window.parent.postMessage({
            source: 'x-data-scraper',
            action,
            payload
        }, '*');
    }

    function sendEmbeddedTooltip(action, payload = {}) {
        postToParent(action, payload);
    }

    function handleRowMouseLeave(row) {
        if (isEmbedded) {
            if (activeTooltipRow === row) {
                activeRowHovering = false;
                sendEmbeddedTooltip('schedule_hide_tooltip');
            }
            return;
        }

        if (activeTooltipRow === row) {
            activeRowHovering = false;
            scheduleHideTooltip();
        }
    }

    function scheduleHideTooltip() {
        if (isEmbedded) return;
        if (tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
        }
        tooltipHideTimeout = setTimeout(() => {
            if (tooltipHovering) return;
            if (activeRowHovering) return;
            hideTooltip(true);
        }, 200);
    }

    function hideTooltip(force = false) {
        if (isEmbedded) {
            sendEmbeddedTooltip('hide_tooltip');
            activeTooltipRow = null;
            activeRowHovering = false;
            return;
        }

        if (!tooltip) return;
        if (!force) {
            if (tooltipHovering) return;
            if (activeRowHovering) return;
        }

        if (tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = null;
        }
        tooltipHovering = false;
        tooltip.classList.add('hidden');
        tooltip.innerHTML = '';
        activeTooltipRow = null;
        activeRowHovering = false;
        if (tableWrapper) {
            tableWrapper.classList.remove('tooltip-visible');
        }
    }

    function positionTooltip(row) {
        if (isEmbedded) return;
        if (!tooltip || !tableContainer || !row) return;
        const containerRect = tableContainer.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const offsetTop = rowRect.top - containerRect.top + tableContainer.scrollTop;
        const tooltipHeight = tooltip.offsetHeight;
        const rowCenter = offsetTop + rowRect.height / 2;
        let top = rowCenter - tooltipHeight / 2;
        top = Math.max(8, Math.min(top, tableContainer.scrollHeight - tooltipHeight - 8));
        const width = tooltip.offsetWidth || 240;
        tooltip.style.top = `${top}px`;
        tooltip.style.left = `12px`;
    }

    function showTooltip(tweet, row) {
        activeTooltipRow = row;
        activeRowHovering = true;
        if (!isEmbedded && tooltipHideTimeout) {
            clearTimeout(tooltipHideTimeout);
            tooltipHideTimeout = null;
        }

        if (isEmbedded) {
            const rowRect = row.getBoundingClientRect();
            const stats = tweet.stats || {};
            const formattedTime = formatTimestamp(tweet.timestamp);
            const previewInfo = getPreviewInfo(tweet);
            sendEmbeddedTooltip('show_tooltip', {
                tweet: {
                    id: tweet.id || null,
                    timestamp: formattedTime.title,
                    dateLabel: formattedTime.dateLabel,
                    url: resolveTweetUrl(tweet),
                    text: tweet.text || '(No text)',
                    stats: {
                        views: formatNumber(stats.views),
                        likes: formatNumber(stats.likes),
                        retweets: formatNumber(stats.retweets),
                        replies: formatNumber(stats.replies)
                    },
                    preview: previewInfo.previewUrl ? {
                        url: previewInfo.previewUrl,
                        isVideo: previewInfo.isVideo
                    } : (previewInfo.isVideo ? { url: null, isVideo: true } : null)
                },
                rowRect: {
                    top: rowRect.top,
                    height: rowRect.height
                }
            });
            return;
        }

        if (!tooltip) return;
        const stats = tweet.stats || {};
        const formattedTime = formatTimestamp(tweet.timestamp);
        const safeTime = escapeHtml(formattedTime.title);
        const safeText = escapeHtml(tweet.text || '(No text)');
        const previewInfo = getPreviewInfo(tweet);
        const previewUrl = previewInfo.previewUrl ? escapeHtml(previewInfo.previewUrl) : null;
        let previewSection = '';

        if (previewUrl) {
            const altText = previewInfo.isVideo ? 'Video preview' : 'Tweet image';
            previewSection = `
                <div class="tooltip-media${previewInfo.isVideo ? ' is-video' : ''}">
                    <img src="${previewUrl}" alt="${escapeHtml(altText)}">
                    ${previewInfo.isVideo ? `<span class="video-badge" aria-hidden="true">${iconMarkup.videoBadge}</span>` : ''}
                </div>
            `;
        } else if (previewInfo.isVideo) {
            previewSection = `
                <div class="tooltip-media placeholder" aria-label="Video media">
                    ${iconMarkup.videoPlaceholder}
                </div>
            `;
        }

        const statsHtml = `
            <div class="tooltip-stats">
                <span>Views: <b>${formatNumber(stats.views)}</b></span>
                <span>Likes: <b>${formatNumber(stats.likes)}</b></span>
                <span>RTs: <b>${formatNumber(stats.retweets)}</b></span>
                <span>Replies: <b>${formatNumber(stats.replies)}</b></span>
            </div>
        `;

        const actionsHtml = buildActionButtons(tweet);

        tooltip.innerHTML = `
            <div class="tooltip-time">${safeTime}</div>
            ${previewSection}
            <div class="tooltip-text">${safeText}</div>
            ${statsHtml}
            ${actionsHtml}
        `;
        tooltip.classList.remove('hidden');
        if (tableWrapper) {
            tableWrapper.classList.add('tooltip-visible');
        }
        positionTooltip(row);
    }

    if (tableContainer) {
        tableContainer.addEventListener('scroll', () => {
            if (activeTooltipRow) {
                if (isEmbedded) {
                    const rect = activeTooltipRow.getBoundingClientRect();
                    sendEmbeddedTooltip('move_tooltip', {
                        rowRect: {
                            top: rect.top,
                            height: rect.height
                        }
                    });
                } else {
                    positionTooltip(activeTooltipRow);
                }
            }
        });
    }
});

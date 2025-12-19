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
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
    const searchHistoryList = document.getElementById('searchHistoryList');
    const searchHistoryEmpty = document.querySelector('.search-history-empty');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const refreshDetailsBtn = document.getElementById('refreshDetailsBtn');
    const detailStatus = document.getElementById('detailStatus');
    const toastContainer = document.getElementById('toastContainer');
    const autoScrollNotice = document.getElementById('autoScrollNotice');
    const scenarioItems = Array.from(document.querySelectorAll('.scenario-item'));
    const scenarioActionButtons = Array.from(document.querySelectorAll('.scenario-action-btn'));
    const scenarioItemsList = document.querySelector('.scenario-items-list');
    const scenarioHint = document.getElementById('scenarioHint');
    const dataScenarioTabs = document.getElementById('dataScenarioTabs');

    // Storage view elements
    const storageUsedSpan = document.getElementById('storageUsed');
    const storageQuotaSpan = document.getElementById('storageQuota');
    const storagePercentSpan = document.getElementById('storagePercent');
    const storageBarFill = document.getElementById('storageBarFill');
    const storageTweetCountSpan = document.getElementById('storageTweetCount');
    const storageAvgSizeSpan = document.getElementById('storageAvgSize');
    const storageLastUpdateSpan = document.getElementById('storageLastUpdate');
    const refreshStorageBtn = document.getElementById('refreshStorageBtn');
    const clearStorageBtn = document.getElementById('clearStorageBtn');
    const scenarioStorageList = document.getElementById('scenarioStorageList');

    const isEmbedded = window.parent !== window;

    // Logo click handler - open extensions page for quick reload during development
    const logo = document.querySelector('.logo');
    if (logo) {
        logo.style.cursor = 'pointer';
        logo.addEventListener('click', () => {
            chrome.tabs.create({
                url: 'chrome://extensions/?id=fpppfanjlmbbimolfmngfmdlphefanoh'
            });
        });
    }

    const scrapeBtn = document.getElementById('scrapeBtn');
    const autoScrollBtn = document.getElementById('autoScrollBtn');
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
        retweet: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"></path></svg>',
        like: '<i class="ri-heart-3-line" aria-hidden="true"></i>',
        open: '<i class="ri-external-link-line" aria-hidden="true"></i>'
    };

    const SCRAPE_SCENARIOS = [
        {
            id: 'analytics_auto',
            label: 'My Posts',
            statusLabel: 'My Posts',
            getTargetUrl: () => `https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=${myPostsTimeRange}`,
            hint: 'Navigate to your posts page and scrape your recent tweets with auto-scroll.',
            autoScrollSupported: true
        },
        {
            id: 'bookmarks_auto',
            label: 'Bookmarks',
            statusLabel: 'Bookmarks',
            hint: 'Navigate to bookmarks page and auto-scroll through saved tweets.',
            autoScrollSupported: true
        },
        {
            id: 'current_auto',
            label: 'Current Page',
            statusLabel: 'Current Page',
            hint: 'Stay on current page (including search, lists, tags) and auto-scroll for more content.',
            autoScrollSupported: true
        }
    ];
    const SCENARIO_ALIAS_MAP = {
        analytics: 'analytics_auto',
        bookmarks: 'bookmarks_auto',
        lists: 'current_auto',
        search: 'current_auto'
    };
    const scenarioLookup = SCRAPE_SCENARIOS.reduce((acc, scenario) => {
        acc[scenario.id] = scenario;
        return acc;
    }, {});
    const SCENARIO_STORAGE_KEY = 'x_data_selected_scenario';
    const DATA_CACHE_STORAGE_KEY = 'cached_tweets_by_scenario';
    const LEGACY_CACHE_KEY = 'cached_tweets';
    const MY_POSTS_TIME_RANGE_KEY = 'x_data_my_posts_time_range';
    const scenarioDataStore = {};
    let activeScenarioId = SCRAPE_SCENARIOS[0].id;
    let activeDataScenarioId = SCRAPE_SCENARIOS[0].id;
    let myPostsTimeRange = 90; // Default to 3M (90 days)

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
    let autoScrollRunning = false;
    let autoScrollScenarioId = null; // Track which scenario is currently auto-scrolling

    function resolveScenarioId(id) {
        if (!id) return SCRAPE_SCENARIOS[0].id;
        if (scenarioLookup[id]) return id;
        const alias = id && SCENARIO_ALIAS_MAP[id];
        if (alias && scenarioLookup[alias]) return alias;
        return SCRAPE_SCENARIOS[0].id;
    }

    function getScenarioById(id) {
        return scenarioLookup[resolveScenarioId(id)] || SCRAPE_SCENARIOS[0];
    }

    function getActiveScenario() {
        return getScenarioById(activeScenarioId);
    }

    function scenarioStatusLabel(scenario) {
        if (!scenario) return '';
        return scenario.statusLabel || scenario.label || '';
    }

    function setActiveScenario(id, { persist = true } = {}) {
        const scenario = getScenarioById(id);
        activeScenarioId = scenario.id;
        // Scenario items no longer show active state in Console view
        if (scenarioHint) {
            scenarioHint.textContent = scenario.hint;
        }
        if (scenario.autoScrollSupported === false && autoScrollRunning) {
            requestStopAutoScroll({ silent: true });
        }
        updateAutoScrollControls();
        refreshConsoleStatsForScenario(scenario.id);
        if (persist) {
            chrome.storage.local.set({ [SCENARIO_STORAGE_KEY]: activeScenarioId });
        }
    }

    // Scenario items no longer need click handlers for selection
    // All scenarios are displayed with their data simultaneously

    // Add event listeners to action buttons
    if (scenarioActionButtons.length) {
        scenarioActionButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();

                const scenarioItem = button.closest('.scenario-item');
                const scenarioId = scenarioItem.dataset.scenario;
                const action = button.dataset.action;

                if (!scenarioId) return;

                const scenario = getScenarioById(scenarioId);

                switch (action) {
                    case 'autoscroll':
                        handleScenarioAutoScroll(scenarioId);
                        break;
                    case 'clear':
                        handleScenarioClear(scenarioId);
                        break;
                }
            });
        });
    }

    setActiveScenario(activeScenarioId, { persist: false });

    chrome.storage.local.get([SCENARIO_STORAGE_KEY], (result) => {
        const stored = result[SCENARIO_STORAGE_KEY];
        if (stored) {
            setActiveScenario(stored, { persist: false });
        } else {
            updateAutoScrollControls();
        }

        // Initialize auto-scroll button states
        updateAutoScrollControls();
    });

    // Note: handleScenarioScrape function has been removed as Scrape buttons are no longer needed
    // Auto-scroll is now the primary way to collect data

    function handleScenarioAutoScroll(scenarioId) {
        const scenario = getScenarioById(scenarioId);
        if (scenario.autoScrollSupported === false) {
            setStatus('This scenario does not support auto-scrolling.', 'error');
            return;
        }

        // Check if we need to stop the current auto-scroll
        if (autoScrollRunning && autoScrollScenarioId === scenarioId) {
            requestStopAutoScroll();
            return;
        }

        // If another scenario is auto-scrolling, stop it first
        if (autoScrollRunning) {
            requestStopAutoScroll({ silent: true });
            // Start the new auto-scroll after a brief delay
            setTimeout(() => {
                startAutoScroll(scenarioId);
            }, 300);
        } else {
            startAutoScroll(scenarioId);
        }
    }

    function startAutoScroll(scenarioId) {
        const scenario = getScenarioById(scenarioId);
        autoScrollRunning = true;
        autoScrollScenarioId = scenarioId;
        updateAutoScrollControls();
        setStatus(`Auto-scrolling ${scenarioStatusLabel(scenario)}...`);

        const targetUrl = scenario.getTargetUrl ? scenario.getTargetUrl() : null;
        sendMessageToActiveTab({ action: "start_scroll", scenarioId, targetUrl }, (response) => {
            if (!response || !response.success) {
                autoScrollRunning = false;
                autoScrollScenarioId = null;
                updateAutoScrollControls();
                const err = response && response.error;
                if (err === 'auto_scroll_disabled') {
                    setStatus('Auto-scroll is disabled for this scenario.', 'error');
                } else {
                    setStatus('Failed to start auto-scroll. Please refresh and try again.', 'error');
                }
            }
        });
    }

    function handleScenarioClear(scenarioId) {
        const scenario = getScenarioById(scenarioId);
        const data = getScenarioData(scenarioId);

        if (data.length === 0) {
            showToast(`No data to clear for ${scenario.label}`, 'info', 2000);
            return;
        }

        if (confirm(`Are you sure you want to clear all cached data for "${scenario.label}"?`)) {
            setScenarioData(scenarioId, []);
            showToast(`Cleared ${scenario.label} cache`, 'success', 2000);
            sendMessageToActiveTab({ action: "update_cache", scenarioId, data: [] });
        }
    }

    function updateAutoScrollControls() {
        // Update scenario-specific auto-scroll buttons
        scenarioActionButtons.forEach(button => {
            const action = button.dataset.action;
            if (action === 'autoscroll') {
                const scenarioItem = button.closest('.scenario-item');
                const scenarioId = scenarioItem.dataset.scenario;
                const scenario = getScenarioById(scenarioId);

                // Show/stop text based on autoScrollRunning state
                const isScrollingThisScenario = autoScrollRunning && scenarioId === autoScrollScenarioId;
                button.textContent = isScrollingThisScenario ? 'Stop' : 'Scrape';

                // Update button appearance
                if (isScrollingThisScenario) {
                    button.style.backgroundColor = 'var(--danger)';
                    button.style.color = 'white';
                    button.style.borderColor = 'var(--danger)';
                } else {
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    button.style.borderColor = '';
                }
            }
        });
    }

    function computeImageCount(data = []) {
        return data.reduce((total, tweet) => {
            if (!tweet || !Array.isArray(tweet.images)) return total;
            return total + tweet.images.length;
        }, 0);
    }

    function getScenarioData(id) {
        const resolved = resolveScenarioId(id);
        if (!scenarioDataStore[resolved]) {
            scenarioDataStore[resolved] = [];
        }
        return scenarioDataStore[resolved];
    }

    function persistScenarioDataStore() {
        const payload = {};
        Object.entries(scenarioDataStore).forEach(([scenarioId, tweets]) => {
            if (Array.isArray(tweets)) {
                payload[scenarioId] = tweets;
            }
        });
        chrome.storage.local.set({ [DATA_CACHE_STORAGE_KEY]: payload });
    }

    function updateDataScenarioTabsState() {
        if (!dataScenarioTabs) return;
        const buttons = dataScenarioTabs.querySelectorAll('.data-scenario-tab');
        buttons.forEach(button => {
            const scenarioId = button.dataset.scenario;
            button.classList.toggle('active', scenarioId === activeDataScenarioId);
        });
    }

    function updateScenarioStorageList() {
        if (!scenarioStorageList) return;
        scenarioStorageList.innerHTML = '';
        SCRAPE_SCENARIOS.forEach(scenario => {
            const data = getScenarioData(scenario.id);
            const count = data.length;
            const item = document.createElement('div');
            item.className = 'scenario-storage-item';

            const info = document.createElement('div');
            info.className = 'scenario-storage-info';
            info.innerHTML = `
                <div class="scenario-storage-title">${scenario.label}</div>
                <div class="scenario-storage-meta">${count.toLocaleString()} items</div>
            `;

            const controls = document.createElement('div');
            controls.className = 'scenario-storage-controls';
            const clearBtn = document.createElement('button');
            clearBtn.className = 'scenario-clear-btn';
            clearBtn.type = 'button';
            clearBtn.textContent = 'Clear';
            clearBtn.disabled = count === 0;
            clearBtn.addEventListener('click', (e) => {
                console.log('Clear button clicked for scenario:', scenario.id);
                handleScenarioClear(scenario.id, count);
            });
            controls.appendChild(clearBtn);

            item.appendChild(info);
            item.appendChild(controls);
            scenarioStorageList.appendChild(item);
        });
    }

    function handleScenarioClear(scenarioId, count) {
        console.log('handleScenarioClear called with:', scenarioId, count);
        if (count === 0) {
            console.log('Count is 0, returning early');
            return;
        }
        const scenario = getScenarioById(scenarioId);
        if (!confirm(`Are you sure you want to clear the cache for "${scenario.label}"?`)) return;
        console.log('Confirmed, clearing scenario:', scenario.id);
        setScenarioData(scenario.id, []);
        updateScenarioStorageList();
        updateStorageUI();
        showToast(`Cleared ${scenario.label} cache`, 'success', 2000);
        sendMessageToActiveTab({ action: "update_cache", scenarioId: scenario.id, data: [] });
    }

    function renderDataScenarioTabs() {
        if (!dataScenarioTabs) return;
        dataScenarioTabs.innerHTML = '';
        SCRAPE_SCENARIOS.forEach(scenario => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'data-scenario-tab';
            button.dataset.scenario = scenario.id;
            button.innerHTML = `
                <span class="data-scenario-label">${scenario.label}</span>
            `;
            button.addEventListener('click', () => {
                setActiveDataScenario(scenario.id);
            });
            dataScenarioTabs.appendChild(button);
        });
        updateDataScenarioTabsState();
    }

    function setScenarioData(id, data, { persist = true, refreshView = true } = {}) {
        const resolved = resolveScenarioId(id);
        scenarioDataStore[resolved] = Array.isArray(data) ? data : [];
        if (persist) {
            persistScenarioDataStore();
        }
        updateDataScenarioTabsState();
        updateScenarioStorageList();
        if (refreshView && resolved === activeDataScenarioId) {
            applyCurrentDataFromScenario();
        }
        refreshConsoleStatsForScenario(resolved);
    }

    function setActiveDataScenario(id) {
        const resolved = resolveScenarioId(id);
        if (activeDataScenarioId === resolved) {
            updateDataScenarioTabsState();
            applyCurrentDataFromScenario();
            return;
        }
        activeDataScenarioId = resolved;
        updateDataScenarioTabsState();
        applyCurrentDataFromScenario();
    }

    function applyCurrentDataFromScenario() {
        currentData = getScenarioData(activeDataScenarioId);
        let dataToRender = currentData;
        const searchQuery = (searchInput?.value || '').toLowerCase();
        if (searchQuery) {
            dataToRender = dataToRender.filter(tweet =>
                (tweet.text || '').toLowerCase().includes(searchQuery)
            );
        }
        if (sortState.column) {
            dataToRender = sortData(dataToRender, sortState.column, sortState.direction);
        }
        renderTable(dataToRender);
    }

    function refreshConsoleStatsForScenario(targetScenarioId) {
        // Update all scenario data counts in the Console view
        const dataCountElements = document.querySelectorAll('.scenario-data-count');

        if (targetScenarioId) {
            // Update specific scenario
            const targetElement = document.querySelector(`.scenario-data-count[data-scenario-id="${targetScenarioId}"]`);
            if (targetElement) {
                const data = getScenarioData(targetScenarioId);
                const tweetCount = data.length;
                const imageCount = computeImageCount(data);
                targetElement.innerHTML = `Tweets: <b>${tweetCount}</b> · Images: <b>${imageCount}</b>`;
            }
        } else {
            // Update all scenarios
            dataCountElements.forEach(element => {
                const scenarioId = element.dataset.scenarioId;
                if (scenarioId) {
                    const data = getScenarioData(scenarioId);
                    const tweetCount = data.length;
                    const imageCount = computeImageCount(data);
                    element.innerHTML = `Tweets: <b>${tweetCount}</b> · Images: <b>${imageCount}</b>`;
                }
            });
        }
    }

    function bootstrapScenarioDataFromStorage() {
        chrome.storage.local.get([DATA_CACHE_STORAGE_KEY, LEGACY_CACHE_KEY], (result) => {
            const storedByScenario = result[DATA_CACHE_STORAGE_KEY];
            let firstScenarioWithData = null;
            if (storedByScenario && typeof storedByScenario === 'object') {
                Object.entries(storedByScenario).forEach(([scenarioId, tweets]) => {
                    const normalized = resolveScenarioId(scenarioId);
                    setScenarioData(normalized, Array.isArray(tweets) ? tweets : [], { persist: false, refreshView: false });
                    if (!firstScenarioWithData && scenarioDataStore[normalized].length > 0) {
                        firstScenarioWithData = normalized;
                    }
                });
            } else if (Array.isArray(result[LEGACY_CACHE_KEY])) {
                const fallbackId = SCRAPE_SCENARIOS[0].id;
                setScenarioData(fallbackId, result[LEGACY_CACHE_KEY], { persist: true, refreshView: false });
                chrome.storage.local.remove(LEGACY_CACHE_KEY);
                if (result[LEGACY_CACHE_KEY].length > 0) {
                    firstScenarioWithData = fallbackId;
                }
            }
            if (firstScenarioWithData) {
                activeDataScenarioId = firstScenarioWithData;
            }
            updateDataScenarioTabsState();
            updateScenarioStorageList();
            applyCurrentDataFromScenario();
            refreshConsoleStatsForScenario();
            // Data loaded silently - stats are displayed inline for each scenario
        });
    }

    function requestStopAutoScroll({ silent = false } = {}) {
        if (!autoScrollRunning) {
            updateAutoScrollControls();
            return;
        }
        autoScrollRunning = false;
        const stoppedScenarioId = autoScrollScenarioId;
        autoScrollScenarioId = null;
        updateAutoScrollControls();
        sendMessageToActiveTab({ action: "stop_scroll" }, (response) => {
            if (response && response.success && Array.isArray(response.data)) {
                updateUI(response.data, response.scenarioId || stoppedScenarioId || activeDataScenarioId);
            }
            if (!silent) {
                setStatus('Stopped.', 'success');
            }
        });
    }

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
            } else if (target === 'storage') {
                updateStorageUI();
            } else if (target === 'console') {
                // Update auto-scroll controls for console view
                updateAutoScrollControls();
                refreshConsoleStatsForScenario();
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
    const SEARCH_HISTORY_KEY = 'x_data_search_history';
    const MAX_HISTORY_ITEMS = 10;
    let searchHistory = [];

    // Load search history from localStorage
    function loadSearchHistory() {
        try {
            const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
            searchHistory = stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.error('Failed to load search history:', err);
            searchHistory = [];
        }
    }

    // Save search history to localStorage
    function saveSearchHistory() {
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
        } catch (err) {
            console.error('Failed to save search history:', err);
        }
    }

    // Add item to search history
    function addToSearchHistory(query) {
        if (!query || query.trim().length === 0) return;

        const trimmedQuery = query.trim();

        // Remove if already exists (move to top)
        searchHistory = searchHistory.filter(item => item !== trimmedQuery);

        // Add to beginning
        searchHistory.unshift(trimmedQuery);

        // Limit to max items
        if (searchHistory.length > MAX_HISTORY_ITEMS) {
            searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
        }

        saveSearchHistory();
        renderSearchHistory();
    }

    // Remove item from search history
    function removeFromSearchHistory(query) {
        searchHistory = searchHistory.filter(item => item !== query);
        saveSearchHistory();
        renderSearchHistory();
    }

    // Clear all search history
    function clearSearchHistory() {
        searchHistory = [];
        saveSearchHistory();
        renderSearchHistory();
    }

    // Render search history dropdown
    function renderSearchHistory() {
        if (!searchHistoryList || !searchHistoryEmpty) return;

        searchHistoryList.innerHTML = '';

        if (searchHistory.length === 0) {
            searchHistoryList.style.display = 'none';
            searchHistoryEmpty.style.display = 'flex';
        } else {
            searchHistoryList.style.display = 'block';
            searchHistoryEmpty.style.display = 'none';

            searchHistory.forEach(query => {
                const item = document.createElement('div');
                item.className = 'search-history-item';
                item.innerHTML = `
                    <div class="search-history-icon">
                        <i class="ri-search-line"></i>
                    </div>
                    <div class="search-history-text">${escapeHtml(query)}</div>
                    <button class="search-history-remove" title="Remove" aria-label="Remove from history">
                        <i class="ri-close-line"></i>
                    </button>
                `;

                // Click history item to search
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.search-history-remove')) {
                        return; // Handle by remove button
                    }
                    searchInput.value = query;
                    searchInput.dispatchEvent(new Event('input'));
                    hideSearchHistory();
                });

                // Remove button
                const removeBtn = item.querySelector('.search-history-remove');
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    removeFromSearchHistory(query);
                });

                searchHistoryList.appendChild(item);
            });
        }
    }

    // Show search history dropdown
    function showSearchHistory() {
        if (!searchHistoryDropdown) return;
        searchHistoryDropdown.classList.remove('hidden');
    }

    // Hide search history dropdown
    function hideSearchHistory() {
        if (!searchHistoryDropdown) return;
        searchHistoryDropdown.classList.add('hidden');
    }

    // Initialize search history
    loadSearchHistory();
    renderSearchHistory();

    if (searchInput) {
        // Show history on focus
        searchInput.addEventListener('focus', () => {
            showSearchHistory();
        });

        // Handle input changes
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();

            // Toggle clear button visibility
            if (clearSearchBtn) {
                clearSearchBtn.style.display = query.length > 0 ? 'flex' : 'none';
            }

            let filtered = currentData.filter(tweet =>
                tweet.text.toLowerCase().includes(query)
            );

            // Apply current sort if active
            if (sortState.column) {
                filtered = sortData(filtered, sortState.column, sortState.direction);
            }

            renderTable(filtered);
        });

        // Handle Enter key to save history
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query.length > 0) {
                    addToSearchHistory(query);
                    hideSearchHistory();
                }
            } else if (e.key === 'Escape') {
                hideSearchHistory();
            }
        });
    }

    // Clear search button handler
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.style.display = 'none';

            // Re-render table with all data
            let dataToRender = currentData;
            if (sortState.column) {
                dataToRender = sortData(currentData, sortState.column, sortState.direction);
            }
            renderTable(dataToRender);

            // Focus back to input
            searchInput.focus();
        });
    }

    // Clear history button handler
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Clear all search history?')) {
                clearSearchHistory();
            }
        });
    }

    // Click outside to close dropdown
    document.addEventListener('click', (e) => {
        if (!searchHistoryDropdown) return;

        const searchBox = document.querySelector('.search-box');
        if (searchBox && !searchBox.contains(e.target)) {
            hideSearchHistory();
        }
    });

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

    renderDataScenarioTabs();
    bootstrapScenarioDataFromStorage();

    // Initialize time range selector
    const timeRangeButtons = document.querySelectorAll('.time-range-btn');

    function updateTimeRangeButtons() {
        timeRangeButtons.forEach(btn => {
            const days = parseInt(btn.dataset.days);
            btn.classList.toggle('active', days === myPostsTimeRange);
        });

        // Update the scenario meta text
        const scenarioMeta = document.querySelector('[data-scenario="analytics_auto"] .scenario-meta');
        if (scenarioMeta) {
            const daysText = myPostsTimeRange === 7 ? '7 days' :
                myPostsTimeRange === 14 ? '14 days' :
                    myPostsTimeRange === 28 ? '28 days' : '90 days';
            scenarioMeta.textContent = `${daysText} · Auto-scroll`;
        }
    }

    // Load saved time range
    chrome.storage.local.get([MY_POSTS_TIME_RANGE_KEY], (result) => {
        if (result[MY_POSTS_TIME_RANGE_KEY]) {
            myPostsTimeRange = result[MY_POSTS_TIME_RANGE_KEY];
        }
        updateTimeRangeButtons();
    });

    // Handle time range selection
    timeRangeButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const days = parseInt(button.dataset.days);
            myPostsTimeRange = days;

            // Save to storage
            chrome.storage.local.set({ [MY_POSTS_TIME_RANGE_KEY]: days });

            // Update UI
            updateTimeRangeButtons();
        });
    });

    // Note: toggleSidebarBtn has been removed from the UI
    // If we need to restore it in the future, we can add it back
    // For now, the sidebar will be always visible when embedded

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

    function setStatus(msg, type = 'normal', autoClear = false) {
        statusDiv.textContent = msg;
        statusDiv.className = 'status ' + type;

        // Auto-clear after delay if requested
        if (autoClear && msg) {
            setTimeout(() => {
                if (statusDiv.textContent === msg) {
                    statusDiv.textContent = '';
                    statusDiv.className = 'status';
                }
            }, 3000);
        }
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
            // Use local date instead of UTC
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const dayOfMonth = String(date.getDate()).padStart(2, '0');
            display = `${year}-${month}-${dayOfMonth}`;
        }

        // Use local date for dateLabel to match the tooltip
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const dayOfMonth = String(date.getDate()).padStart(2, '0');
        const dateLabel = `${year}-${month}-${dayOfMonth}`;

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

    function formatBytes(bytes) {
        if (bytes === 0 || bytes === null || bytes === undefined) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    // --- Storage Monitoring Functions ---
    async function getStorageInfo() {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                chrome.storage.local.get([DATA_CACHE_STORAGE_KEY, LEGACY_CACHE_KEY], (result) => {
                    let tweets = [];
                    const storedByScenario = result[DATA_CACHE_STORAGE_KEY];
                    if (storedByScenario && typeof storedByScenario === 'object') {
                        Object.values(storedByScenario).forEach(list => {
                            if (Array.isArray(list)) {
                                tweets = tweets.concat(list);
                            }
                        });
                    } else if (Array.isArray(result[LEGACY_CACHE_KEY])) {
                        tweets = result[LEGACY_CACHE_KEY];
                    }
                    const tweetCount = tweets.length;
                    const avgSize = tweetCount > 0 ? bytesInUse / tweetCount : 0;

                    // Chrome storage.local default quota is 5MB (QUOTA_BYTES = 5242880)
                    const quota = 5 * 1024 * 1024; // 5MB in bytes
                    const usagePercent = (bytesInUse / quota) * 100;
                    let lastUpdateIso = null;
                    tweets.forEach(tweet => {
                        if (!tweet || !tweet.timestamp) return;
                        const ts = new Date(tweet.timestamp);
                        if (Number.isNaN(ts.getTime())) return;
                        if (!lastUpdateIso || ts.getTime() > new Date(lastUpdateIso).getTime()) {
                            lastUpdateIso = ts.toISOString();
                        }
                    });

                    resolve({
                        bytesInUse,
                        quota,
                        usagePercent,
                        tweetCount,
                        avgSize,
                        lastUpdateIso
                    });
                });
            });
        });
    }

    async function updateStorageUI() {
        if (!storageUsedSpan) return;

        const info = await getStorageInfo();

        storageUsedSpan.textContent = formatBytes(info.bytesInUse);
        storageQuotaSpan.textContent = `配额: ${formatBytes(info.quota)}`;
        storagePercentSpan.textContent = `${info.usagePercent.toFixed(1)}%`;
        storageBarFill.style.width = `${Math.min(info.usagePercent, 100)}%`;

        // Change gradient and glow based on usage
        if (info.usagePercent >= 90) {
            storageBarFill.style.background = 'linear-gradient(90deg, #f4212e 0%, #ff4458 100%)';
            storageBarFill.style.boxShadow = '0 0 12px rgba(244, 33, 46, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
        } else if (info.usagePercent >= 70) {
            storageBarFill.style.background = 'linear-gradient(90deg, #ff9500 0%, #ffb340 100%)';
            storageBarFill.style.boxShadow = '0 0 12px rgba(255, 149, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
        } else {
            storageBarFill.style.background = 'linear-gradient(90deg, #00ba7c 0%, #00d68f 100%)';
            storageBarFill.style.boxShadow = '0 0 12px rgba(0, 186, 124, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
        }

        storageTweetCountSpan.textContent = info.tweetCount.toLocaleString();
        storageAvgSizeSpan.textContent = formatBytes(info.avgSize);

        if (info.lastUpdateIso) {
            const lastUpdate = formatTimestamp(info.lastUpdateIso);
            storageLastUpdateSpan.textContent = lastUpdate.title;
        } else {
            storageLastUpdateSpan.textContent = '暂无数据';
        }
    }

    function textLooksTruncated(text = '') {
        const trimmed = text.trim();
        return trimmed.length === 0 || trimmed.endsWith('…') || trimmed.endsWith('...');
    }

    function shouldSyncTweet(tweet, force = false) {
        if (!tweet || !tweet.id) return false;
        if (force) return true;

        // Always sync if never synced before
        if (!tweet.vxMeta || !tweet.vxMeta.lastFetchedAt) return true;

        // Sync if text looks truncated
        if (textLooksTruncated(tweet.text || '')) return true;

        // Sync if timestamp is not precise (only has date, no time)
        // Scraped timestamps are usually dates without hours/minutes/seconds
        if (tweet.timestamp) {
            const ts = new Date(tweet.timestamp);
            if (!isNaN(ts.getTime())) {
                // Check if the timestamp only has date (00:00:00)
                const hours = ts.getUTCHours();
                const minutes = ts.getUTCMinutes();
                const seconds = ts.getUTCSeconds();
                const milliseconds = ts.getUTCMilliseconds();
                if (hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
                    return true; // Likely a date-only timestamp, need precise time
                }
            }
        } else {
            return true; // No timestamp at all
        }

        // Sync if stats look incomplete or zero (likely not fetched from API)
        const stats = tweet.stats || {};
        const hasLowStats = (stats.views || 0) === 0 && (stats.likes || 0) === 0 && (stats.retweets || 0) === 0;
        if (hasLowStats) return true;

        return false;
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

        // Merge text
        const fullText = vxTweet?.full_text || vxTweet?.text || payload.full_text || payload.text;
        if (fullText) {
            merged.text = fullText;
        }

        // Merge timestamp - VxTwitter provides precise timestamp
        const vxCreatedAt = vxTweet?.date || vxTweet?.created_at || payload.date || payload.created_at;
        const vxDateEpoch = vxTweet?.date_epoch || payload.date_epoch;

        console.log(`[VxTwitter] Tweet ${tweet.id}: date="${vxCreatedAt}", date_epoch=${vxDateEpoch}, original="${tweet.timestamp}"`);

        let vxTimestamp = null;
        if (vxDateEpoch) {
            // Convert Unix timestamp (seconds) to ISO string
            vxTimestamp = new Date(vxDateEpoch * 1000).toISOString();
        } else if (vxCreatedAt) {
            vxTimestamp = parseIsoTimestamp(vxCreatedAt);
        }

        if (vxTimestamp) {
            console.log(`[VxTwitter] Tweet ${tweet.id}: Updating timestamp from "${tweet.timestamp}" to "${vxTimestamp}"`);
            merged.timestamp = vxTimestamp;
        } else {
            console.warn(`[VxTwitter] Tweet ${tweet.id}: Failed to parse timestamp from date="${vxCreatedAt}", epoch=${vxDateEpoch}`);
        }

        // Merge stats - VxTwitter provides accurate engagement metrics
        const vxStats = vxTweet?.stats || vxTweet?.public_metrics || vxTweet?.metrics || {};
        const existingStats = tweet.stats || {};

        merged.stats = {
            replies: vxStats.replies ?? vxStats.reply_count ?? existingStats.replies ?? 0,
            retweets: vxStats.retweets ?? vxStats.retweet_count ?? existingStats.retweets ?? 0,
            likes: vxStats.likes ?? vxStats.favorite_count ?? vxStats.like_count ?? existingStats.likes ?? 0,
            views: vxStats.views ?? vxStats.view_count ?? existingStats.views ?? 0,
            bookmarks: vxStats.bookmarks ?? vxStats.bookmark_count ?? existingStats.bookmarks ?? 0,
            quotes: vxStats.quotes ?? vxStats.quote_count ?? existingStats.quotes ?? 0
        };

        // Merge media
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

    async function refreshDetailsFromVxTwitter(force = false) {
        if (vxSyncInProgress) {
            console.log('X Data Scraper: VxTwitter sync already in progress, skipping');
            return;
        }
        if (!currentData || currentData.length === 0) {
            updateDetailStatus('还没有可补充的缓存数据。');
            return;
        }

        const targets = currentData.filter(tweet => shouldSyncTweet(tweet, force));
        console.log(`X Data Scraper: VxTwitter sync - Total tweets: ${currentData.length}, Targets: ${targets.length}, Force: ${force}`);

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
                console.log(`[VxTwitter] Response for tweet ${tweet.id}:`, JSON.stringify(payload, null, 2));
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
            updateUI(currentData, activeDataScenarioId);
            updateDetailStatus('');
            const toastType = successCount === targets.length ? 'success' : (successCount > 0 ? 'success' : 'error');
            showToast(`VxTwitter 同步完成，成功 ${successCount}/${targets.length} 条`, toastType, 3000);

            // Notify content script to update its cache
            sendMessageToActiveTab({ action: "update_cache", scenarioId: activeDataScenarioId, data: currentData }, (response) => {
                if (response && response.success) {
                    console.log(`X Data Scraper: Content script cache updated, total: ${response.count}`);
                }
            });
        } else {
            updateDetailStatus('VxTwitter 请求未能更新任何推文。', 'error');
        }

        setRefreshButtonState(false);
        vxSyncInProgress = false;
    }

    function updateUI(data, scenarioId = activeDataScenarioId) {
        setScenarioData(scenarioId, Array.isArray(data) ? data : []);
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
                if (callback) callback(null);
                return;
            }

            const tabId = tabs[0].id;
            chrome.tabs.sendMessage(tabId, msg, (response) => {
                if (chrome.runtime.lastError) {
                    console.log("Content script not detected, injecting...");
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        files: ['content.js']
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error("Injection failed:", chrome.runtime.lastError.message);
                            setStatus("Failed to inject script. Reload page.", "error");
                            if (callback) callback(null);
                        } else {
                            setTimeout(() => {
                                chrome.tabs.sendMessage(tabId, msg, (retryResponse) => {
                                    if (chrome.runtime.lastError) {
                                        console.error("Message retry failed:", chrome.runtime.lastError.message);
                                        if (callback) callback(null);
                                        return;
                                    }
                                    if (callback) {
                                        callback(retryResponse);
                                    }
                                });
                            }, 300);
                        }
                    });
                } else if (callback) {
                    callback(response);
                }
            });
        });
    }

    // Note: Global stop button has been removed - stop functionality is now integrated into scenario buttons
    // The Auto-Scroll button will transform into a Stop button when auto-scroll is active

    // Handle updates during auto-scroll
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "update_count") {
            // Update the inline data count for the specific scenario
            const scenarioId = request.scenarioId;
            if (scenarioId) {
                // Update the scenario's inline data count
                refreshConsoleStatsForScenario(scenarioId);

                // Also update the status message to show progress
                const scenario = getScenarioById(scenarioId);
                setStatus(`Scraping ${scenario.label}... ${request.count} tweets found`, 'success');
            }
        } else if (request.action === "scroll_finished") {
            autoScrollRunning = false;
            autoScrollScenarioId = null;
            updateAutoScrollControls();
            if (Array.isArray(request.data)) {
                updateUI(request.data, request.scenarioId || activeDataScenarioId);
            }
            setStatus('Auto-scroll finished.', 'success', true); // Auto-clear after 3s
        }
    });

    copyBtn.addEventListener('click', () => {
        // Only copy tweet links from the currently active data scenario
        const activeData = getScenarioData(activeDataScenarioId);

        if (!activeData || activeData.length === 0) {
            showToast('没有可复制的推文链接', 'info', 2000);
            return;
        }

        const tweetLinks = activeData.map(tweet => {
            const url = resolveTweetUrl(tweet);
            return url || `https://x.com/i/web/status/${tweet.id}`;
        }).filter(url => url); // Filter out any null URLs

        if (tweetLinks.length === 0) {
            showToast('没有有效的推文链接', 'info', 2000);
            return;
        }

        // Create text with each link on a new line
        const text = tweetLinks.join('\n');

        // Use fallback method for popup pages where Clipboard API may be blocked
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            const success = document.execCommand('copy');
            document.body.removeChild(textarea);

            if (success) {
                if (copyBtn) {
                    copyBtn.innerHTML = iconMarkup.copySuccess;
                    setTimeout(() => {
                        if (copyBtn) copyBtn.innerHTML = iconMarkup.copy;
                    }, 2000);
                }
                showToast(`已复制 ${tweetLinks.length} 条推文链接`, 'success', 2000);
            } else {
                showToast('复制失败，请重试', 'error', 2000);
            }
        } catch (err) {
            document.body.removeChild(textarea);
            console.error('X Data Scraper: Failed to copy tweet links', err);
            showToast(`复制失败: ${err.message}`, 'error', 3000);
        }
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

    // --- Storage View Event Listeners ---
    if (refreshStorageBtn) {
        refreshStorageBtn.addEventListener('click', async () => {
            await updateStorageUI();
            showToast('存储统计已刷新', 'success', 2000);
        });
    }

    if (clearStorageBtn) {
        clearStorageBtn.addEventListener('click', () => {
            if (confirm('确定要清空所有缓存数据吗？此操作不可恢复。')) {
                chrome.storage.local.clear(() => {
                    Object.keys(scenarioDataStore).forEach(key => delete scenarioDataStore[key]);
                    updateDataScenarioTabsState();
                    updateScenarioStorageList();
                    applyCurrentDataFromScenario();
                    refreshConsoleStatsForScenario();
                    updateStorageUI();
                    showToast('缓存已清空', 'success', 2000);
                    setStatus('Cache cleared.', 'success');
                    SCRAPE_SCENARIOS.forEach(scenario => {
                        sendMessageToActiveTab({ action: "update_cache", scenarioId: scenario.id, data: [] });
                    });
                });
            }
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
            // Add shadow to header when scrolled
            if (tableContainer.scrollTop > 0) {
                tableContainer.classList.add('scrolled');
            } else {
                tableContainer.classList.remove('scrolled');
            }

            // Update tooltip position if visible
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

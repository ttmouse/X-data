// X Data Scraper - Content Script

let isScrolling = false;
let allTweetsMap = new Map(); // Key: ID, Value: Tweet Object
let sidebarVisible = false;

// Configuration
const SIDEBAR_WIDTH = 400;
const SIDEBAR_ID = 'x-data-scraper-sidebar';
const ANALYTICS_PAGE_URL = 'https://x.com/i/account_analytics/content?type=posts&sort=date&dir=desc&days=90';
const ROUTER_METHOD_NAMES = ['push', 'navigate', 'route', 'go', 'open', 'transitionTo', 'replace'];
const ROUTER_PATH_CANDIDATES = [
  ['__NEXT_ROUTER__'],
  ['next', 'router'],
  ['__ROUTER__'],
  ['__router'],
  ['__NUXT__', '$router'],
  ['__NUXT__', 'router'],
  ['__X', 'router'],
  ['__X', 'navigator'],
  ['app', 'router'],
  ['__TWITTER_ROUTER__'],
  ['__twttr', 'router']
];

// Load cached data on init
chrome.storage.local.get(['cached_tweets'], (result) => {
  if (result.cached_tweets) {
    result.cached_tweets.forEach(tweet => allTweetsMap.set(tweet.id, tweet));
    console.log(`X Data Scraper: Loaded ${allTweetsMap.size} tweets from cache.`);
  }
});

// Helper to save cache
function saveCache() {
  const data = Array.from(allTweetsMap.values());
  chrome.storage.local.set({ cached_tweets: data });
}

function parseCount(value) {
  if (!value) return null;
  const normalized = value.toString().replace(/,/g, '').trim();
  if (!normalized) return null;
  const match = normalized.match(/(\d+(\.\d+)?)([KkMm]?)/);
  if (!match) return null;

  let number = parseFloat(match[1]);
  const suffix = match[3] ? match[3].toLowerCase() : '';

  if (suffix === 'k') number *= 1000;
  else if (suffix === 'm') number *= 1000000;

  return Math.round(number);
}

function escapeHtmlInline(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildTweetPermalink(rawHref, tweetId) {
  const fallback = tweetId ? `https://x.com/i/web/status/${tweetId}` : null;
  if (!rawHref || typeof rawHref !== 'string') return fallback;

  let href = rawHref.trim();
  if (!href) return fallback;

  if (/^https?:\/\//i.test(href)) {
    // Already absolute.
  } else if (href.startsWith('//')) {
    href = `https:${href}`;
  } else if (href.startsWith('/')) {
    href = `https://x.com${href}`;
  } else {
    href = `https://x.com/${href}`;
  }

  if (/\/status\/\d+/i.test(href)) {
    return href;
  }

  if (/\/content\/\d+/i.test(href) && fallback) {
    // Twitter "content" routes are embeds; prefer the canonical status URL.
    return fallback;
  }

  return href || fallback;
}

function normalizeUrlForComparison(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function extractTweetPath(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname.replace(/\/+$/, '');
  } catch (err) {
    if (url.startsWith('/')) {
      const trimmed = url.split('?')[0].split('#')[0];
      return trimmed.replace(/\/+$/, '');
    }
  }
  return '';
}

function findInPageTweetLink(tweetId, targetUrl) {
  const normalizedId = tweetId ? String(tweetId).trim() : '';
  if (normalizedId) {
    const directSelector = `a[href*="/status/${normalizedId}"]`;
    const directMatch = document.querySelector(directSelector);
    if (directMatch) return directMatch;
  }

  const path = extractTweetPath(targetUrl);
  if (path) {
    const pathSelectors = [
      `a[href="${path}"]`,
      `a[href="${path.split('?')[0]}"]`,
      `a[href="https://x.com${path}"]`,
      `a[href="https://twitter.com${path}"]`,
      `a[href="//x.com${path}"]`
    ];
    for (const selector of pathSelectors) {
      const candidate = document.querySelector(selector);
      if (candidate) return candidate;
    }
  }

  if (normalizedId) {
    const looseMatch = Array.from(document.querySelectorAll('a[href*="/status/"]'))
      .find(link => (link.getAttribute('href') || '').includes(normalizedId));
    if (looseMatch) return looseMatch;
  }

  return null;
}

function simulateTweetLinkClick(link) {
  if (!link) return false;
  try {
    const originalTarget = link.getAttribute('target');
    if (originalTarget && originalTarget.toLowerCase() === '_blank') {
      link.dataset._xDataOrigTarget = originalTarget;
      link.removeAttribute('target');
    }
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0
    });
    const eventResult = link.dispatchEvent(event);
    if (eventResult && typeof link.click === 'function') {
      // Default action still allowed, ensure click fires.
      link.click();
    }
    if (originalTarget) {
      setTimeout(() => {
        if (link.dataset._xDataOrigTarget) {
          link.setAttribute('target', link.dataset._xDataOrigTarget);
          delete link.dataset._xDataOrigTarget;
        }
      }, 0);
    }
    return true;
  } catch (err) {
    console.warn('X Data Scraper: Failed to simulate tweet click', err);
    return false;
  }
}

function createSyntheticTweetLink(tweetId, targetUrl) {
  if (!targetUrl) return null;
  const anchor = document.createElement('a');
  anchor.href = targetUrl;
  anchor.target = '_self';
  anchor.setAttribute('role', 'link');
  anchor.setAttribute('tabindex', '-1');
  anchor.dataset.xDataSyntheticLink = 'true';
  anchor.style.position = 'fixed';
  anchor.style.top = '-1000px';
  anchor.style.left = '-1000px';
  anchor.style.width = '1px';
  anchor.style.height = '1px';
  anchor.style.opacity = '0';
  anchor.style.pointerEvents = 'none';
  anchor.textContent = tweetId ? `tweet-${tweetId}` : 'tweet';
  document.body.appendChild(anchor);
  return anchor;
}

function getByPath(root, path) {
  return path.reduce((acc, key) => {
    if (!acc) return null;
    try {
      return acc[key];
    } catch {
      return null;
    }
  }, root);
}

function collectRouterCandidates() {
  const candidates = new Set();
  ROUTER_PATH_CANDIDATES.forEach(path => {
    const candidate = getByPath(window, path);
    if (candidate && typeof candidate === 'object') {
      candidates.add(candidate);
    }
  });

  if (candidates.size === 0) {
    try {
      Object.getOwnPropertyNames(window).forEach(key => {
        if (!/router/i.test(key)) return;
        const candidate = window[key];
        if (candidate && typeof candidate === 'object') {
          candidates.add(candidate);
        }
      });
    } catch (err) {
      console.warn('X Data Scraper: router scan failed', err);
    }
  }

  return Array.from(candidates);
}

function invokeRouter(candidate, targetUrl) {
  if (!candidate) return false;
  for (const method of ROUTER_METHOD_NAMES) {
    const fn = candidate[method];
    if (typeof fn === 'function') {
      try {
        const result = fn.call(candidate, targetUrl);
        if (result && typeof result.then === 'function') {
          result.catch(err => console.warn('X Data Scraper: router promise rejected', err));
        }
        return true;
      } catch (err) {
        console.warn('X Data Scraper: router navigation failed', err);
      }
    }
  }
  return false;
}

function attemptHistoryNavigation(targetUrl) {
  try {
    const parsed = new URL(targetUrl, window.location.href);
    if (parsed.origin !== window.location.origin) return false;
    window.history.pushState({}, '', parsed.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    return true;
  } catch (err) {
    console.warn('X Data Scraper: history navigation failed', err);
    return false;
  }
}

function attemptRouterNavigation(targetUrl) {
  const candidates = collectRouterCandidates();
  for (const candidate of candidates) {
    if (invokeRouter(candidate, targetUrl)) {
      return true;
    }
  }
  return attemptHistoryNavigation(targetUrl);
}

function attemptLinkNavigation(tweetId, targetUrl) {
  let link = findInPageTweetLink(tweetId, targetUrl);
  let synthetic = false;
  if (!link) {
    link = createSyntheticTweetLink(tweetId, targetUrl);
    synthetic = !!link;
  }
  if (!link) return false;
  const success = simulateTweetLinkClick(link);
  if (synthetic) {
    setTimeout(() => {
      try {
        if (link && link.dataset.xDataSyntheticLink) {
          link.remove();
        }
      } catch { }
    }, 0);
  }
  return success;
}

function monitorNavigationTransition(prevComparable, targetComparable, targetUrl) {
  if (!targetComparable) return;
  if (prevComparable === targetComparable) return;
  const maxWait = 5000;
  const interval = 150;
  const start = Date.now();

  const check = () => {
    const currentComparable = normalizeUrlForComparison(window.location.href);
    if (currentComparable === targetComparable) {
      console.log('X Data Scraper: SPA navigation successful');
      return;
    }
    if (currentComparable !== prevComparable && currentComparable !== '') {
      console.log('X Data Scraper: Navigation to different page detected');
      return;
    }
    if (Date.now() - start >= maxWait) {
      console.warn('X Data Scraper: SPA navigation timeout, page may not have loaded');
      return;
    }
    setTimeout(check, interval);
  };

  setTimeout(check, 200);
}

function navigateWithinPage(tweetId, targetUrl) {
  if (!targetUrl) return false;
  const prevComparable = normalizeUrlForComparison(window.location.href);
  const targetComparable = normalizeUrlForComparison(targetUrl);

  let initiated = attemptRouterNavigation(targetUrl);
  if (!initiated) {
    initiated = attemptLinkNavigation(tweetId, targetUrl);
  }

  if (!initiated) return false;

  monitorNavigationTransition(prevComparable, targetComparable, targetUrl);
  return true;
}

function parseTimestampFromString(str) {
  if (!str) return null;
  let text = str.replace(/\s+/g, ' ').replace(/·/g, ' ').trim();
  if (!text) return null;

  // Quickly exit if no digits
  if (!/\d/.test(text)) return null;

  // Handle Chinese date formats like 2025年12月18日 23:00
  const zhMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})(?::(\d{2}))?)?/);
  if (zhMatch) {
    const [, year, month, day, hour = '00', minute = '00'] = zhMatch;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
    const zhDate = new Date(iso);
    if (!isNaN(zhDate.getTime())) {
      return zhDate.toISOString();
    }
  }

  let normalized = text;
  normalized = normalized
    .replace(/上午|早上|清晨|凌晨/g, 'AM')
    .replace(/下午|晚上|傍晚|午夜/g, 'PM');

  normalized = normalized
    .replace(/年/g, '-')
    .replace(/月/g, '-')
    .replace(/日/g, '');

  normalized = normalized.replace(/(\d{4})\/(\d{1,2})\/(\d{1,2})/g, '$1-$2-$3');

  normalized = normalized.replace(/(\d+)(st|nd|rd|th)/gi, '$1');

  normalized = normalized.replace(/(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})/g, '$1T$2');

  const parsed = new Date(normalized);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function extractTimestamp(article) {
  const seen = new Set();
  const consider = (value) => {
    if (!value || seen.has(value)) return null;
    seen.add(value);
    const parsed = parseTimestampFromString(value);
    return parsed;
  };

  const timeNode = article.querySelector('time');
  if (timeNode) {
    const attr = timeNode.getAttribute('datetime') || timeNode.getAttribute('title');
    const direct = consider(attr);
    if (direct) return direct;
    const indirect = consider(timeNode.textContent);
    if (indirect) return indirect;
  }

  const timestampLink = article.querySelector('a[href*="/status/"][role="link"], a[href*="/status/"][aria-label]');
  if (timestampLink) {
    const attr = timestampLink.getAttribute('aria-label') || timestampLink.getAttribute('title');
    const parsedFromAttr = consider(attr);
    if (parsedFromAttr) return parsedFromAttr;
    const parsedFromText = consider(timestampLink.textContent);
    if (parsedFromText) return parsedFromText;
  }

  // Look for bullet separator ( · Date )
  const bulletSpan = Array.from(article.querySelectorAll('span'))
    .find(span => span.textContent && span.textContent.trim() === '·');

  if (bulletSpan && bulletSpan.nextElementSibling) {
    const sibling = bulletSpan.nextElementSibling;
    if (sibling) {
      const parsed = consider(sibling.textContent);
      if (parsed) return parsed;
    }
  }

  // Broader scan: look for spans/divs that look like dates but skip tweet text areas
  const candidates = article.querySelectorAll('span, div');
  for (const node of candidates) {
    const isTweetBody = node.closest('[data-testid="tweetText"], div[dir="auto"]');
    if (isTweetBody) continue;
    const text = node.textContent ? node.textContent.trim() : '';
    if (!text) continue;
    if (!/\d/.test(text)) continue;
    if (!(/[年月]/.test(text) || /\d{1,2}:\d{2}/.test(text) || /[A-Za-z]{3,}/.test(text))) continue;
    const parsed = consider(text);
    if (parsed) return parsed;
  }

  return null;
}

function getStatValue(article, testId, iconName) {
  if (testId) {
    const el = article.querySelector(`[data-testid="${testId}"]`);
    if (el) {
      const label = el.getAttribute('aria-label');
      const textValue = el.innerText || el.textContent || "";
      const parsed = parseCount(label) ?? parseCount(textValue);
      if (parsed !== null) return parsed;
    }
  }

  if (iconName) {
    const icon = article.querySelector(`svg[data-icon="${iconName}"]`);
    if (icon) {
      const container = icon.closest('div');
      if (container) {
        const valueNode = Array.from(container.querySelectorAll('span, div'))
          .find(node => node.textContent && /\d/.test(node.textContent));
        if (valueNode) {
          const parsed = parseCount(valueNode.textContent);
          if (parsed !== null) return parsed;
        }
      }
    }
  }

  return 0;
}

function scrapeCurrentView() {
  const articles = document.querySelectorAll('article, li div[data-testid="cellInnerDiv"], li');
  let newCount = 0;
  let modified = false;

  articles.forEach(article => {
    // 1. Extract Tweet ID and Link
    const links = article.querySelectorAll('a[href*="/status/"], a[href*="/content/"]');
    let tweetUrl = null;
    let tweetId = null;

    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const statusMatch = href.match(/\/status\/(\d+)/);
      const contentMatch = href.match(/\/content\/(\d+)/);

      const id = statusMatch ? statusMatch[1] : (contentMatch ? contentMatch[1] : null);

      if (id) {
        tweetId = id;
        tweetUrl = buildTweetPermalink(href, tweetId);
        break; // Found the main link
      }
    }

    if (!tweetId) return;

    // 2. Extract Text
    const textNode = article.querySelector('div[dir="auto"], div[data-testid="tweetText"]');
    const text = textNode ? textNode.innerText.trim() : "";

    // 3. Extract Images
    const images = [];
    const imgs = article.querySelectorAll('img');
    imgs.forEach(img => {
      const src = img.src;
      if (src && src.includes('pbs.twimg.com/media')) {
        images.push(src);
      }
    });

    // 4. Extract Stats
    const stats = {
      replies: getStatValue(article, 'reply', 'icon-reply-stroke'),
      retweets: getStatValue(article, 'retweet', 'icon-retweet-stroke'),
      likes: getStatValue(article, 'like', 'icon-heart-stroke'),
      views: 0,
      bookmarks: getStatValue(article, 'bookmark', 'icon-bookmark-stroke')
    };

    // Views are often in a slightly different structure or data-testid
    const analyticsLink = article.querySelector('a[href*="/analytics"]');
    if (analyticsLink) {
      const label = analyticsLink.getAttribute('aria-label') || analyticsLink.innerText || "";
      const parsedViews = parseCount(label);
      stats.views = parsedViews !== null ? parsedViews : 0;
    } else {
      const viewGroup = article.querySelector('[data-testid="app-text-transition-container"]');
      if (viewGroup) {
        const parsedViews = parseCount(viewGroup.innerText);
        stats.views = parsedViews !== null ? parsedViews : 0;
      } else {
        stats.views = getStatValue(article, null, 'icon-bar-chart');
      }
    }

    // 5. Extract timestamp using multiple selectors
    const timestamp = extractTimestamp(article);

    const tweetData = {
      id: tweetId,
      url: tweetUrl,
      text: text,
      images: [...new Set(images)], // Dedup images within tweet
      stats: stats,
      timestamp: timestamp
    };

    if (allTweetsMap.has(tweetId)) {
      const existing = allTweetsMap.get(tweetId);
      const merged = {
        ...existing,
        text: tweetData.text || existing.text || "",
        images: tweetData.images.length > 0 ? tweetData.images : (existing.images || []),
        stats: tweetData.stats || existing.stats || {},
        timestamp: tweetData.timestamp || existing.timestamp || null,
        url: tweetData.url || existing.url
      };
      allTweetsMap.set(tweetId, merged);
      modified = true;
      return;
    }

    allTweetsMap.set(tweetId, tweetData);
    newCount++;
    modified = true;
  });

  if (modified) {
    saveCache();
  }

  return newCount;
}

async function autoScrollLoop() {
  isScrolling = true;
  let noChangeCount = 0;
  const maxNoChange = 5;

  console.log("X Data Scraper: Starting auto-scroll loop...");

  // Helper to find the scrollable container
  function getScrollContainer() {
    // Strategy: Find a tweet (article/li), then traverse UP to find the first element
    // with overflow-y: auto/scroll.
    const candidates = document.querySelectorAll('article, li div[data-testid="cellInnerDiv"], li');

    if (candidates.length > 0) {
      // Pick the middle candidate to be safe (avoid header/footer edge cases)
      const probe = candidates[Math.floor(candidates.length / 2)];
      let parent = probe ? probe.parentElement : null;

      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        // Check for explicit overflow-y match
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll')) {
          // Double check it has height
          if (parent.clientHeight > 0) {
            return parent;
          }
        }
        parent = parent.parentElement;
      }
    }

    // Fallback? If specific Container not found, maybe window.
    // But User says "Not the whole page". So maybe returning null is safer if strict mode?
    // Let's keep window fallback ONLY if we really can't find the inner one, 
    // but the above traversal should find the provided <div> with overflow: hidden auto.
    return null;
  }

  while (isScrolling) {
    const scroller = getScrollContainer();
    const currentScrollHeight = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
    const currentScrollTop = scroller ? scroller.scrollTop : window.scrollY;

    // Scrape first
    const newItems = scrapeCurrentView();

    // Notify
    chrome.runtime.sendMessage({
      action: "update_count",
      count: allTweetsMap.size
    });

    // Scroll
    // Use smooth scrolling. Increased step size for faster traversal.
    const scrollAmount = 1200;

    if (scroller) {
      scroller.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else {
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }

    // Wait
    // Wait for scroll to settle and content to load
    await new Promise(r => setTimeout(r, 2000));

    const newScrollHeight = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
    const newScrollTop = scroller ? scroller.scrollTop : window.scrollY;

    // Check progress
    // If we haven't moved (hit bottom) OR we scrolled but found no new items...
    // Note: Sometimes we scroll but height doesn't change immediately.
    // We check if we are at the bottom.

    // Check if at bottom
    let isAtBottom = false;
    if (scroller) {
      isAtBottom = Math.abs(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) < 50;
    } else {
      isAtBottom = Math.abs(document.documentElement.scrollHeight - window.scrollY - window.innerHeight) < 50;
    }

    if ((newItems === 0 && isAtBottom) || (newItems === 0 && currentScrollTop === newScrollTop)) {
      noChangeCount++;
      console.log(`X Data Scraper: No new data or stuck. Attempt ${noChangeCount}/${maxNoChange}`);

      // Attempt a larger jump if stuck?
      if (noChangeCount > 2) {
        if (scroller) scroller.scrollTop += 1000;
        else window.scrollBy(0, 1000);
      }

      if (noChangeCount >= maxNoChange) {
        console.log("X Data Scraper: Reached bottom or no more content.");
        break;
      }
    } else {
      noChangeCount = 0;
    }
  }

  isScrolling = false;
  return Array.from(allTweetsMap.values());
}

// Check if current page is the analytics page
function isOnAnalyticsPage() {
  const currentPath = window.location.pathname + window.location.search;
  return currentPath.includes('/i/account_analytics/content');
}

// Navigate to analytics page and wait for it to load
function ensureOnAnalyticsPage(callback) {
  if (isOnAnalyticsPage()) {
    console.log('X Data Scraper: Already on analytics page');
    callback();
    return;
  }

  console.log('X Data Scraper: Not on analytics page, navigating via SPA...');

  let navigationCompleted = false;

  // Set up a listener for when navigation completes
  const checkInterval = setInterval(() => {
    if (isOnAnalyticsPage()) {
      clearInterval(checkInterval);
      navigationCompleted = true;
      // Wait a bit more for content to load
      setTimeout(() => {
        console.log('X Data Scraper: Analytics page loaded, ready to scrape');
        callback();
      }, 1500);
    }
  }, 500);

  // Navigate to the analytics page using SPA navigation
  const navResult = navigateWithinPage(null, ANALYTICS_PAGE_URL);
  console.log('X Data Scraper: Navigation initiated:', navResult ? 'success' : 'failed');

  // Timeout fallback
  setTimeout(() => {
    clearInterval(checkInterval);
    if (!navigationCompleted && !isOnAnalyticsPage()) {
      console.error('X Data Scraper: Failed to navigate to analytics page within timeout');
      console.log('X Data Scraper: Current URL:', window.location.href);
      console.log('X Data Scraper: Target URL:', ANALYTICS_PAGE_URL);
    }
  }, 10000);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    // Ensure we're on analytics page before scraping
    ensureOnAnalyticsPage(() => {
      scrapeCurrentView();
      sendResponse({ success: true, data: Array.from(allTweetsMap.values()) });
    });
    return true; // Keep message channel open for async response
  }
  else if (request.action === "start_scroll") {
    if (!isScrolling) {
      // Ensure we're on analytics page before starting auto-scroll
      ensureOnAnalyticsPage(() => {
        allTweetsMap.clear();
        saveCache(); // Clear cache too
        autoScrollLoop().then(data => {
          // Final data sent when loop finishes naturally
          chrome.runtime.sendMessage({
            action: "scroll_finished",
            data: data
          });
        });
        sendResponse({ success: true, status: "started" });
      });
      return true; // Keep message channel open for async response
    }
    sendResponse({ success: true, status: "already_running" });
  }
  else if (request.action === "stop_scroll") {
    isScrolling = false;
    sendResponse({ success: true, status: "stopping", data: Array.from(allTweetsMap.values()) });
  }
  else if (request.action === "toggle_sidebar") {
    toggleSidebar();
    sendResponse({ success: true, visible: sidebarVisible });
  }
});

function toggleSidebar() {
  let sidebar = document.getElementById(SIDEBAR_ID);
  if (sidebar) {
    sidebarVisible = !sidebarVisible;
    sidebar.style.display = sidebarVisible ? 'block' : 'none';
    adjustXLayout(sidebarVisible);
    if (!sidebarVisible) {
      hideExternalTooltip();
    }
  } else {
    createSidebar();
  }
}

function createSidebar() {
  const sidebar = document.createElement('div');
  sidebar.id = SIDEBAR_ID;
  sidebar.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: ${SIDEBAR_WIDTH}px !important;
        min-width: ${SIDEBAR_WIDTH}px !important;
        height: 100vh !important;
        background: #16181c;
        z-index: 5000;
        border-left: 1px solid #2f3336;
        box-shadow: -5px 0 15px rgba(0,0,0,0.5);
        display: block;
        transition: transform 0.3s ease;
    `;

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('popup.html');
  iframe.style.cssText = `
        width: 100%;
        height: 100%;
        border: none;
    `;

  sidebar.appendChild(iframe);
  document.body.appendChild(sidebar);
  sidebarVisible = true;
  // Small delay to ensure DOM is ready for shift
  setTimeout(() => adjustXLayout(true), 10);
}

function adjustXLayout(visible) {
  const html = document.documentElement;
  const body = document.body;

  if (visible) {
    body.style.setProperty('margin-right', `${SIDEBAR_WIDTH}px`, 'important');
    body.style.transition = 'margin-right 0.3s ease';
  } else {
    body.style.setProperty('margin-right', '0', 'important');
  }

  // Also try to help fixed elements that might be attached to body right
  // This heavily depends on X's specific implementation
  const rightFixedElements = document.querySelectorAll('[style*="position: fixed"][style*="right"]');
  rightFixedElements.forEach(el => {
    if (el.id !== SIDEBAR_ID) {
      if (visible) {
        el.style.setProperty('margin-right', `${SIDEBAR_WIDTH}px`, 'important');
      } else {
        el.style.marginRight = '';
      }
    }
  });
}

function ensureSidebarVisible() {
  let sidebar = document.getElementById(SIDEBAR_ID);
  if (sidebar) {
    sidebar.style.display = 'block';
    sidebarVisible = true;
    adjustXLayout(true);
    return;
  }
  createSidebar();
}

function initSidebarAutoDisplay() {
  const init = () => {
    try {
      ensureSidebarVisible();
    } catch (err) {
      console.error('X Data Scraper: Failed to initialize sidebar', err);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

initSidebarAutoDisplay();

// Tooltip handling for embedded sidebar (to show outside iframe)
let externalTooltipEl = null;
let lastTooltipRowRect = null;
let externalTooltipHideTimer = null;
let externalTooltipHovering = false;
const EXTERNAL_ACTION_ICONS = {
  reply: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9V5L3 12l7 7v-4a7 7 0 017 7c1-7-3-11-7-11z"/></svg>',
  retweet: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h11v5l4-4-4-4v3H6a4 4 0 00-4 4v2"/><path d="M17 17H6v-5l-4 4 4 4v-3h12a4 4 0 004-4v-2"/></svg>',
  like: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-4.35-8.5-7.43C1 10.5 2.75 6 6.5 6c2.04 0 3.57 1.21 4.5 2.54C12.93 7.21 14.46 6 16.5 6c3.75 0 5.5 4.5 3 7.57C18 16.65 12 21 12 21z"/></svg>',
  open: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M5 5h6M5 5v14h14v-6"/></svg>'
};

function ensureExternalTooltip() {
  if (externalTooltipEl) return externalTooltipEl;
  externalTooltipEl = document.createElement('div');
  externalTooltipEl.id = 'x-data-scraper-external-tooltip';
  externalTooltipEl.style.cssText = `
    position: fixed;
    width: 400px;
    max-width: 720px;
    background: #111217;
    color: #f7f9f9;
    border: 1px solid #2f3336;
    border-radius: 12px;
    padding: 14px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.55);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    z-index: 2147483647;
    pointer-events: auto;
    display: none;
  `;
  document.body.appendChild(externalTooltipEl);
  externalTooltipEl.addEventListener('mouseenter', () => {
    externalTooltipHovering = true;
    clearExternalTooltipHideTimer();
  });
  externalTooltipEl.addEventListener('mouseleave', () => {
    externalTooltipHovering = false;
    scheduleExternalTooltipHide();
  });
  return externalTooltipEl;
}

function clearExternalTooltipHideTimer() {
  if (externalTooltipHideTimer) {
    clearTimeout(externalTooltipHideTimer);
    externalTooltipHideTimer = null;
  }
}

function scheduleExternalTooltipHide(delay = 250) {
  clearExternalTooltipHideTimer();
  externalTooltipHideTimer = setTimeout(() => {
    if (externalTooltipHovering) return;
    hideExternalTooltip();
  }, delay);
}

function positionExternalTooltip(rowRect) {
  if (!externalTooltipEl || !rowRect) return;
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;
  const iframe = sidebar.querySelector('iframe');
  if (!iframe) return;
  const iframeRect = iframe.getBoundingClientRect();

  const padding = 16;
  let left = iframeRect.left - externalTooltipEl.offsetWidth - padding;
  if (left < 12) left = 12;

  const rowTop = iframeRect.top + (rowRect.top || 0);
  let top = rowTop;
  const maxTop = window.innerHeight - externalTooltipEl.offsetHeight - 12;
  top = Math.max(12, Math.min(top, maxTop));

  externalTooltipEl.style.left = `${left}px`;
  externalTooltipEl.style.top = `${top}px`;
}

function showExternalTooltip(payload) {
  if (!payload) return;
  const el = ensureExternalTooltip();
  clearExternalTooltipHideTimer();
  externalTooltipHovering = false;
  const tweet = payload.tweet || {};
  const stats = tweet.stats || {};
  const preview = tweet.preview || null;
  const tweetId = tweet.id;
  const tweetUrl = buildTweetPermalink(tweet.url, tweetId);
  let previewHtml = '';
  if (preview && preview.url) {
    const escapedUrl = escapeHtmlInline(preview.url);
    previewHtml = `
      <div style="margin-bottom:10px;border-radius:10px;overflow:hidden;border:1px solid #2f3336;background:#0f1115;position:relative;">
        <img src="${escapedUrl}" alt="${escapeHtmlInline(preview.isVideo ? 'Video preview' : 'Tweet image')}" style="width:100%;height:auto;display:block;">
        ${preview.isVideo ? '<span style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,0.65);color:#f7f9f9;border-radius:6px;padding:2px 6px;font-size:12px;line-height:1;">▶</span>' : ''}
      </div>
    `;
  } else if (preview && preview.isVideo) {
    previewHtml = `
      <div style="margin-bottom:10px;border-radius:10px;border:1px dashed #2f3336;height:120px;display:flex;align-items:center;justify-content:center;color:#8b98a5;font-size:18px;background:rgba(255,255,255,0.02);">
        ▶ 视频内容
      </div>
    `;
  }

  const actionLinks = [];
  if (tweetId) {
    actionLinks.push({
      label: '回复',
      href: `https://twitter.com/intent/tweet?in_reply_to=${tweetId}`,
      icon: EXTERNAL_ACTION_ICONS.reply
    });
    actionLinks.push({
      label: '转推',
      href: `https://twitter.com/intent/retweet?tweet_id=${tweetId}`,
      icon: EXTERNAL_ACTION_ICONS.retweet
    });
    actionLinks.push({
      label: '点赞',
      href: `https://twitter.com/intent/like?tweet_id=${tweetId}`,
      icon: EXTERNAL_ACTION_ICONS.like
    });
  }
  if (tweetUrl) {
    actionLinks.push({
      label: '打开',
      href: tweetUrl,
      icon: EXTERNAL_ACTION_ICONS.open
    });
  }

  const actionsHtml = actionLinks.length ? `
    <div style="display:flex;gap:8px;margin-top:12px;align-items:center;">
      ${actionLinks.map(link => `
        <a href="${link.href}" target="_blank" rel="noopener noreferrer" title="${link.label}" style="flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid #2f3336;color:#f7f9f9;text-decoration:none;background:rgba(255,255,255,0.03);">
          ${link.icon}
        </a>
      `).join('')}
    </div>
  ` : '';

  el.innerHTML = `
    <div style="font-size:12px;color:#8b98a5;margin-bottom:6px;">${escapeHtmlInline(tweet.timestamp || '—')}</div>
    ${previewHtml}
    <div style="white-space:pre-wrap;margin-bottom:10px;">${escapeHtmlInline(tweet.text || '(No text)')}</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px;font-size:12px;color:#b0b7c2;">
      <span>Views: <b style="color:#f7f9f9;">${escapeHtmlInline(stats.views || '0')}</b></span>
      <span>Likes: <b style="color:#f7f9f9;">${escapeHtmlInline(stats.likes || '0')}</b></span>
      <span>RTs: <b style="color:#f7f9f9;">${escapeHtmlInline(stats.retweets || '0')}</b></span>
      <span>Replies: <b style="color:#f7f9f9;">${escapeHtmlInline(stats.replies || '0')}</b></span>
      <span>Saves: <b style="color:#f7f9f9;">${escapeHtmlInline(stats.bookmarks || '0')}</b></span>
    </div>
    ${actionsHtml}
  `;
  el.style.display = 'block';
  lastTooltipRowRect = payload.rowRect || null;

  requestAnimationFrame(() => {
    positionExternalTooltip(payload.rowRect || lastTooltipRowRect);
  });
}

function moveExternalTooltip(rowRect) {
  if (!externalTooltipEl || externalTooltipEl.style.display === 'none') return;
  if (rowRect) lastTooltipRowRect = rowRect;
  positionExternalTooltip(lastTooltipRowRect);
}

function hideExternalTooltip() {
  if (!externalTooltipEl) return;
  externalTooltipEl.style.display = 'none';
  lastTooltipRowRect = null;
  externalTooltipHovering = false;
  clearExternalTooltipHideTimer();
}

window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== 'x-data-scraper') return;
  if (!event.origin || !event.origin.startsWith('chrome-extension://')) return;

  const action = event.data.action;
  const payload = event.data.payload || {};

  if (action === 'show_tooltip') {
    showExternalTooltip(payload);
  } else if (action === 'move_tooltip') {
    moveExternalTooltip(payload.rowRect || null);
  } else if (action === 'hide_tooltip') {
    hideExternalTooltip();
  } else if (action === 'schedule_hide_tooltip') {
    scheduleExternalTooltipHide();
  } else if (action === 'navigate_to_tweet') {
    const targetUrl = buildTweetPermalink(payload.url, payload.tweetId);
    if (!targetUrl) return;
    if (!navigateWithinPage(payload.tweetId, targetUrl)) {
      window.location.assign(targetUrl);
    }
  }
});

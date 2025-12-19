// X Data Scraper - Content Script

let isScrolling = false;
let allTweetsMap = new Map(); // Re-assigned based on active scenario
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
const PENDING_INLINE_ACTION_KEY = 'x_data_pending_inline_action';
const SCRAPE_SCENARIOS = {
  analytics_auto: {
    id: 'analytics_auto',
    label: '内容分析列表',
    targetUrl: ANALYTICS_PAGE_URL,
    matchPathPrefixes: ['/i/account_analytics/content'],
    autoScrollAllowed: true
  },
  bookmarks_auto: {
    id: 'bookmarks_auto',
    label: '我的收藏',
    targetUrl: 'https://x.com/i/bookmarks',
    matchPathPrefixes: ['/i/bookmarks'],
    autoScrollAllowed: true
  },
  current_auto: {
    id: 'current_auto',
    label: '当前页面（自动滚动）',
    useCurrentLocation: true,
    autoScrollAllowed: true
  },
  current_single: {
    id: 'current_single',
    label: '当前页面（第一屏）',
    useCurrentLocation: true,
    autoScrollAllowed: false
  }
};
const SCENARIO_ALIAS_MAP = {
  analytics: 'analytics_auto',
  bookmarks: 'bookmarks_auto',
  lists: 'current_auto',
  search: 'current_auto'
};
const DEFAULT_SCENARIO_ID = 'analytics_auto';
const SCENARIO_CACHE_KEY = 'cached_tweets_by_scenario';
const LEGACY_CACHE_KEY = 'cached_tweets';
const scenarioTweetMaps = new Map();
let activeCacheScenarioId = DEFAULT_SCENARIO_ID;

function getScenarioTweetMap(scenarioId) {
  const normalized = normalizeScenarioId(scenarioId);
  if (!scenarioTweetMaps.has(normalized)) {
    scenarioTweetMaps.set(normalized, new Map());
  }
  return scenarioTweetMaps.get(normalized);
}

function switchScenarioCache(targetScenarioId) {
  const normalized = normalizeScenarioId(targetScenarioId || DEFAULT_SCENARIO_ID);
  activeCacheScenarioId = normalized;
  allTweetsMap = getScenarioTweetMap(normalized);
  return allTweetsMap;
}

function serializeScenarioCaches() {
  const payload = {};
  scenarioTweetMaps.forEach((map, scenarioId) => {
    if (map && map.size > 0) {
      payload[scenarioId] = Array.from(map.values());
    }
  });
  return payload;
}

// Helper to save cache
function saveCache() {
  const payload = serializeScenarioCaches();
  chrome.storage.local.set({ [SCENARIO_CACHE_KEY]: payload });
}

function initializeScenarioCaches() {
  chrome.storage.local.get([SCENARIO_CACHE_KEY, LEGACY_CACHE_KEY], (result) => {
    let total = 0;
    const storedByScenario = result[SCENARIO_CACHE_KEY];
    if (storedByScenario && typeof storedByScenario === 'object') {
      Object.entries(storedByScenario).forEach(([scenarioId, tweets]) => {
        const normalized = normalizeScenarioId(scenarioId);
        const map = getScenarioTweetMap(normalized);
        map.clear();
        if (Array.isArray(tweets)) {
          tweets.forEach(tweet => {
            if (tweet && tweet.id) {
              map.set(tweet.id, tweet);
              total++;
            }
          });
        }
      });
    } else if (Array.isArray(result[LEGACY_CACHE_KEY])) {
      const legacyMap = getScenarioTweetMap(DEFAULT_SCENARIO_ID);
      legacyMap.clear();
      result[LEGACY_CACHE_KEY].forEach(tweet => {
        if (tweet && tweet.id) {
          legacyMap.set(tweet.id, tweet);
          total++;
        }
      });
      saveCache();
      chrome.storage.local.remove(LEGACY_CACHE_KEY);
    }
    switchScenarioCache(DEFAULT_SCENARIO_ID);
    console.log(`X Data Scraper: Loaded ${total} tweets from cache across ${scenarioTweetMaps.size} scenarios.`);
  });
}

initializeScenarioCaches();

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

function alignUrlToCurrentOrigin(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.origin === window.location.origin) return parsed.href;
    return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
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

function findTweetArticleElement(tweetId, targetUrl) {
  const link = findInPageTweetLink(tweetId, targetUrl);
  if (!link) return null;
  if (typeof link.closest === 'function') {
    const article = link.closest('article');
    if (article) return article;
  }
  let current = link.parentElement;
  while (current && current !== document.body) {
    if (current.tagName && current.tagName.toLowerCase() === 'article') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function triggerDomClick(element) {
  if (!element) return false;
  try {
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      element.dispatchEvent(event);
    });
    if (typeof element.click === 'function') {
      element.click();
    }
    return true;
  } catch (err) {
    console.warn('X Data Scraper: Failed to simulate DOM click', err);
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

// AIDEV-NOTE: Incremental scraping strategy
// All scraping operations (single scrape and auto-scroll) are INCREMENTAL:
// - New tweets are added to allTweetsMap
// - Existing tweets (by ID) are merged/updated with new data
// - Old tweets are NEVER removed unless user explicitly clears cache
// This ensures no data loss during multiple scraping sessions
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

async function autoScrollLoop(targetScenarioId = activeCacheScenarioId) {
  const scenarioId = normalizeScenarioId(targetScenarioId);
  switchScenarioCache(scenarioId);
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
      scenarioId,
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

function normalizeScenarioId(scenarioId) {
  if (!scenarioId) return DEFAULT_SCENARIO_ID;
  if (SCRAPE_SCENARIOS[scenarioId]) return scenarioId;
  const alias = SCENARIO_ALIAS_MAP[scenarioId];
  if (alias && SCRAPE_SCENARIOS[alias]) return alias;
  return DEFAULT_SCENARIO_ID;
}

function getScenarioConfig(scenarioId) {
  const normalized = normalizeScenarioId(scenarioId);
  return SCRAPE_SCENARIOS[normalized] || SCRAPE_SCENARIOS[DEFAULT_SCENARIO_ID];
}

function scenarioMatchesCurrentLocation(scenario) {
  if (!scenario || scenario.useCurrentLocation) return true;
  const currentPath = window.location.pathname + window.location.search;
  if (Array.isArray(scenario.matchPathPrefixes) && scenario.matchPathPrefixes.length > 0) {
    return scenario.matchPathPrefixes.some(prefix => currentPath.startsWith(prefix));
  }
  if (!scenario.targetUrl) return true;
  return normalizeUrlForComparison(window.location.href) === normalizeUrlForComparison(scenario.targetUrl);
}

function ensureOnScenarioPage(scenario, callback) {
  const targetScenario = scenario || getScenarioConfig();
  if (!targetScenario || targetScenario.useCurrentLocation || !targetScenario.targetUrl) {
    callback();
    return;
  }

  if (scenarioMatchesCurrentLocation(targetScenario)) {
    console.log(`X Data Scraper: Already on ${targetScenario.label || targetScenario.id}`);
    callback();
    return;
  }

  const label = targetScenario.label || targetScenario.id;
  console.log(`X Data Scraper: Navigating to ${label} via SPA...`);

  let navigationCompleted = false;
  const checkInterval = setInterval(() => {
    if (scenarioMatchesCurrentLocation(targetScenario)) {
      clearInterval(checkInterval);
      navigationCompleted = true;
      setTimeout(() => {
        console.log(`X Data Scraper: ${label} page loaded, ready to scrape`);
        callback();
      }, 1500);
    }
  }, 500);

  const navResult = navigateWithinPage(null, targetScenario.targetUrl);
  console.log(`X Data Scraper: Navigation initiated (${label}):`, navResult ? 'success' : 'failed');

  setTimeout(() => {
    clearInterval(checkInterval);
    if (!navigationCompleted && !scenarioMatchesCurrentLocation(targetScenario)) {
      console.error(`X Data Scraper: Failed to navigate to ${label} within timeout`);
      console.log('X Data Scraper: Current URL:', window.location.href);
      console.log('X Data Scraper: Target URL:', targetScenario.targetUrl);
    }
  }, 10000);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape") {
    const scenario = getScenarioConfig(request.scenarioId);
    const scenarioId = scenario.id;
    switchScenarioCache(scenarioId);
    ensureOnScenarioPage(scenario, () => {
      scrapeCurrentView();
      sendResponse({ success: true, scenarioId, data: Array.from(allTweetsMap.values()) });
    });
    return true; // Keep message channel open for async response
  }
  else if (request.action === "start_scroll") {
    if (!isScrolling) {
      const scenario = getScenarioConfig(request.scenarioId);
      if (scenario && scenario.autoScrollAllowed === false) {
        sendResponse({ success: false, error: 'auto_scroll_disabled' });
        return false;
      }
      const scenarioId = scenario.id;
      switchScenarioCache(scenarioId);
      ensureOnScenarioPage(scenario, () => {
        // Keep existing data - incremental scraping
        console.log(`X Data Scraper: Starting auto-scroll (${scenario.label || scenario.id}) with ${allTweetsMap.size} existing tweets`);
        autoScrollLoop(scenarioId).then(data => {
          // Final data sent when loop finishes naturally
          chrome.runtime.sendMessage({
            action: "scroll_finished",
            scenarioId,
            data: data
          });
        });
        sendResponse({ success: true, status: "started", scenarioId });
      });
      return true; // Keep message channel open for async response
    }
    sendResponse({ success: true, status: "already_running" });
  }
  else if (request.action === "stop_scroll") {
    isScrolling = false;
    sendResponse({ success: true, status: "stopping", scenarioId: activeCacheScenarioId, data: Array.from(allTweetsMap.values()) });
  }
  else if (request.action === "toggle_sidebar") {
    toggleSidebar();
    sendResponse({ success: true, visible: sidebarVisible });
  }
  else if (request.action === "update_cache") {
    // AIDEV-NOTE: Critical sync mechanism for VxTwitter data
    // When popup syncs data via VxTwitter, it must notify content.js to update allTweetsMap
    // Otherwise, next scrape will overwrite VxTwitter-synced data with old cached data
    // This ensures data consistency between popup and content script
    if (request.data && Array.isArray(request.data)) {
      const scenarioId = normalizeScenarioId(request.scenarioId || activeCacheScenarioId);
      switchScenarioCache(scenarioId);
      console.log(`X Data Scraper: Updating cache with ${request.data.length} tweets from VxTwitter sync`);
      request.data.forEach(tweet => {
        if (tweet.id) {
          allTweetsMap.set(tweet.id, tweet);
        }
      });
      saveCache();
      sendResponse({ success: true, scenarioId, count: allTweetsMap.size });
    } else {
      sendResponse({ success: false, error: 'Invalid data format' });
    }
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
  reply: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5h12a3 3 0 013 3v6a3 3 0 01-3 3H9l-4 4V8a3 3 0 013-3z"/></svg>',
  retweet: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>',
  like: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6-4.35-8.5-7.43C1 10.5 2.75 6 6.5 6c2.04 0 3.57 1.21 4.5 2.54C12.93 7.21 14.46 6 16.5 6c3.75 0 5.5 4.5 3 7.57C18 16.65 12 21 12 21z"/></svg>',
  open: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M7 19V11"/><path d="M12 19V5"/><path d="M17 19v-7"/></svg>'
};
const TOOLTIP_TEXT_COLLAPSED_HEIGHT = 120;
const TOOLTIP_PREVIEW_MAX_HEIGHT = 220;
const INLINE_ACTION_TEST_IDS = {
  reply: 'reply',
  retweet: 'retweet',
  like: 'like'
};
const RETWEET_QUOTE_SELECTORS = [
  '[data-testid="retweetWithComment"]',
  '[data-testid="retweetWithCommentButton"]',
  '[data-testid="retweetWithCommentMenuItem"]',
  '[data-testid="retweetWithCommentMenu"]'
];
const RETWEET_QUOTE_KEYWORDS = [
  'quote',
  'quote post',
  'quote tweet',
  '引用',
  '引用帖子',
  '引用发帖',
  '引用推文'
];
let externalTooltipTextExpanded = false;
let pendingInlineActionTimer = null;

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

function applyExternalTooltipTextCollapse() {
  if (!externalTooltipEl) return;
  const textEl = externalTooltipEl.querySelector('[data-role="tooltip-text"]');
  const toggleEl = externalTooltipEl.querySelector('[data-role="tooltip-text-toggle"]');
  if (!textEl || !toggleEl) return;
  const fadeEl = externalTooltipEl.querySelector('[data-role="tooltip-text-fade"]');

  textEl.style.maxHeight = 'none';
  textEl.style.overflow = 'visible';

  const needsToggle = textEl.scrollHeight > (TOOLTIP_TEXT_COLLAPSED_HEIGHT + 4);
  if (!needsToggle) {
    toggleEl.style.display = 'none';
    if (fadeEl) fadeEl.style.display = 'none';
    return;
  }

  const applyState = () => {
    if (externalTooltipTextExpanded) {
      textEl.style.maxHeight = 'none';
      textEl.style.overflow = 'visible';
      if (fadeEl) fadeEl.style.display = 'none';
      toggleEl.textContent = '收起';
    } else {
      textEl.style.maxHeight = `${TOOLTIP_TEXT_COLLAPSED_HEIGHT}px`;
      textEl.style.overflow = 'hidden';
      if (fadeEl) fadeEl.style.display = 'block';
      toggleEl.textContent = '展开';
    }
  };

  toggleEl.style.display = 'inline-flex';
  toggleEl.onclick = (event) => {
    event.preventDefault();
    externalTooltipTextExpanded = !externalTooltipTextExpanded;
    applyState();
  };

  applyState();
}

function attemptQuoteMenuSelection() {
  for (const selector of RETWEET_QUOTE_SELECTORS) {
    const el = document.querySelector(selector);
    if (el && triggerDomClick(el)) {
      return true;
    }
  }
  const matchesKeyword = (text) => {
    if (!text) return false;
    const normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    return RETWEET_QUOTE_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()));
  };
  const menuCandidates = document.querySelectorAll('[role="menuitem"], [data-testid="Dropdown"] button, [data-testid="Dropdown"] div[role="menuitem"], div[role="menuitem"]');
  for (const candidate of menuCandidates) {
    if (matchesKeyword(candidate.textContent || '')) {
      return triggerDomClick(candidate);
    }
  }
  return false;
}

function scheduleQuoteMenuSelection() {
  const maxWait = 2500;
  const interval = 120;
  const start = Date.now();
  const poll = () => {
    if (attemptQuoteMenuSelection()) return;
    if (Date.now() - start >= maxWait) return;
    setTimeout(poll, interval);
  };
  setTimeout(poll, 80);
}

function triggerInlineTweetAction(actionType, tweetId, targetUrl) {
  const testId = INLINE_ACTION_TEST_IDS[actionType];
  if (!testId) return false;
  const article = findTweetArticleElement(tweetId, targetUrl);
  if (!article) return false;
  const button = article.querySelector(`[data-testid="${testId}"]`);
  if (!button) return false;
  const success = triggerDomClick(button);
  if (success && actionType === 'retweet') {
    scheduleQuoteMenuSelection();
  }
  return success;
}

function wireExternalTooltipActions(tweetId, defaultUrl) {
  if (!externalTooltipEl) return;
  const buttons = externalTooltipEl.querySelectorAll('[data-tooltip-action]');
  if (!buttons.length) return;

  buttons.forEach(button => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const actionType = button.dataset.tooltipAction || 'open';
      const targetUrl = alignUrlToCurrentOrigin(button.dataset.targetUrl || defaultUrl || '');
      const intentUrl = button.dataset.intentUrl || '';
      const normalizedCurrent = normalizeUrlForComparison(window.location.href);
      const normalizedTarget = targetUrl ? normalizeUrlForComparison(targetUrl) : '';
      const needsNavigation = targetUrl && normalizedTarget && normalizedTarget !== normalizedCurrent;

      if (actionType === 'open') {
        if (needsNavigation) {
          if (!navigateWithinPage(tweetId, targetUrl)) {
            window.location.assign(targetUrl);
          }
        } else if (intentUrl) {
          window.location.assign(intentUrl);
        }
        hideExternalTooltip();
        return;
      }

      if (!tweetId || !targetUrl) {
        if (intentUrl) {
          window.location.assign(intentUrl);
        }
        hideExternalTooltip();
        return;
      }

      setPendingInlineAction(actionType, tweetId, targetUrl);
      resumePendingInlineAction();

      if (needsNavigation) {
        if (!navigateWithinPage(tweetId, targetUrl)) {
          window.location.assign(targetUrl);
        }
      }

      hideExternalTooltip();
    });
  });
}

function setPendingInlineAction(actionType, tweetId, targetUrl) {
  if (!actionType || !tweetId || !targetUrl) return;
  try {
    const payload = {
      actionType,
      tweetId,
      targetUrl: alignUrlToCurrentOrigin(targetUrl),
      createdAt: Date.now()
    };
    window.sessionStorage.setItem(PENDING_INLINE_ACTION_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('X Data Scraper: Failed to store pending inline action', err);
  }
}

function getPendingInlineAction() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_INLINE_ACTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('X Data Scraper: Failed to read pending inline action', err);
    return null;
  }
}

function clearPendingInlineAction() {
  try {
    window.sessionStorage.removeItem(PENDING_INLINE_ACTION_KEY);
  } catch {
    // ignore
  }
  if (pendingInlineActionTimer) {
    clearTimeout(pendingInlineActionTimer);
    pendingInlineActionTimer = null;
  }
}

function resumePendingInlineAction() {
  const pending = getPendingInlineAction();
  if (!pending) return;
  const { actionType, tweetId, targetUrl, createdAt } = pending;
  if (!actionType || !tweetId || !targetUrl) {
    clearPendingInlineAction();
    return;
  }
  if (createdAt && (Date.now() - createdAt) > 15000) {
    clearPendingInlineAction();
    return;
  }

  const maxWait = 6000;
  const interval = 200;
  const start = Date.now();
  const targetForResume = alignUrlToCurrentOrigin(targetUrl);

  const attempt = () => {
    if (triggerInlineTweetAction(actionType, tweetId, targetForResume)) {
      clearPendingInlineAction();
      return true;
    }
    return false;
  };

  const tick = () => {
    if (attempt()) return;
    if (Date.now() - start >= maxWait) {
      clearPendingInlineAction();
      return;
    }
    pendingInlineActionTimer = setTimeout(tick, interval);
  };

  if (pendingInlineActionTimer) {
    clearTimeout(pendingInlineActionTimer);
    pendingInlineActionTimer = null;
  }
  pendingInlineActionTimer = setTimeout(tick, 400);
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
  const localTweetUrl = alignUrlToCurrentOrigin(tweetUrl);
  let previewHtml = '';
  if (preview && preview.url) {
    const escapedUrl = escapeHtmlInline(preview.url);
    previewHtml = `
      <div style="margin-bottom:10px;border-radius:10px;overflow:hidden;border:1px solid #2f3336;background:#0f1115;position:relative;max-height:${TOOLTIP_PREVIEW_MAX_HEIGHT}px;">
        <img src="${escapedUrl}" alt="${escapeHtmlInline(preview.isVideo ? 'Video preview' : 'Tweet image')}" style="width:100%;height:auto;display:block;">
        ${preview.isVideo ? '<span style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,0.65);color:#f7f9f9;border-radius:6px;padding:2px 6px;font-size:12px;line-height:1;">▶</span>' : ''}
      </div>
    `;
  } else if (preview && preview.isVideo) {
    previewHtml = `
      <div style="margin-bottom:10px;border-radius:10px;border:1px dashed #2f3336;height:${Math.min(TOOLTIP_PREVIEW_MAX_HEIGHT, 180)}px;display:flex;align-items:center;justify-content:center;color:#8b98a5;font-size:18px;background:rgba(255,255,255,0.02);">
        ▶ 视频内容
      </div>
    `;
  }

  const formatStatValue = (value) => {
    if (value === undefined || value === null) return '0';
    const str = String(value).trim();
    return str || '0';
  };

  const metricDefinitions = [
    {
      type: 'reply',
      label: '评论',
      icon: EXTERNAL_ACTION_ICONS.reply,
      statKey: 'replies',
      intentUrl: tweetId ? `https://twitter.com/intent/tweet?in_reply_to=${tweetId}` : null
    },
    {
      type: 'retweet',
      label: '转发',
      icon: EXTERNAL_ACTION_ICONS.retweet,
      statKey: 'retweets',
      intentUrl: tweetId ? `https://twitter.com/intent/retweet?tweet_id=${tweetId}` : null
    },
    {
      type: 'like',
      label: '点赞',
      icon: EXTERNAL_ACTION_ICONS.like,
      statKey: 'likes',
      intentUrl: tweetId ? `https://twitter.com/intent/like?tweet_id=${tweetId}` : null
    },
    {
      type: 'open',
      label: '浏览',
      icon: EXTERNAL_ACTION_ICONS.open,
      statKey: 'views'
    }
  ].map(def => ({
    ...def,
    count: formatStatValue(stats[def.statKey]),
    targetUrl: localTweetUrl || null
  }));

  const metricsHtml = `
    <div style="display:flex;gap:12px;margin-top:8px;">
      ${metricDefinitions.map(button => `
        <button type="button"
          title="${escapeHtmlInline(button.label)}：${escapeHtmlInline(button.count)}"
          data-tooltip-action="${button.type}"
          ${button.targetUrl ? `data-target-url="${escapeHtmlInline(button.targetUrl)}"` : ''}
          ${button.intentUrl ? `data-intent-url="${escapeHtmlInline(button.intentUrl)}"` : ''}
          style="flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 8px;border:none;background:none;color:#b0b7c2;font-size:14px;cursor:pointer;border-radius:12px;">
          <span style="display:flex;align-items:center;justify-content:center;color:inherit;">${button.icon}</span>
          <span style="color:#f7f9f9;font-weight:600;">${escapeHtmlInline(button.count)}</span>
        </button>
      `).join('')}
    </div>
  `;

  el.innerHTML = `
    <div style="font-size:12px;color:#8b98a5;margin-bottom:6px;">${escapeHtmlInline(tweet.timestamp || '—')}</div>
    ${previewHtml}
    <div style="margin-bottom:10px;">
      <div style="position:relative;">
        <div data-role="tooltip-text" style="white-space:pre-wrap;line-height:1.4;color:#f7f9f9;">${escapeHtmlInline(tweet.text || '(No text)')}</div>
        <div data-role="tooltip-text-fade" style="display:none;position:absolute;left:0;right:0;bottom:0;height:38px;background:linear-gradient(180deg, rgba(17,18,23,0) 0%, #111217 85%);pointer-events:none;"></div>
      </div>
      <button data-role="tooltip-text-toggle" style="display:none;margin-top:6px;border:none;background:none;color:#1d9bf0;font-weight:600;font-size:13px;cursor:pointer;padding:0;">展开</button>
    </div>
    ${metricsHtml}
  `;
  externalTooltipTextExpanded = false;
  el.style.display = 'block';
  applyExternalTooltipTextCollapse();
  wireExternalTooltipActions(tweetId || null, localTweetUrl || '');
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

resumePendingInlineAction();

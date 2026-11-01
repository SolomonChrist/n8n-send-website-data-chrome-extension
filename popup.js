/**
 * AI n8n Send Website Data - Popup Controller
 *
 * Strictly collects ONLY passive, non-scraping metadata from the active tab
 * (document title, URL, standard <meta> tags, OpenGraph/Twitter tags, public
 * <link> tags, and <script type="application/ld+json"> structured data).
 * Zero background crawling, zero extra HTTP requests to the target site.
 */

const STORAGE_KEYS = {
  SETTINGS: 'n8n_sender_settings',
  HISTORY: 'n8n_sender_history'
};

const MAX_HISTORY_ITEMS = 200;
const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HEADERS = new Set(['host', 'cookie', 'content-length', 'origin', 'referer']);

let currentPageData = null;
let currentSettings = {
  webhookUrl: '',
  webhookMethod: 'AUTO',
  customHeaderName: '',
  customHeaderValue: '',
  autoSend: false
};
let historyItems = [];
let isSending = false;

/**
 * Guardrail: Full 5-character HTML & attribute escaping to prevent DOM/attribute injection
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Guardrail: Ensure rendered <a href> links only allow http: or https: schemes
 */
function sanitizeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (_) {}
  return '#';
}

/**
 * Guardrail: Validate custom HTTP header names & strip control characters from values
 */
function isValidHeaderName(name) {
  if (!name) return true;
  return HEADER_NAME_REGEX.test(name) && !FORBIDDEN_HEADERS.has(name.toLowerCase());
}

function sanitizeHeaderValue(val) {
  return String(val ?? '').replace(/[\r\n\0]+/g, '').trim();
}

/**
 * Guardrail: Self-healing local history storage write with rolling cap & quota protection
 */
async function safeSaveHistory(items) {
  if (items.length > MAX_HISTORY_ITEMS) {
    items.length = MAX_HISTORY_ITEMS;
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: items });
  } catch (_) {
    // Quota exceeded fallback: prune oldest half and retry
    items.length = Math.max(10, Math.floor(items.length / 2));
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: items });
  }
}

/**
 * Injected function executed inside the active tab via chrome.scripting.executeScript.
 * Must be self-contained. Reads ONLY standard passive metadata and head tags.
 * Includes SPA stale-meta detection (e.g., X.com, YouTube, Next.js) and payload size caps.
 */
function extractAllowedWebsiteMetadata() {
  const getMetaContent = (selector) => {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute('content') || '').trim().slice(0, 2000) : '';
  };

  // Gather standard <meta> tags in <head> (capped at 150 tags, 2000 chars each)
  const allMetaTags = {};
  const openGraph = {};
  const twitterCard = {};
  const articleMeta = {};

  const metaElements = Array.from(document.querySelectorAll('head meta, meta')).slice(0, 150);
  metaElements.forEach((meta) => {
    const name = (meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv') || '').trim();
    const content = (meta.getAttribute('content') || '').trim().slice(0, 2000);
    if (!name || !content) return;

    allMetaTags[name] = content;

    const lower = name.toLowerCase();
    if (lower.startsWith('og:')) {
      openGraph[lower.slice(3)] = content;
    } else if (lower.startsWith('twitter:')) {
      twitterCard[lower.slice(8)] = content;
    } else if (lower.startsWith('article:')) {
      articleMeta[lower.slice(8)] = content;
    }
  });

  // Canonical URL & SPA Route Drift Detection
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const rawCanonicalUrl = canonicalEl ? canonicalEl.href : '';
  const currentUrlNoHash = window.location.href.split('#')[0];
  const canonicalMatchesCurrent = !rawCanonicalUrl || rawCanonicalUrl.split('#')[0] === currentUrlNoHash;
  const ogUrl = openGraph.url || '';
  const ogMatchesCurrent = !ogUrl || ogUrl.split('#')[0] === currentUrlNoHash;
  const spaStaleMetaDetected = !canonicalMatchesCurrent || !ogMatchesCurrent;

  // Prefer live window.location.href if SPA client-side routing left a stale canonical link
  const canonicalUrl = (!spaStaleMetaDetected && rawCanonicalUrl) ? rawCanonicalUrl : window.location.href;

  const iconEl =
    document.querySelector('link[rel="icon"]') ||
    document.querySelector('link[rel="shortcut icon"]') ||
    document.querySelector('link[rel="apple-touch-icon"]');
  const faviconUrl = iconEl && iconEl.href ? iconEl.href : `${window.location.origin}/favicon.ico`;

  const feeds = [];
  Array.from(document.querySelectorAll('link[rel="alternate"]')).slice(0, 20).forEach((link) => {
    const type = (link.getAttribute('type') || '').toLowerCase();
    if (type.includes('rss') || type.includes('atom') || type.includes('xml') || type.includes('json')) {
      feeds.push({
        title: (link.getAttribute('title') || '').slice(0, 500),
        type,
        href: link.href
      });
    }
  });

  const alternateLanguages = [];
  Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).slice(0, 30).forEach((link) => {
    alternateLanguages.push({
      hreflang: link.getAttribute('hreflang'),
      href: link.href
    });
  });

  // Public Schema.org JSON-LD blocks (capped at 10 blocks, max 15KB per block to prevent storage bloat)
  const structuredData = [];
  Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10).forEach((script) => {
    const raw = (script.textContent || '').trim();
    if (!raw || raw.length > 15000) return;
    try {
      structuredData.push(JSON.parse(raw));
    } catch (_) {
      // Ignore malformed JSON-LD
    }
  });

  // Parse URL & Query Parameters
  const parsedUrl = new URL(window.location.href);
  const queryParams = {};
  parsedUrl.searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });

  // Keywords array
  const rawKeywords = getMetaContent('meta[name="keywords"]') || getMetaContent('meta[property="keywords"]');
  const keywords = rawKeywords
    ? rawKeywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 50)
    : [];

  // User-highlighted text (capped at 5,000 chars)
  const selectedText = window.getSelection ? window.getSelection().toString().trim().slice(0, 5000) : '';

  return {
    page: {
      title: document.title || '',
      url: window.location.href,
      canonicalUrl,
      domain: window.location.hostname,
      origin: window.location.origin,
      pathname: window.location.pathname,
      hash: window.location.hash || '',
      queryParams,
      language: document.documentElement.lang || getMetaContent('meta[http-equiv="content-language"]') || '',
      charset: document.characterSet || 'UTF-8',
      referrer: document.referrer || '',
      favicon: faviconUrl,
      lastModified: document.lastModified || '',
      spaNavigationDetected: spaStaleMetaDetected
    },
    meta: {
      description:
        getMetaContent('meta[name="description"]') ||
        (!spaStaleMetaDetected ? (openGraph.description || twitterCard.description) : '') ||
        '',
      keywords,
      author: getMetaContent('meta[name="author"]') || articleMeta.author || '',
      publisher: getMetaContent('meta[name="publisher"]') || openGraph.site_name || '',
      generator: getMetaContent('meta[name="generator"]') || '',
      applicationName: getMetaContent('meta[name="application-name"]') || '',
      themeColor: getMetaContent('meta[name="theme-color"]') || '',
      robots: getMetaContent('meta[name="robots"]') || '',
      viewport: getMetaContent('meta[name="viewport"]') || '',
      allMetaTags
    },
    openGraph,
    twitterCard,
    articleMeta,
    links: {
      feeds,
      alternateLanguages
    },
    structuredData,
    selectedText
  };
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupEventListeners();
  await loadSettingsAndHistory();
  await inspectActiveTab();

  // Focus notes input so user can type and press Ctrl+Enter right away
  const notesEl = document.getElementById('userNotes');
  if (notesEl) notesEl.focus();

  // Check if One-Click Auto-Send is enabled and webhook is configured
  if (currentSettings.autoSend && currentSettings.webhookUrl && currentPageData) {
    await handleSendToN8n({ isAutoSend: true });
  }
});

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  document.getElementById('webhookStatusPill').addEventListener('click', () => {
    switchTab('settingsTab');
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === tabId);
  });
}

function setupEventListeners() {
  // Close status banner
  document.getElementById('closeBannerBtn').addEventListener('click', hideStatusBanner);

  // Toggle n8n Expressions Cheatsheet Drawer
  document.getElementById('toggleCheatsheetBtn').addEventListener('click', () => {
    const container = document.getElementById('cheatsheetContainer');
    const btn = document.getElementById('toggleCheatsheetBtn');
    const isHidden = container.classList.toggle('hidden');
    btn.classList.toggle('active', !isHidden);
    btn.setAttribute('aria-expanded', String(!isHidden));
  });

  // One-click copy for each n8n expression row
  document.querySelectorAll('.expr-row').forEach((row) => {
    row.addEventListener('click', async () => {
      const expr = row.dataset.expr || '';
      if (!expr) return;
      await navigator.clipboard.writeText(expr);
      const toast = document.getElementById('exprCopyFeedback');
      toast.textContent = 'Copied!';
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 1800);
    });
  });

  // Helper to copy the entire n8n Expressions AI prompt block
  const copyEntireExpressionsBlock = async () => {
    const textarea = document.getElementById('allExpressionsTextarea');
    const blockText = textarea ? textarea.value : '';
    if (!blockText) return;
    await navigator.clipboard.writeText(blockText);
    if (textarea) {
      textarea.select();
    }
  };

  // 3rd Top Bar Button: Copy All for AI
  document.getElementById('copyAllExpressionsBtn').addEventListener('click', async () => {
    await copyEntireExpressionsBlock();
    const span = document.getElementById('copyAllExpressionsText');
    const btn = document.getElementById('copyAllExpressionsBtn');
    span.textContent = 'Copied All!';
    btn.classList.add('active');
    setTimeout(() => {
      span.textContent = 'Copy All for AI';
      btn.classList.remove('active');
    }, 1800);
  });

  // Drawer Header Button: Copy Entire Block
  document.getElementById('copyAllDrawerBtn').addEventListener('click', async () => {
    await copyEntireExpressionsBlock();
    const btn = document.getElementById('copyAllDrawerBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy Entire Block';
    }, 1800);
  });

  // Textarea Header Button: Copy Block
  document.getElementById('copyAiTemplateBtn').addEventListener('click', async () => {
    await copyEntireExpressionsBlock();
    const btn = document.getElementById('copyAiTemplateBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy Block';
    }, 1800);
  });

  // Auto-select all text when clicking inside the Ready-to-Paste n8n AI Node Block textarea
  document.getElementById('allExpressionsTextarea').addEventListener('click', (e) => {
    e.target.select();
  });

  // Toggle JSON preview Drawer
  document.getElementById('toggleJsonPreviewBtn').addEventListener('click', () => {
    const container = document.getElementById('jsonPreviewContainer');
    const btn = document.getElementById('toggleJsonPreviewBtn');
    const textSpan = document.getElementById('toggleJsonPreviewText');
    const isHidden = container.classList.toggle('hidden');
    btn.classList.toggle('active', !isHidden);
    btn.setAttribute('aria-expanded', String(!isHidden));
    if (textSpan) {
      textSpan.textContent = isHidden ? 'Preview JSON' : 'Hide JSON';
    }
    if (!isHidden) {
      updateJsonPreview();
    }
  });

  // Copy JSON preview
  document.getElementById('copyJsonPreviewBtn').addEventListener('click', async () => {
    const payload = buildWebhookPayload();
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    const btn = document.getElementById('copyJsonPreviewBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });

  // Clear selected text if user doesn't want it included
  document.getElementById('clearSelectionBtn').addEventListener('click', () => {
    if (currentPageData) {
      currentPageData.selectedText = '';
    }
    document.getElementById('selectedTextSection').classList.add('hidden');
    updateJsonPreview();
  });

  // Update live JSON preview when notes or tags change
  document.getElementById('userNotes').addEventListener('input', updateJsonPreview);
  document.getElementById('userTags').addEventListener('input', updateJsonPreview);

  // Ctrl+Enter / Cmd+Enter inside notes textarea submits form
  document.getElementById('userNotes').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('sendForm').requestSubmit();
    }
  });

  // Send Form submit
  document.getElementById('sendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleSendToN8n({ isAutoSend: false });
  });

  // History search & filter
  document.getElementById('historySearchInput').addEventListener('input', renderHistoryList);
  document.getElementById('historyFilterSelect').addEventListener('change', renderHistoryList);

  // Export History JSON
  document.getElementById('exportHistoryBtn').addEventListener('click', exportHistoryToJsonFile);
  document.getElementById('settingsExportBtn').addEventListener('click', exportHistoryToJsonFile);

  // Open Full History Page
  document.getElementById('openFullHistoryBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  });

  // Save Settings
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });

  // Test Webhook
  document.getElementById('testWebhookBtn').addEventListener('click', testWebhookEndpoint);

  // Two-step confirmation for deleting/resetting local history
  document.getElementById('initiateClearHistoryBtn').addEventListener('click', () => {
    if (historyItems.length === 0) {
      showStatusBanner('warning', 'History is Already Empty', 'There are no saved history items to delete.');
      return;
    }
    document.getElementById('confirmDeleteCount').textContent = String(historyItems.length);
    document.getElementById('clearConfirmBox').classList.remove('hidden');
  });

  document.getElementById('cancelClearHistoryBtn').addEventListener('click', () => {
    document.getElementById('clearConfirmBox').classList.add('hidden');
  });

  document.getElementById('confirmClearHistoryBtn').addEventListener('click', async () => {
    historyItems = [];
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
    document.getElementById('clearConfirmBox').classList.add('hidden');
    updateHistoryBadges();
    renderHistoryList();
    showStatusBanner('success', 'Local History Reset', 'All local backup history items have been permanently deleted.');
  });

  // History Modal controls
  document.getElementById('closeModalBtn').addEventListener('click', closeHistoryModal);
  document.getElementById('closeModalFooterBtn').addEventListener('click', closeHistoryModal);
  document.getElementById('copyModalJsonBtn').addEventListener('click', async () => {
    const content = document.getElementById('modalJsonContent').textContent;
    await navigator.clipboard.writeText(content);
    const btn = document.getElementById('copyModalJsonBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });
}

// ==================== STORAGE & SETTINGS ====================

async function loadSettingsAndHistory() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.HISTORY]);
  if (data[STORAGE_KEYS.SETTINGS]) {
    currentSettings = { ...currentSettings, ...data[STORAGE_KEYS.SETTINGS] };
  }
  if (Array.isArray(data[STORAGE_KEYS.HISTORY])) {
    historyItems = data[STORAGE_KEYS.HISTORY];
  }

  // Populate settings inputs
  document.getElementById('webhookUrlInput').value = currentSettings.webhookUrl || '';
  document.getElementById('webhookMethodSelect').value = currentSettings.webhookMethod || 'AUTO';
  document.getElementById('customHeaderNameInput').value = currentSettings.customHeaderName || '';
  document.getElementById('customHeaderValueInput').value = currentSettings.customHeaderValue || '';
  document.getElementById('autoSendCheckbox').checked = Boolean(currentSettings.autoSend);

  updateWebhookStatusPill();
  updateHistoryBadges();
  renderHistoryList();
}

async function saveSettings() {
  const webhookUrl = document.getElementById('webhookUrlInput').value.trim();
  const webhookMethod = document.getElementById('webhookMethodSelect').value || 'AUTO';
  const customHeaderName = document.getElementById('customHeaderNameInput').value.trim();
  const customHeaderValue = sanitizeHeaderValue(document.getElementById('customHeaderValueInput').value);
  const autoSend = document.getElementById('autoSendCheckbox').checked;

  if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
    showStatusBanner('error', 'Invalid Webhook URL', 'Please enter a valid http:// or https:// n8n webhook URL.');
    return;
  }

  if (!isValidHeaderName(customHeaderName)) {
    showStatusBanner(
      'error',
      'Invalid Auth Header Name',
      'Header name must contain only valid HTTP token characters (e.g. Authorization or X-API-Key) without spaces or colons.'
    );
    return;
  }

  currentSettings = {
    webhookUrl,
    webhookMethod,
    customHeaderName,
    customHeaderValue,
    autoSend
  };

  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: currentSettings });
  updateWebhookStatusPill();
  showStatusBanner('success', 'Settings Saved', 'Your n8n webhook configuration has been saved.');
}

function updateWebhookStatusPill() {
  const pill = document.getElementById('webhookStatusPill');
  const text = document.getElementById('webhookPillText');
  if (currentSettings.webhookUrl) {
    pill.className = 'webhook-pill configured';
    text.textContent = 'Webhook Ready';
  } else {
    pill.className = 'webhook-pill unconfigured';
    text.textContent = 'Set Webhook';
  }
}

// ==================== TAB METADATA EXTRACTION ====================

async function inspectActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showStatusBanner('error', 'No Active Tab Found', 'Could not detect an active browser tab.');
      return;
    }

    let parsedTabUrl = null;
    try {
      parsedTabUrl = new URL(tab.url || 'https://unknown');
    } catch (_) {
      parsedTabUrl = new URL('https://unknown');
    }

    const fallbackData = {
      page: {
        title: tab.title || 'Untitled Page',
        url: tab.url || '',
        canonicalUrl: tab.url || '',
        domain: parsedTabUrl.hostname,
        origin: parsedTabUrl.origin,
        pathname: parsedTabUrl.pathname,
        hash: parsedTabUrl.hash || '',
        queryParams: {},
        language: '',
        charset: 'UTF-8',
        referrer: '',
        favicon: tab.favIconUrl || 'icons/icon48.png',
        lastModified: '',
        spaNavigationDetected: false
      },
      meta: {
        description: '',
        keywords: [],
        author: '',
        publisher: '',
        generator: '',
        applicationName: '',
        themeColor: '',
        robots: '',
        viewport: '',
        allMetaTags: {}
      },
      openGraph: {},
      twitterCard: {},
      articleMeta: {},
      links: { feeds: [], alternateLanguages: [] },
      structuredData: [],
      selectedText: ''
    };

    // Guardrail: Race script injection against a 2500ms timeout so frozen/restricted tabs never hang the popup
    if (tab.id && tab.url && /^https?:\/\//i.test(tab.url)) {
      try {
        const scriptPromise = chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractAllowedWebsiteMetadata
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tab inspection timeout')), 2500)
        );
        const results = await Promise.race([scriptPromise, timeoutPromise]);
        if (results && results[0] && results[0].result) {
          currentPageData = results[0].result;
          if (tab.favIconUrl) {
            currentPageData.page.favicon = tab.favIconUrl;
          }
        } else {
          currentPageData = fallbackData;
        }
      } catch (_) {
        currentPageData = fallbackData;
      }
    } else {
      currentPageData = fallbackData;
    }

    renderCurrentSiteCard();
  } catch (err) {
    showStatusBanner('error', 'Metadata Read Error', err.message || 'Could not read current tab info.');
  }
}

function renderCurrentSiteCard() {
  if (!currentPageData) return;

  const { page, meta, openGraph, structuredData, selectedText } = currentPageData;
  document.getElementById('siteTitle').textContent = page.title || 'Untitled Website';
  document.getElementById('siteUrl').textContent = page.url || '';

  const faviconEl = document.getElementById('siteFavicon');
  faviconEl.src = page.favicon || 'icons/icon48.png';
  faviconEl.onerror = () => {
    faviconEl.src = 'icons/icon48.png';
  };

  const descEl = document.getElementById('siteDescription');
  if (meta.description) {
    descEl.textContent = meta.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.classList.add('hidden');
  }

  const metaCount = Object.keys(meta.allMetaTags || {}).length;
  const ogCount = Object.keys(openGraph || {}).length;
  const ldCount = (structuredData || []).length;

  document.getElementById('metaChips').innerHTML = `
    <span class="chip">${metaCount} Meta</span>
    <span class="chip">${ogCount} OpenGraph</span>
    <span class="chip">${ldCount} JSON-LD</span>
  `;

  if (selectedText) {
    document.getElementById('selectedTextPreview').textContent = selectedText;
    document.getElementById('selectedTextSection').classList.remove('hidden');
  } else {
    document.getElementById('selectedTextSection').classList.add('hidden');
  }

  updateJsonPreview();
}

function buildWebhookPayload() {
  const rawNotes = document.getElementById('userNotes').value.trim();
  const rawTags = document.getElementById('userTags').value.trim();
  const userTags = rawTags
    ? rawTags.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return {
    event: 'website_capture',
    source: 'ai-n8n-send-website-chrome-extension',
    sentAt: new Date().toISOString(),
    userNotes: rawNotes,
    userTags,
    selectedText: currentPageData ? currentPageData.selectedText || '' : '',
    page: currentPageData ? currentPageData.page : {},
    meta: currentPageData ? currentPageData.meta : {},
    openGraph: currentPageData ? currentPageData.openGraph : {},
    twitterCard: currentPageData ? currentPageData.twitterCard : {},
    articleMeta: currentPageData ? currentPageData.articleMeta : {},
    links: currentPageData ? currentPageData.links : {},
    structuredData: currentPageData ? currentPageData.structuredData : []
  };
}

function updateJsonPreview() {
  const previewContainer = document.getElementById('jsonPreviewContainer');
  if (previewContainer.classList.contains('hidden')) return;
  const payload = buildWebhookPayload();
  document.getElementById('jsonPreviewCode').textContent = JSON.stringify(payload, null, 2);
}

// ==================== WEBHOOK SENDING & HISTORY BACKUP ====================

/**
 * Helper to format n8n's JSON error response (especially 404 errors on test webhooks)
 */
function parseN8nErrorMessage(status, statusText, responseText) {
  let baseMsg = `Webhook responded with HTTP ${status} (${statusText || 'Error'}).`;
  if (!responseText) return baseMsg;

  try {
    const parsed = JSON.parse(responseText);
    const n8nMsg = parsed.message || '';
    const n8nHint = parsed.hint || '';
    if (n8nMsg || n8nHint) {
      return `HTTP ${status}: ${n8nMsg}${n8nHint ? ' — ' + n8nHint : ''}`;
    }
  } catch (_) {
    // Not JSON
  }
  return baseMsg;
}

/**
 * Guardrail: Builds a GET URL with query parameters capped under 3,500 chars to prevent HTTP 414 URI Too Long
 */
function buildGetWebhookUrl(webhookUrl, payload) {
  const urlObj = new URL(webhookUrl);
  urlObj.searchParams.set('event', payload.event || 'website_capture');
  urlObj.searchParams.set('sentAt', payload.sentAt || new Date().toISOString());
  urlObj.searchParams.set('title', payload.page?.title || '');
  urlObj.searchParams.set('url', payload.page?.url || '');
  urlObj.searchParams.set('domain', payload.page?.domain || '');
  urlObj.searchParams.set('description', (payload.meta?.description || '').slice(0, 500));
  urlObj.searchParams.set('userNotes', payload.userNotes || '');
  urlObj.searchParams.set('userTags', (payload.userTags || []).join(','));
  urlObj.searchParams.set('selectedText', (payload.selectedText || '').slice(0, 500));

  let serializedPayload = JSON.stringify(payload);
  if (serializedPayload.length > 3000) {
    const compactPayload = {
      ...payload,
      structuredData: [],
      meta: { ...(payload.meta || {}), allMetaTags: {} },
      payloadTruncatedForGet: true
    };
    serializedPayload = JSON.stringify(compactPayload).slice(0, 3500);
  }
  urlObj.searchParams.set('payload_json', serializedPayload);
  return urlObj.toString();
}

/**
 * Guardrail: Enforces credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'
 * so browser cookies are never leaked to the webhook endpoint.
 */
async function executeSingleWebhookRequest(webhookUrl, method, payload, headers, signal) {
  if (method === 'GET') {
    const getUrl = buildGetWebhookUrl(webhookUrl, payload);
    const getHeaders = { ...headers };
    delete getHeaders['Content-Type'];
    return fetch(getUrl, {
      method: 'GET',
      headers: getHeaders,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal
    });
  }

  return fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal
  });
}

async function sendPayloadToWebhook(payload, webhookUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*'
  };

  const hdrName = (currentSettings.customHeaderName || '').trim();
  const hdrVal = sanitizeHeaderValue(currentSettings.customHeaderValue);
  if (hdrName && hdrVal && isValidHeaderName(hdrName)) {
    headers[hdrName] = hdrVal;
  }

  const preferredMethod = currentSettings.webhookMethod || 'AUTO';
  const startTime = performance.now();

  try {
    const initialMethod = preferredMethod === 'GET' ? 'GET' : 'POST';
    let response = await executeSingleWebhookRequest(webhookUrl, initialMethod, payload, headers, controller.signal);
    let responseText = await response.text();
    let usedMethod = initialMethod;

    // Auto fallback to GET if n8n Webhook node is left on default GET method
    if (
      !response.ok &&
      response.status === 404 &&
      preferredMethod === 'AUTO' &&
      initialMethod === 'POST' &&
      /not registered for POST/i.test(responseText)
    ) {
      response = await executeSingleWebhookRequest(webhookUrl, 'GET', payload, headers, controller.signal);
      responseText = await response.text();
      usedMethod = 'GET';
    }

    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        ok: false,
        method: usedMethod,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        responseBody: responseText.slice(0, 500),
        errorMessage: parseN8nErrorMessage(response.status, response.statusText, responseText)
      };
    }

    return {
      ok: true,
      method: usedMethod,
      status: response.status,
      statusText: response.statusText || 'OK',
      durationMs,
      responseBody: responseText.slice(0, 500),
      errorMessage: null
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const durationMs = Math.round(performance.now() - startTime);
    let friendlyError = 'Webhook endpoint is unreachable or not responding.';
    if (err.name === 'AbortError') {
      friendlyError = 'Webhook timed out after 12 seconds (not responding).';
    } else if (err.message) {
      friendlyError = `Webhook connection failed (${err.message}). Make sure your n8n workflow is active or listening.`;
    }
    return {
      ok: false,
      method: preferredMethod,
      status: 0,
      statusText: 'Unreachable',
      durationMs,
      responseBody: '',
      errorMessage: friendlyError
    };
  }
}

async function handleSendToN8n({ isAutoSend = false } = {}) {
  if (isSending) return;

  if (!currentSettings.webhookUrl) {
    switchTab('settingsTab');
    showStatusBanner(
      'warning',
      'n8n Webhook URL Required',
      'Please enter and save your n8n Workflow Webhook URL in Settings first.'
    );
    document.getElementById('webhookUrlInput').focus();
    return;
  }

  const sendBtn = document.getElementById('sendBtn');
  const sendBtnText = document.getElementById('sendBtnText');
  isSending = true;
  sendBtn.disabled = true;
  sendBtnText.textContent = 'Sending...';

  try {
    const payload = buildWebhookPayload();
    const result = await sendPayloadToWebhook(payload, currentSettings.webhookUrl);

    // Always save to local backup history (whether webhook succeeded or failed)
    const historyRecord = {
      id: crypto.randomUUID ? crypto.randomUUID() : `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: payload.sentAt,
      webhookUrl: currentSettings.webhookUrl,
      status: result.ok ? 'success' : 'failed',
      httpStatus: result.status,
      durationMs: result.durationMs,
      errorMessage: result.errorMessage,
      responseBody: result.responseBody,
      payload
    };

    historyItems.unshift(historyRecord);
    await safeSaveHistory(historyItems);
    updateHistoryBadges();
    renderHistoryList();

    if (result.ok) {
      showStatusBanner(
        'success',
        isAutoSend ? 'Auto-Sent to n8n!' : 'Sent to n8n!',
        `Delivered (HTTP ${result.status} in ${result.durationMs}ms) and saved to History.`
      );
    } else {
      showStatusBanner(
        'error',
        'Webhook Not Responding / Error',
        `${result.errorMessage} Saved to Local History so you can retry.`
      );
    }
  } finally {
    isSending = false;
    sendBtn.disabled = false;
    sendBtnText.textContent = 'Send to n8n';
  }
}

async function testWebhookEndpoint() {
  const webhookUrl = document.getElementById('webhookUrlInput').value.trim();
  if (!webhookUrl || !/^https?:\/\//i.test(webhookUrl)) {
    showStatusBanner('warning', 'Missing Webhook URL', 'Enter a valid http:// or https:// n8n webhook URL to test.');
    return;
  }

  const customHeaderName = document.getElementById('customHeaderNameInput').value.trim();
  if (!isValidHeaderName(customHeaderName)) {
    showStatusBanner('error', 'Invalid Header Name', 'Please fix the Auth Header Name before testing.');
    return;
  }

  currentSettings.webhookMethod = document.getElementById('webhookMethodSelect').value || 'AUTO';
  currentSettings.customHeaderName = customHeaderName;
  currentSettings.customHeaderValue = sanitizeHeaderValue(document.getElementById('customHeaderValueInput').value);

  const testBtn = document.getElementById('testWebhookBtn');
  testBtn.disabled = true;
  testBtn.textContent = 'Testing...';

  try {
    const testPayload = {
      event: 'webhook_test_ping',
      source: 'ai-n8n-send-website-chrome-extension',
      sentAt: new Date().toISOString(),
      message: 'Test connection from AI n8n Send Website Data Chrome Extension',
      page: currentPageData ? currentPageData.page : { title: 'Test Page', url: 'https://example.com' }
    };

    const result = await sendPayloadToWebhook(testPayload, webhookUrl);
    if (result.ok) {
      showStatusBanner(
        'success',
        'Webhook Connected!',
        `n8n responded with HTTP ${result.status} in ${result.durationMs}ms.`
      );
    } else {
      showStatusBanner(
        'error',
        'Webhook Test Failed',
        result.errorMessage
      );
    }
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Test Webhook';
  }
}

// ==================== HISTORY LIST & ACTIONS ====================

function updateHistoryBadges() {
  document.getElementById('historyCountBadge').textContent = String(historyItems.length);
  document.getElementById('historySummaryText').textContent = `${historyItems.length} item${historyItems.length === 1 ? '' : 's'} saved locally`;
}

function renderHistoryList() {
  const listEl = document.getElementById('historyList');
  const query = (document.getElementById('historySearchInput').value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('historyFilterSelect').value;

  const filtered = historyItems.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!query) return true;
    const title = (item.payload?.page?.title || '').toLowerCase();
    const url = (item.payload?.page?.url || '').toLowerCase();
    const notes = (item.payload?.userNotes || '').toLowerCase();
    const tags = (item.payload?.userTags || []).join(' ').toLowerCase();
    return title.includes(query) || url.includes(query) || notes.includes(query) || tags.includes(query);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>${historyItems.length === 0 ? 'No websites sent yet. Your local backup history will appear here.' : 'No matching history items found.'}</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.slice(0, 50).map((item) => {
    const title = escapeHtml(item.payload?.page?.title || 'Untitled Website');
    const rawUrl = item.payload?.page?.url || '';
    const safeHref = escapeHtml(sanitizeHttpUrl(rawUrl));
    const displayUrl = escapeHtml(rawUrl);
    const notes = escapeHtml(item.payload?.userNotes || '');
    const dateStr = new Date(item.timestamp).toLocaleString();
    const statusLabel = item.status === 'success' ? `Sent (${item.httpStatus || 200})` : 'Failed';

    return `
      <article class="history-item" data-id="${escapeHtml(item.id)}">
        <div class="history-item-top">
          <div style="min-width:0; flex:1;">
            <div class="history-item-title" title="${title}">${title}</div>
            <a class="history-item-url" href="${safeHref}" target="_blank" rel="noopener noreferrer" title="${displayUrl}">${displayUrl}</a>
          </div>
          <span class="status-tag ${item.status === 'success' ? 'success' : 'failed'}">${statusLabel}</span>
        </div>
        ${notes ? `<div class="history-item-notes">${notes}</div>` : ''}
        <div class="history-item-footer">
          <span class="history-time">${escapeHtml(dateStr)}</span>
          <div class="history-item-btns">
            <button type="button" class="mini-btn view-json-btn" data-id="${escapeHtml(item.id)}">JSON</button>
            <button type="button" class="mini-btn retry-send-btn" data-id="${escapeHtml(item.id)}">Resend</button>
            <button type="button" class="mini-btn delete-item-btn" data-id="${escapeHtml(item.id)}" title="Delete item">&times;</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  listEl.querySelectorAll('.view-json-btn').forEach((btn) => {
    btn.addEventListener('click', () => openHistoryModal(btn.dataset.id));
  });
  listEl.querySelectorAll('.retry-send-btn').forEach((btn) => {
    btn.addEventListener('click', () => retrySendHistoryItem(btn.dataset.id));
  });
  listEl.querySelectorAll('.delete-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteSingleHistoryItem(btn.dataset.id));
  });
}

function openHistoryModal(itemId) {
  const item = historyItems.find((i) => i.id === itemId);
  if (!item) return;
  document.getElementById('modalTitle').textContent = item.payload?.page?.title || 'History Payload';
  document.getElementById('modalJsonContent').textContent = JSON.stringify(item.payload, null, 2);
  document.getElementById('historyModal').classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('historyModal').classList.add('hidden');
}

async function retrySendHistoryItem(itemId) {
  const item = historyItems.find((i) => i.id === itemId);
  if (!item) return;

  const targetWebhook = currentSettings.webhookUrl || item.webhookUrl;
  if (!targetWebhook) {
    switchTab('settingsTab');
    showStatusBanner('warning', 'Configure Webhook First', 'Please set your n8n Webhook URL in Settings before resending.');
    return;
  }

  showStatusBanner('warning', 'Resending to n8n...', `Sending "${item.payload?.page?.title || 'Website'}" to webhook...`);
  const result = await sendPayloadToWebhook(item.payload, targetWebhook);

  item.status = result.ok ? 'success' : 'failed';
  item.httpStatus = result.status;
  item.durationMs = result.durationMs;
  item.errorMessage = result.errorMessage;
  item.responseBody = result.responseBody;
  item.lastRetriedAt = new Date().toISOString();

  await safeSaveHistory(historyItems);
  renderHistoryList();

  if (result.ok) {
    showStatusBanner('success', 'Resend Successful!', `n8n responded with HTTP ${result.status} in ${result.durationMs}ms.`);
  } else {
    showStatusBanner('error', 'Resend Failed', result.errorMessage);
  }
}

async function deleteSingleHistoryItem(itemId) {
  const item = historyItems.find((i) => i.id === itemId);
  if (!item) return;
  const confirmed = window.confirm(`Delete "${item.payload?.page?.title || 'this item'}" from your local history?`);
  if (!confirmed) return;

  historyItems = historyItems.filter((i) => i.id !== itemId);
  await safeSaveHistory(historyItems);
  updateHistoryBadges();
  renderHistoryList();
}

function exportHistoryToJsonFile() {
  if (historyItems.length === 0) {
    showStatusBanner('warning', 'Nothing to Export', 'Your local history is currently empty.');
    return;
  }

  const exportObject = {
    exportedAt: new Date().toISOString(),
    extension: 'ai-n8n-send-website-chrome-extension',
    totalItems: historyItems.length,
    items: historyItems
  };

  const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const datePart = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `n8n-website-history-backup-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  showStatusBanner('success', 'Backup Exported', `Downloaded ${historyItems.length} history item(s) as JSON.`);
}

// ==================== STATUS BANNER ====================

function showStatusBanner(type, title, message) {
  const banner = document.getElementById('statusBanner');
  const titleEl = document.getElementById('statusBannerTitle');
  const msgEl = document.getElementById('statusBannerMessage');
  const iconEl = document.getElementById('statusBannerIcon');

  banner.className = `status-banner ${type}`;
  titleEl.textContent = title;
  msgEl.textContent = message;

  if (type === 'success') {
    iconEl.textContent = '✓';
  } else if (type === 'error') {
    iconEl.textContent = '⚠';
  } else {
    iconEl.textContent = 'ℹ';
  }
}

function hideStatusBanner() {
  document.getElementById('statusBanner').classList.add('hidden');
}

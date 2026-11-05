/**
 * Full-page Local Backup History Viewer & Manager
 */

const STORAGE_KEYS = {
  SETTINGS: 'n8n_sender_settings',
  HISTORY: 'n8n_sender_history'
};

const HEADER_NAME_REGEX = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const FORBIDDEN_HEADERS = new Set(['host', 'cookie', 'content-length', 'origin', 'referer']);

let historyItems = [];
let currentSettings = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  setupListeners();
  renderGrid();
});

async function loadData() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.HISTORY]);
  currentSettings = data[STORAGE_KEYS.SETTINGS] || {};
  historyItems = Array.isArray(data[STORAGE_KEYS.HISTORY]) ? data[STORAGE_KEYS.HISTORY] : [];
  updateSubtitle();
}

function updateSubtitle() {
  document.getElementById('fullCountSubtitle').textContent =
    `${historyItems.length} item${historyItems.length === 1 ? '' : 's'} stored locally on this system`;
}

function setupListeners() {
  document.getElementById('fullSearchInput').addEventListener('input', renderGrid);
  document.getElementById('fullFilterSelect').addEventListener('change', renderGrid);
  document.getElementById('fullExportBtn').addEventListener('click', exportJson);

  document.getElementById('fullCloseBannerBtn').addEventListener('click', () => {
    document.getElementById('fullStatusBanner').classList.add('hidden');
  });

  // Two-step confirmation for deleting all history
  document.getElementById('fullInitiateResetBtn').addEventListener('click', () => {
    if (historyItems.length === 0) {
      showBanner('warning', 'History is Already Empty', 'There are no saved history items to delete.');
      return;
    }
    document.getElementById('fullConfirmCount').textContent = String(historyItems.length);
    document.getElementById('fullClearConfirmBox').classList.remove('hidden');
  });

  document.getElementById('fullCancelResetBtn').addEventListener('click', () => {
    document.getElementById('fullClearConfirmBox').classList.add('hidden');
  });

  document.getElementById('fullConfirmResetBtn').addEventListener('click', async () => {
    historyItems = [];
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: [] });
    document.getElementById('fullClearConfirmBox').classList.add('hidden');
    updateSubtitle();
    renderGrid();
    showBanner('success', 'History Reset Complete', 'All local backup history items have been permanently deleted.');
  });

  // Modal controls
  document.getElementById('fullCloseModalBtn').addEventListener('click', closeModal);
  document.getElementById('fullCloseModalFooterBtn').addEventListener('click', closeModal);
  document.getElementById('fullCopyJsonBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(document.getElementById('fullModalJson').textContent);
    const btn = document.getElementById('fullCopyJsonBtn');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
  });
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || ''));
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (_) {}
  return '#';
}

function isValidHeaderName(name) {
  if (!name) return true;
  return HEADER_NAME_REGEX.test(name) && !FORBIDDEN_HEADERS.has(name.toLowerCase());
}

function sanitizeHeaderValue(val) {
  return String(val ?? '').replace(/[\r\n\0]+/g, '').trim();
}

function renderGrid() {
  const grid = document.getElementById('fullHistoryGrid');
  const query = (document.getElementById('fullSearchInput').value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('fullFilterSelect').value;

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
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p>${historyItems.length === 0 ? 'No websites have been sent yet.' : 'No history items match your search criteria.'}</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((item) => {
    const title = escapeHtml(item.payload?.page?.title || 'Untitled Website');
    const rawUrl = item.payload?.page?.url || '';
    const safeHref = escapeHtml(sanitizeHttpUrl(rawUrl));
    const displayUrl = escapeHtml(rawUrl);
    const notes = escapeHtml(item.payload?.userNotes || '');
    const tags = (item.payload?.userTags || []).map((t) => `<span class="chip">#${escapeHtml(t)}</span>`).join(' ');
    const dateStr = new Date(item.timestamp).toLocaleString();
    const statusLabel = item.status === 'success' ? `Sent (${item.httpStatus || 200})` : 'Failed';

    return `
      <article class="history-item">
        <div class="history-item-top">
          <div style="min-width:0; flex:1;">
            <div class="history-item-title" title="${title}">${title}</div>
            <a class="history-item-url" href="${safeHref}" target="_blank" rel="noopener noreferrer" title="${displayUrl}">${displayUrl}</a>
          </div>
          <span class="status-tag ${item.status === 'success' ? 'success' : 'failed'}">${statusLabel}</span>
        </div>
        ${notes ? `<div class="history-item-notes">${notes}</div>` : ''}
        ${tags ? `<div class="meta-chips">${tags}</div>` : ''}
        ${item.errorMessage ? `<div style="font-size:11px; color:var(--error-text);">${escapeHtml(item.errorMessage)}</div>` : ''}
        <div class="history-item-footer">
          <span class="history-time">${escapeHtml(dateStr)}</span>
          <div class="history-item-btns">
            <button type="button" class="mini-btn view-btn" data-id="${escapeHtml(item.id)}">Inspect JSON</button>
            <button type="button" class="mini-btn resend-btn" data-id="${escapeHtml(item.id)}">Resend</button>
            <button type="button" class="mini-btn delete-btn" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn.dataset.id));
  });
  grid.querySelectorAll('.resend-btn').forEach((btn) => {
    btn.addEventListener('click', () => resendItem(btn.dataset.id));
  });
  grid.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id));
  });
}

function openModal(id) {
  const item = historyItems.find((i) => i.id === id);
  if (!item) return;
  document.getElementById('fullModalTitle').textContent = item.payload?.page?.title || 'Payload JSON';
  document.getElementById('fullModalJson').textContent = JSON.stringify(item.payload, null, 2);
  document.getElementById('fullModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('fullModal').classList.add('hidden');
}

function parseN8nErrorMessage(status, statusText, responseText) {
  let baseMsg = `HTTP ${status} (${statusText || 'Error'})`;
  if (!responseText) return baseMsg;
  try {
    const parsed = JSON.parse(responseText);
    const n8nMsg = parsed.message || '';
    const n8nHint = parsed.hint || '';
    if (n8nMsg || n8nHint) {
      return `HTTP ${status}: ${n8nMsg}${n8nHint ? ' — ' + n8nHint : ''}`;
    }
  } catch (_) {}
  return baseMsg;
}

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

async function executeSingleRequest(webhookUrl, method, payload, headers, signal) {
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

async function resendItem(id) {
  const item = historyItems.find((i) => i.id === id);
  if (!item) return;
  const webhookUrl = currentSettings.webhookUrl || item.webhookUrl;
  if (!webhookUrl) {
    showBanner('error', 'No Webhook URL', 'Please configure your n8n Webhook URL inside the extension settings first.');
    return;
  }

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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const initialMethod = preferredMethod === 'GET' ? 'GET' : 'POST';
    let res = await executeSingleRequest(webhookUrl, initialMethod, item.payload, headers, controller.signal);
    let responseText = await res.text();

    if (
      !res.ok &&
      res.status === 404 &&
      preferredMethod === 'AUTO' &&
      initialMethod === 'POST' &&
      /not registered for POST/i.test(responseText)
    ) {
      res = await executeSingleRequest(webhookUrl, 'GET', item.payload, headers, controller.signal);
      responseText = await res.text();
    }

    clearTimeout(timeoutId);
    item.status = res.ok ? 'success' : 'failed';
    item.httpStatus = res.status;
    item.errorMessage = res.ok ? null : parseN8nErrorMessage(res.status, res.statusText, responseText);
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: historyItems });
    renderGrid();

    if (res.ok) {
      showBanner('success', 'Resent Successfully!', `Webhook responded with HTTP ${res.status}.`);
    } else {
      showBanner('error', 'Webhook Returned Error', item.errorMessage);
    }
  } catch (err) {
    clearTimeout(timeoutId);
    item.status = 'failed';
    item.errorMessage = err.name === 'AbortError'
      ? 'Webhook timed out after 12 seconds.'
      : (err.message || 'Webhook unreachable');
    await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: historyItems });
    renderGrid();
    showBanner('error', 'Webhook Unreachable', item.errorMessage);
  }
}

async function deleteItem(id) {
  const item = historyItems.find((i) => i.id === id);
  if (!item) return;
  if (!window.confirm(`Delete "${item.payload?.page?.title || 'this item'}" from your local backup history?`)) return;

  historyItems = historyItems.filter((i) => i.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.HISTORY]: historyItems });
  updateSubtitle();
  renderGrid();
}

function exportJson() {
  if (historyItems.length === 0) {
    showBanner('warning', 'Empty History', 'No items to export.');
    return;
  }
  const sanitizedItems = historyItems.map((item) => {
    const copy = { ...item };
    if (copy.webhookUrl) {
      try {
        copy.webhookHost = `${new URL(copy.webhookUrl).origin}/webhook/***`;
      } catch (_) {}
      delete copy.webhookUrl;
    }
    return copy;
  });
  const blob = new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    totalItems: sanitizedItems.length,
    items: sanitizedItems
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `n8n-website-history-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function showBanner(type, title, msg) {
  const banner = document.getElementById('fullStatusBanner');
  banner.className = `status-banner ${type}`;
  document.getElementById('fullStatusTitle').textContent = title;
  document.getElementById('fullStatusMsg').textContent = msg;
  document.getElementById('fullStatusIcon').textContent = type === 'success' ? '✓' : '⚠';
}

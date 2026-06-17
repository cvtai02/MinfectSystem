const API = '';
let appsData = [];
let ws = null;
let currentContextApp = null;

const GROUP_COLORS = {
  '6gate': '#5b8def',
  '7router': '#e06c75',
  vgen: '#c678dd',
  meddler: '#e5c07b',
  everyminute: '#56b6c2',
};

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return await res.json();
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}

// --- Sidebar navigation ---
document.querySelectorAll('.sidebar-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const page = item.dataset.page;
    document.querySelectorAll('.sidebar-item').forEach((i) => i.classList.remove('active'));
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`page-${page}`).classList.add('active');
  });
});

// --- Resources table ---
function stateHTML(status) {
  return `<span class="state-badge state-${status}"><span class="state-dot"></span>${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

function renderRow(app) {
  const color = GROUP_COLORS[app.group] || '#888';
  const initials = app.group.slice(0, 2).toUpperCase();
  const url = `http://localhost:${app.port}`;
  return `<tr data-id="${app.id}">
    <td><span class="res-name"><span class="res-icon" style="background:${color}">${initials}</span>${app.name}</span></td>
    <td>${stateHTML(app.status)}</td>
    <td class="text-muted">${app.port}</td>
    <td class="text-muted">${app.pid || '—'}</td>
    <td><span class="group-badge">${app.group}</span></td>
    <td>${app.status === 'running' ? `<a href="${url}" target="_blank" class="url-link">${url}</a>` : '<span class="text-muted">—</span>'}</td>
    <td><div class="action-cell">
      ${app.status === 'running'
        ? `<button class="action-icon-btn stop-btn" title="Stop" onclick="doAction('${app.id}','stop')"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1"/></svg></button>`
        : `<button class="action-icon-btn start-btn" title="Start" onclick="doAction('${app.id}','start')"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6 3.5v9l7-4.5-7-4.5z"/></svg></button>`
      }
      <button class="action-icon-btn" title="More actions" onclick="showContextMenu(event,'${app.id}')">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="12" cy="8" r="1.5"/></svg>
      </button>
    </div></td>
  </tr>`;
}

async function loadApps() {
  const data = await api('/api/apps');
  if (!data) return;
  appsData = data;
  renderTable();
  populateSelects();
}

function renderTable() {
  const filter = document.getElementById('filter-input').value.toLowerCase();
  const filtered = appsData.filter(
    (a) => a.name.toLowerCase().includes(filter) || a.group.toLowerCase().includes(filter) || a.id.toLowerCase().includes(filter)
  );
  document.getElementById('resource-tbody').innerHTML = filtered.map(renderRow).join('');
}

document.getElementById('filter-input').addEventListener('input', renderTable);

function populateSelects() {
  const opts = appsData.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
  const consoleSelect = document.getElementById('console-app-select');
  const envSelect = document.getElementById('env-app-select');
  const prevConsole = consoleSelect.value;
  const prevEnv = envSelect.value;
  consoleSelect.innerHTML = '<option value="">Select a resource...</option>' + opts;
  envSelect.innerHTML = '<option value="">Select a resource...</option>' + opts;
  if (prevConsole) consoleSelect.value = prevConsole;
  if (prevEnv) envSelect.value = prevEnv;
}

// --- Actions ---
async function doAction(appId, action) {
  toast(`${action}ing ${appId}...`);
  const result = await api(`/api/apps/${appId}/${action}`, { method: 'POST' });
  if (result) toast(result.message, result.success ? 'success' : 'error');
  setTimeout(loadApps, 2000);
}

// --- Context menu ---
function showContextMenu(e, appId) {
  e.stopPropagation();
  currentContextApp = appId;
  const menu = document.getElementById('context-menu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;

  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
}

document.addEventListener('click', () => {
  document.getElementById('context-menu').classList.add('hidden');
});

document.querySelectorAll('.context-item').forEach((item) => {
  item.addEventListener('click', () => {
    const action = item.dataset.action;
    if (!currentContextApp) return;
    if (action === 'view-logs') {
      goConsole(currentContextApp);
    } else if (action === 'view-env') {
      goEnv(currentContextApp);
    } else {
      doAction(currentContextApp, action);
    }
  });
});

// --- Console logs page ---
function goConsole(appId) {
  document.querySelectorAll('.sidebar-item').forEach((i) => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelector('[data-page="console"]').classList.add('active');
  document.getElementById('page-console').classList.add('active');
  document.getElementById('console-app-select').value = appId;
  loadConsoleLogs();
}

async function loadConsoleLogs() {
  const appId = document.getElementById('console-app-select').value;
  const source = document.getElementById('console-source').value;
  const output = document.getElementById('console-output');

  if (!appId) {
    output.innerHTML = '<span class="text-muted">Select a resource to view logs...</span>';
    return;
  }

  if (source === 'live') {
    const logs = await api(`/api/apps/${appId}/logs`);
    output.innerHTML = '';
    if (logs && logs.length) logs.forEach((l) => appendLogLine(output, l));
    else output.innerHTML = '<span class="text-muted">No live logs. Start the app from the dashboard to capture live output.</span>';
  } else {
    const type = source === 'file-err' ? 'err' : 'out';
    const data = await api(`/api/apps/${appId}/file-logs?type=${type}`);
    output.textContent = data?.content || 'No log file available.';
  }
  output.scrollTop = output.scrollHeight;
}

function appendLogLine(container, line) {
  const span = document.createElement('span');
  const cls = line.type === 'stderr' ? 'log-stderr' : line.type === 'system' ? 'log-system' : '';
  const time = new Date(line.time).toLocaleTimeString();
  span.innerHTML = `<span class="log-timestamp">${time}</span><span class="${cls}">${escapeHtml(line.text)}</span>`;
  container.appendChild(span);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('console-app-select').addEventListener('change', loadConsoleLogs);
document.getElementById('console-source').addEventListener('change', loadConsoleLogs);
document.getElementById('console-reload').addEventListener('click', () => {
  document.getElementById('console-output').innerHTML = '';
});

// --- Environment page ---
function goEnv(appId) {
  document.querySelectorAll('.sidebar-item').forEach((i) => i.classList.remove('active'));
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelector('[data-page="env"]').classList.add('active');
  document.getElementById('page-env').classList.add('active');
  document.getElementById('env-app-select').value = appId;
  loadEnv();
}

async function loadEnv() {
  const appId = document.getElementById('env-app-select').value;
  const editor = document.getElementById('env-editor');
  const filepath = document.getElementById('env-filepath');

  if (!appId) {
    editor.value = '';
    editor.disabled = true;
    filepath.textContent = '';
    return;
  }

  const data = await api(`/api/apps/${appId}/env`);
  filepath.textContent = data?.file || '';
  editor.value = data?.content ?? data?.message ?? 'No .env file for this resource.';
  editor.disabled = !data?.file;
}

document.getElementById('env-app-select').addEventListener('change', loadEnv);
document.getElementById('env-save-btn').addEventListener('click', async () => {
  const appId = document.getElementById('env-app-select').value;
  if (!appId) return;
  const content = document.getElementById('env-editor').value;
  const result = await api(`/api/apps/${appId}/env`, { method: 'PUT', body: { content } });
  if (result?.success) toast('Environment saved', 'success');
  else toast(result?.error || 'Failed to save', 'error');
});

// --- WebSocket ---
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'log') {
      const consoleAppId = document.getElementById('console-app-select').value;
      const source = document.getElementById('console-source').value;
      if (msg.appId === consoleAppId && source === 'live') {
        const output = document.getElementById('console-output');
        appendLogLine(output, msg.line);
        output.scrollTop = output.scrollHeight;
      }
    }
    if (msg.type === 'status-change') {
      loadApps();
    }
  };

  ws.onclose = () => setTimeout(connectWS, 3000);
}

// --- Init ---
loadApps();
connectWS();
setInterval(loadApps, 15000);

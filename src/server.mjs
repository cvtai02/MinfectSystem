import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { apps, DASHBOARD_PORT } from './config.mjs';
import { startApp, stopApp, restartApp, getAppLogs, getAppStatus } from './process-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, ...data });
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function onLog(appId, line) {
  broadcast('log', { appId, line });
  if (line.text.startsWith('exited:')) {
    broadcast('status-change', { appId });
  }
}

app.get('/api/apps', async (_req, res) => {
  const statuses = await Promise.all(apps.map(getAppStatus));
  res.json(statuses);
});

app.get('/api/apps/:id/status', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  res.json(await getAppStatus(cfg));
});

app.post('/api/apps/:id/start', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  const result = await startApp(cfg, onLog);
  broadcast('status-change', { appId: cfg.id });
  res.json(result);
});

app.post('/api/apps/:id/stop', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  const result = await stopApp(cfg);
  broadcast('status-change', { appId: cfg.id });
  res.json(result);
});

app.post('/api/apps/:id/restart', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  const result = await restartApp(cfg, onLog);
  broadcast('status-change', { appId: cfg.id });
  res.json(result);
});

app.post('/api/apps/:id/kill-port', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  const result = await stopApp(cfg);
  broadcast('status-change', { appId: cfg.id });
  res.json(result);
});

app.get('/api/apps/:id/logs', (req, res) => {
  const logs = getAppLogs(req.params.id);
  res.json(logs);
});

app.get('/api/apps/:id/file-logs', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });

  const logFile = req.query.type === 'err' ? cfg.errLogFile : cfg.logFile;
  if (!logFile) return res.json({ content: 'No log file configured for this app.', file: null });

  try {
    const stat = await fs.promises.stat(logFile);
    const readSize = Math.min(stat.size, 100000);
    const buf = Buffer.alloc(readSize);
    const fh = await fs.promises.open(logFile, 'r');
    await fh.read(buf, 0, readSize, Math.max(0, stat.size - readSize));
    await fh.close();
    res.json({ content: buf.toString('utf-8'), file: logFile });
  } catch (e) {
    res.json({ content: `Could not read log: ${e.message}`, file: logFile });
  }
});

app.get('/api/apps/:id/env', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  if (!cfg.envFile) return res.json({ content: null, file: null, message: 'No .env file for this app' });

  try {
    const content = await fs.promises.readFile(cfg.envFile, 'utf-8');
    res.json({ content, file: cfg.envFile });
  } catch (e) {
    res.json({ content: '', file: cfg.envFile, message: e.message });
  }
});

app.put('/api/apps/:id/env', async (req, res) => {
  const cfg = apps.find((a) => a.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: 'App not found' });
  if (!cfg.envFile) return res.status(400).json({ error: 'No .env file for this app' });

  try {
    await fs.promises.writeFile(cfg.envFile, req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

server.listen(DASHBOARD_PORT, () => {
  console.log(`MinfectSystem Dashboard running at http://localhost:${DASHBOARD_PORT}`);
});

import { spawn, exec } from 'child_process';
import { checkPort, getPortPid } from './port-checker.mjs';

const managedProcesses = new Map();

export function getManagedProcess(appId) {
  return managedProcesses.get(appId) || null;
}

export async function startApp(appConfig, onLog) {
  if (managedProcesses.has(appConfig.id)) {
    return { success: false, message: 'App is already managed by this dashboard. Stop it first.' };
  }

  const isRunning = await checkPort(appConfig.port);
  if (isRunning) {
    return { success: false, message: `Port ${appConfig.port} is already in use. Kill it first or use the force-kill option.` };
  }

  const child = spawn(appConfig.command, appConfig.args, {
    cwd: appConfig.cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  const entry = {
    process: child,
    pid: child.pid,
    startedAt: new Date().toISOString(),
    logs: [],
  };

  const pushLog = (type, data) => {
    const line = { type, text: data.toString(), time: new Date().toISOString() };
    entry.logs.push(line);
    if (entry.logs.length > 2000) entry.logs.shift();
    if (onLog) onLog(appConfig.id, line);
  };

  child.stdout.on('data', (d) => pushLog('stdout', d));
  child.stderr.on('data', (d) => pushLog('stderr', d));

  child.on('exit', (code) => {
    pushLog('system', `Process exited with code ${code}`);
    managedProcesses.delete(appConfig.id);
    if (onLog) onLog(appConfig.id, { type: 'system', text: `exited:${code}`, time: new Date().toISOString() });
  });

  managedProcesses.set(appConfig.id, entry);
  return { success: true, message: `Started ${appConfig.name} (PID: ${child.pid})`, pid: child.pid };
}

export async function stopApp(appConfig) {
  const entry = managedProcesses.get(appConfig.id);
  if (entry) {
    entry.process.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 2000));
    if (!entry.process.killed) {
      entry.process.kill('SIGKILL');
    }
    managedProcesses.delete(appConfig.id);
    return { success: true, message: `Stopped ${appConfig.name}` };
  }

  const pid = await getPortPid(appConfig.port);
  if (pid) {
    return new Promise((resolve) => {
      exec(`taskkill /PID ${pid} /T /F`, (err) => {
        if (err) resolve({ success: false, message: `Failed to kill PID ${pid}: ${err.message}` });
        else resolve({ success: true, message: `Killed process on port ${appConfig.port} (PID: ${pid})` });
      });
    });
  }

  return { success: false, message: 'No running process found' };
}

export async function restartApp(appConfig, onLog) {
  await stopApp(appConfig);
  await new Promise((r) => setTimeout(r, 1500));
  return startApp(appConfig, onLog);
}

export function getAppLogs(appId) {
  const entry = managedProcesses.get(appId);
  return entry ? entry.logs : [];
}

export async function getAppStatus(appConfig) {
  const portActive = await checkPort(appConfig.port);
  const managed = managedProcesses.has(appConfig.id);
  const pid = managed ? managedProcesses.get(appConfig.id).pid : (portActive ? await getPortPid(appConfig.port) : null);

  let status = 'stopped';
  if (portActive) status = 'running';
  else if (managed) status = 'starting';

  return { id: appConfig.id, name: appConfig.name, group: appConfig.group, port: appConfig.port, status, managed, pid };
}

import { readFile } from 'node:fs/promises';
const token = (await readFile(new URL('../.state/bridge-token', import.meta.url), 'utf8')).trim();
const host = !process.env.BRIDGE_HOST || process.env.BRIDGE_HOST === '0.0.0.0' ? '127.0.0.1' : process.env.BRIDGE_HOST;
const response = await fetch(`http://${host}:${process.env.BRIDGE_PORT || 8787}/api/demo/complete`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}` },
});
console.log(response.ok ? 'Demo completion sent. Check the Quest panel and chime.' : `Bridge returned HTTP ${response.status}. This command requires demo mode.`);
if (!response.ok) process.exitCode = 1;

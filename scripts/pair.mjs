import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { exchangePairing, parsePairingUrl } from '../bridge/t3.mjs';

const input = createInterface({ input: stdin, output: stdout });
try {
  const write=process.argv.includes('--write');
  console.log(write ? 'Create a fresh direct pairing link in T3 with thread operation permission. This bridge requests read + operate to send messages.' : 'Create a fresh direct pairing link in T3. This bridge requests orchestration:read only.');
  const url = await input.question('Paste the pairing URL: ');
  let serverOrigin;
  try { parsePairingUrl(url); }
  catch (error) {
    if (error.code !== 'T3_HOST_REQUIRED') throw error;
    console.log('This desktop link has no server address. For T3 on this laptop, the usual address is http://127.0.0.1:3773.');
    serverOrigin = (await input.question('T3 server address [http://127.0.0.1:3773]: ')).trim() || 'http://127.0.0.1:3773';
  }
  const session = await exchangePairing(url, fetch, serverOrigin, {write});
  const directory = new URL('../.state/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(new URL('t3-session.json', directory), JSON.stringify(session) + '\n', { mode: 0o600 });
  console.log('Paired. Restart the bridge to show live threads. Session credentials stay on this computer.');
} catch (error) {
  console.error(error instanceof TypeError ? 'Invalid server address. Use a full HTTP address, such as http://127.0.0.1:3773.' : error.message);
  process.exitCode = 1;
} finally { input.close(); }

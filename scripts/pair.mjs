import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { exchangePairing, parsePairingUrl } from '../bridge/t3.mjs';

export function parsePairArgs(args) {
  const options = { write: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--write') options.write = true;
    else if (arg === '--url' || arg === '--server') {
      const key = arg === '--url' ? 'url' : 'serverOrigin';
      if (options[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Provide ${arg} once, followed by its value.`);
      options[key] = args[++i];
    } else if (!arg.startsWith('-') && options.url === undefined) options.url = arg;
    else throw new Error('Use one pairing URL, --server <T3-address>, and optionally --write. See npm run pair -- --help.');
  }
  return options;
}

async function saveSession(session) {
  const directory = new URL('../.state/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = new URL(`t3-session.${randomUUID()}.tmp`, directory);
  await writeFile(temporary, JSON.stringify(session) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, new URL('t3-session.json', directory));
}

export async function main(args = process.argv.slice(2), { ask, exchange = exchangePairing, save = saveSession, log = console.log } = {}) {
  const options = parsePairArgs(args);
  if (options.help) {
    log('Usage: npm run pair -- [<pairing-url> | --url <pairing-url>] [--server <T3-address>] [--write]\nOmit the URL to paste it at the prompt without saving it in shell history.\nA t3code://app/pair#token=... link needs the address of the T3 server that created it.\nThis pairs one server. Desktop mode mirrors existing environments without this command.');
    return;
  }
  let input;
  const question = ask || (prompt => {
    if (!stdin.isTTY) throw new Error('Pairing needs a terminal prompt, or pass --url <pairing-url> and --server <T3-address>.');
    input ||= createInterface({ input: stdin, output: stdout });
    return input.question(prompt);
  });
  try {
    const { write } = options;
    log(write ? 'This direct pairing requests read + operate to send reviewed messages.' : 'This direct pairing requests orchestration:read only.');
    const url = options.url ?? await question('Paste the pairing URL: ');
    let { serverOrigin } = options;
    try { parsePairingUrl(url, serverOrigin); }
    catch (error) {
      if (error.code !== 'T3_HOST_REQUIRED') throw error;
      log('This desktop link contains no server address. Use the T3 server that created the link.');
      serverOrigin = (await question('T3 server address [http://127.0.0.1:3773]: ')).trim() || 'http://127.0.0.1:3773';
    }
    const session = await exchange(url, fetch, serverOrigin, { write });
    await save(session);
    log('Paired for single-server mode. Restart that bridge to load the new session. Desktop mode does not use this pairing.');
  } finally { input?.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof TypeError ? 'Invalid server address. Use a full HTTP address, such as http://127.0.0.1:3773.' : error.message);
    process.exitCode = 1;
  });
}

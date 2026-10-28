// Prefer an installed supported Node without changing the user's shell configuration.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let runtime = process.execPath;
if (Number(process.versions.node.split('.')[0]) < 22) {
  const versions = join(process.env.NVM_DIR || join(homedir(), '.nvm'), 'versions', 'node');
  const installed = existsSync(versions) ? readdirSync(versions)
    .filter(version => /^v\d+\.\d+\.\d+$/.test(version) && Number(version.slice(1).split('.')[0]) >= 22)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
  runtime = installed.map(version => join(versions, version, 'bin', 'node')).find(path => existsSync(path));
  if (!runtime) { console.error('T3 Quest needs Node.js 22 or later. Install it, select it in your terminal, then rerun this command.'); process.exit(1); }
  console.log(`Using installed Node ${installed.find(version => runtime.includes('/' + version + '/'))}.`);
}
const options = existsSync(join(root, '.env')) ? ['--env-file=.env'] : [];
const child = spawn(runtime, [...options, ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
child.on('error', () => { console.error('Could not start Node.js. Check your installed runtime.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

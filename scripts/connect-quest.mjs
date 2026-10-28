import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { loadBridgeToken, main as startBridge } from '../bridge/server.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function connectionCandidates(interfaces = networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name, values]) => (values || [])
    .filter(item => item.family === 'IPv4' && !item.internal)
    .map(item => ({ name, address: item.address })));
}

export function selectDevice(output) {
  const entries = output.split('\n').map(line => line.trim().split(/\s+/));
  const devices = entries.filter(parts => parts[1] === 'device');
  if (devices.length > 1) throw new Error('More than one ADB device is connected. Disconnect the others and retry.');
  if (!devices.length) throw new Error('Connect Quest by USB, enable Developer Mode, and accept USB debugging in the headset.');
  return devices[0][0];
}

function run(binary, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', () => {});
    child.on('error', () => reject(new Error('Could not run ADB. Install the project tools first.')));
    child.stdin.on('error', () => {});
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('ADB failed. Check USB authorization and that T3 Quest Lab is installed.')));
    child.stdin.end(input);
  });
}

export async function transferConnection(adb, serial, config, execute = run) {
  // Credentials travel on stdin into app-private storage, never in shell arguments or logs.
  await execute(adb, ['-s', serial, 'shell', '-T', 'run-as', 'dev.t3quest', 'sh', '-c',
    "'cat > files/bridge-config.tmp && mv files/bridge-config.tmp files/bridge-config.json'"], JSON.stringify(config));
  await execute(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.MAIN',
    '-c', 'com.oculus.intent.category.OVERLAY_LAUNCHER', '-n', 'dev.t3quest/.MainActivity']);
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: npm run connect:quest -- [--host <laptop-ip> | --usb]\nStarts the bridge and transfers settings to the USB-connected Quest. Default: choose a Wi-Fi address.');
    return;
  }
  const usb = args.length === 1 && args[0] === '--usb';
  const explicit = args.length === 2 && args[0] === '--host' ? args[1] : null;
  if (args.length && !usb && !explicit) throw new Error('Use --host <laptop-ip>, --usb, or no options.');
  const adbLocal = ROOT + '.tools/android-sdk/platform-tools/adb';
  const adb = await access(adbLocal).then(() => adbLocal, () => 'adb');
  const serial = selectDevice(await run(adb, ['devices']));
  const candidates = connectionCandidates();
  let host = usb ? '127.0.0.1' : explicit;
  if (host && !usb && !candidates.some(item => item.address === host)) throw new Error('--host must be an IPv4 address assigned to this laptop.');
  if (!host) {
    if (!candidates.length) throw new Error('Join Wi-Fi first, or use --usb for a seated tethered test.');
    console.log('Choose the laptop address reachable from Quest on the same Wi-Fi:');
    candidates.forEach((item, i) => console.log(`  ${i + 1}. ${item.address} (${item.name})`));
    if (candidates.length === 1) host = candidates[0].address;
    else {
      if (!process.stdin.isTTY) throw new Error('Choose an address with --host <laptop-ip>.');
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (await prompt.question('Address number: ')).trim();
        const selected = /^\d+$/.test(answer) ? candidates[Number(answer) - 1] : null;
        if (!selected) throw new Error('Choose one of the listed address numbers.');
        host = selected.address;
      } finally { prompt.close(); }
    }
  }
  process.env.BRIDGE_HOST = host;
  const port = Number(process.env.BRIDGE_PORT || 8787);
  const token = await loadBridgeToken();
  let server;
  try {
    server = await startBridge();
    if (usb) await run(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    await transferConnection(adb, serial, { bridgeUrl: `http://${host}:${port}`, bridgeToken: token });
    console.log('\nConnection sent to Quest. Open Connect → Check connection. Stop any running test first to apply it.');
    console.log(usb ? 'USB route: keep the cable connected for this seated test.' : 'Wi-Fi route: USB is no longer needed once the panel connects.');
    console.log('Keep this terminal open. Ctrl+C stops the bridge.');
    console.log('If the panel says demo: run npm run pair in another terminal, then restart this command.');
  } catch (error) {
    if (server) { server.close(); server.closeAllConnections(); }
    if (error.code === 'EADDRINUSE') throw new Error('The bridge port is already in use. Stop the old bridge terminal, then retry.');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

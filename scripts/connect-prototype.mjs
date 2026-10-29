import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { ConnectError, ConnectProbe, createLogin, waitForLogin, freshCredentials, loadCredentials, saveCredentials } from '../bridge/connect-prototype.mjs';

const credentialPath = fileURLToPath(new URL('../.state/connect-prototype/credentials.json', import.meta.url));
const reportPath = fileURLToPath(new URL('../.state/connect-prototype/report.json', import.meta.url));
const command = process.argv[2] || 'check';
try {
  if (command === 'login') {
    const credentials = await waitForLogin(createLogin(), { onReady(url) {
      console.log('Open this official T3 Connect sign-in page in your browser:\n' + url);
      console.log('Waiting up to ten minutes. The working Quest connection is unchanged.');
    } });
    await saveCredentials(credentialPath, credentials);
    console.log('Prototype login saved privately. Run npm run prototype:connect -- check.');
  } else if (command === 'check' || command === 'list') {
    const credentials = await freshCredentials(await loadCredentials(credentialPath));
    // Save rotated refresh tokens before contacting any environment.
    await saveCredentials(credentialPath, credentials);
    const probe = new ConnectProbe(credentials.accessToken);
    const environments = await probe.environments();
    const results = [];
    for (const environment of environments) {
      if (command === 'list') results.push({ environmentId: environment.environmentId, label: environment.label });
      else {
        try { results.push(await probe.inspect(environment)); }
        catch (error) { results.push({ environmentId: environment.environmentId, label: environment.label, status: 'unverified', error: error instanceof ConnectError ? error.message : 'Unexpected prototype failure.', ...(error instanceof ConnectError && error.reason ? { reason: error.reason } : {}) }); }
      }
    }
    const report = { checkedAt: new Date().toISOString(), mode: command, environments: results };
    await saveCredentials(reportPath, report);
    console.log(JSON.stringify(report, null, 2));
    if (!results.length) console.log('No account-linked environments found. The desktop may use LAN or SSH connections.');
    if (results.some(r => r.status === 'unverified')) process.exitCode = 1;
  } else if (command === 'forget') {
    await rm(credentialPath, { force: true });
    console.log('Local prototype credentials removed. Existing Quest and T3 credentials are unchanged.');
  } else throw new ConnectError('Use login, list, check, or forget.');
} catch (error) {
  console.error(error instanceof ConnectError ? error.message : 'Prototype failed. No existing connection was changed.');
  process.exitCode = 1;
}
